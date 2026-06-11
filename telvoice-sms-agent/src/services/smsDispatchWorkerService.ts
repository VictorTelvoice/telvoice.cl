/**
 * Worker de cola — process-tick manual (superadmin) o scheduler automático.
 * Descontar saldo y actualizar mensaje panel al aceptar proveedor.
 */
import { env } from "../config/env.js";
import { getEffectiveSchedulerConfigCached } from "./platformRuntimeSettingsService.js";
import { resolveCampaignQueueMinPaceMs } from "../utils/campaignQueuePace.js";
import type { PanelSmsMessageStatus } from "../types/sms-panel.js";
import {
  getPanelSmsMessageById,
  insertPanelDeliveryEvent,
  updatePanelSmsMessage,
} from "./panelSmsMessageService.js";
import {
  getCampaignByIdForCompany,
  updateSmsCampaign,
} from "./smsCampaignService.js";
import { dispatchProviderSend } from "./smsProviderDispatchService.js";
import { resolveHttpApiCredentials } from "./providerCredentialsService.js";
import { getSmsProviderById } from "./smsProviderService.js";
import type { SmsSendQueueRow } from "../types/sms-traffic.js";
import {
  refreshCampaignStatusFromQueue,
  refreshProcessingCampaignsFromQueue,
} from "./smsCampaignQueueFinalizeService.js";
import {
  getNextQueuedMessages,
  countProcessingByProvider,
  countProcessingByRoute,
  markFailed,
  markProcessing,
  markSent,
  releaseStaleProcessingQueueItems,
  requeueForRetry,
} from "./smsQueueService.js";
import {
  computeNextScheduledAt,
  isAttemptExhausted,
} from "./smsQueueRetryService.js";
import {
  releaseProviderDispatchLock,
  tryAcquireProviderDispatchLock,
} from "./smsProviderDispatchLock.js";
import { debitSmsUsage, getCompanyBalance } from "./smsWalletService.js";
import { hasSmsDebitForMessage } from "./walletTransactionService.js";
import {
  assertCanSendNow,
  canSendNow,
  recordTpsSend,
  releaseConcurrency,
} from "./smsTpsLimiterService.js";
import { resolveTrafficPolicy } from "./smsTrafficPolicyService.js";
import {
  extractEndpointHost,
  logProviderDispatchIssue,
  maskDispatchApiId,
} from "../utils/smsProviderDispatchLog.js";
import {
  IP_WHITELIST_FAIL_FAST_PANEL_METADATA,
  responseTextIncludesIpWhitelist,
} from "../utils/asmsc-hints.js";
import { canProcessLiveSmsQueue } from "../utils/dlr-callback.js";
import { resolveProviderRejectionStrategy } from "./providerRejectionPolicy.js";

export type QueueTickResult = {
  processed: number;
  sent: number;
  deferred: number;
  failed: number;
  details: string[];
};

const MAX_ATTEMPTS_EXHAUSTED_MSG = "Max attempts reached before provider call";

async function failQueueAndPanelMessage(
  item: SmsSendQueueRow,
  code: string,
  message: string,
  options?: { panelMetadata?: Record<string, unknown> },
): Promise<void> {
  await markFailed(item.id, { code, message });
  if (item.message_id) {
    await updatePanelSmsMessage(item.message_id, {
      status: "failed",
      error_code: code,
      error_message: message,
      ...(options?.panelMetadata
        ? { metadata: options.panelMetadata }
        : {}),
    });
  }
}

async function finalizeQueuedSend(input: {
  companyId: string;
  messageId: string;
  campaignId: string | null;
  costSms: number;
  panelStatus: PanelSmsMessageStatus;
  provider: string;
  providerMessageId: string | null;
  providerResult: Awaited<ReturnType<typeof dispatchProviderSend>>;
}): Promise<void> {
  const balance = await getCompanyBalance(input.companyId);
  if (balance.availableSms < input.costSms) {
    await updatePanelSmsMessage(input.messageId, {
      status: "failed",
      error_code: "INSUFFICIENT_BALANCE",
      error_message: "Saldo SMS insuficiente al procesar cola.",
    });
    throw new Error("Saldo SMS insuficiente");
  }

  if (!(await hasSmsDebitForMessage(input.messageId))) {
    await debitSmsUsage({
      companyId: input.companyId,
      amount: input.costSms,
      referenceType: "sms_message",
      referenceId: input.messageId,
      description: "Consumo por envío SMS desde cola programada",
      metadata: {
        mode: "queue",
        provider: input.provider,
      },
    });
  }

  const sentAt = new Date().toISOString();
  await updatePanelSmsMessage(input.messageId, {
    status: input.panelStatus,
    provider: input.provider,
    provider_message_id: input.providerMessageId,
    sent_at: sentAt,
    metadata: {
      asmsc_uid: input.providerResult.asmsc_uid ?? undefined,
      raw_response: input.providerResult.raw_response,
    },
  });

  await insertPanelDeliveryEvent({
    companyId: input.companyId,
    messageId: input.messageId,
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    status: input.panelStatus,
    rawPayload: {
      ...input.providerResult.raw_response,
      event: "queue_submit_accepted",
    },
  });

  if (input.campaignId) {
    const campaign = await getCampaignByIdForCompany(
      input.campaignId,
      input.companyId,
    );
    if (campaign) {
      await updateSmsCampaign(input.campaignId, {
        real_sms_cost: (campaign.real_sms_cost ?? 0) + input.costSms,
        status: "processing",
        sent_at: campaign.sent_at ?? sentAt,
      });
      await refreshCampaignStatusFromQueue(input.campaignId, input.companyId);
    }
  }
}

type ItemProcessOutcome = {
  sent: boolean;
  deferred: boolean;
  failed: boolean;
  detail?: string;
};

function shouldLogProviderIssue(
  errorMessage: string | null | undefined,
  rawResponse: Record<string, unknown>,
): boolean {
  if (responseTextIncludesIpWhitelist(errorMessage)) {
    return true;
  }
  return responseTextIncludesIpWhitelist(JSON.stringify(rawResponse));
}

async function handleProviderRejection(input: {
  item: SmsSendQueueRow;
  processingRow: SmsSendQueueRow;
  message: NonNullable<Awaited<ReturnType<typeof getPanelSmsMessageById>>>;
  provider: NonNullable<Awaited<ReturnType<typeof getSmsProviderById>>>;
  workerId: string;
  providerResult: Awaited<ReturnType<typeof dispatchProviderSend>>;
  effectiveTps?: number;
}): Promise<ItemProcessOutcome> {
  const { item, processingRow, message, provider, workerId, providerResult } =
    input;
  const maxAttempts = item.max_attempts ?? 3;
  const attemptAfterProcessing = processingRow.attempts ?? 0;
  const creds = resolveHttpApiCredentials(provider);
  const errMsg = providerResult.error_message ?? null;
  const rawResponse = providerResult.raw_response ?? {};

  const schedulerCfg = await getEffectiveSchedulerConfigCached();

  if (shouldLogProviderIssue(errMsg, rawResponse)) {
    logProviderDispatchIssue({
      providerId: item.provider_id!,
      routeId: item.route_id,
      queueId: item.id,
      messageId: message.id,
      campaignId: item.campaign_id,
      senderId: message.sender_id,
      phone: message.recipient_number,
      apiIdMasked: maskDispatchApiId(creds.apiId),
      endpointHost: extractEndpointHost(creds.baseUrl),
      attempt: attemptAfterProcessing,
      maxAttempts,
      workerSource: workerId,
      errorCode: providerResult.error_code ?? "REJECTED",
      errorMessage: errMsg,
      effectiveTps: input.effectiveTps,
      schedulerBatchSize: schedulerCfg.batchSize,
      remarks:
        typeof rawResponse.remarks === "string"
          ? rawResponse.remarks
          : null,
    });
  }

  const strategy = resolveProviderRejectionStrategy({
    errorMessage: errMsg,
    rawResponse,
    attemptAfterProcessing,
    maxAttempts,
  });

  if (strategy === "fail_fast_ip_whitelist") {
    // Test12/13: un envío cada ~3s. «IP not Whitelisted» suele ser ráfaga concurrente;
    // reintentar con el mismo pacing antes de marcar fallo terminal.
    if (attemptAfterProcessing < maxAttempts) {
      const paceMs = await resolveCampaignQueueMinPaceMs();
      const retryDelayMs = paceMs * Math.max(1, attemptAfterProcessing);
      const nextAt = new Date(Date.now() + retryDelayMs).toISOString();
      await requeueForRetry(item.id, nextAt);
      await updatePanelSmsMessage(message.id, {
        status: "queued",
        error_code: null,
        error_message: null,
        metadata: {
          ...(message.metadata ?? {}),
          provider_rejection_retry: "ip_whitelist_pace",
        },
      });
      return {
        sent: false,
        deferred: true,
        failed: false,
        detail: `${item.id}: IP whitelist — reintento en ${nextAt}`,
      };
    }
    const failCode = providerResult.error_code ?? "F";
    const failMsg = errMsg ?? "IP not Whitelisted";
    await failQueueAndPanelMessage(item, failCode, failMsg, {
      panelMetadata: {
        ...IP_WHITELIST_FAIL_FAST_PANEL_METADATA,
        raw_response: rawResponse,
      },
    });
    return {
      sent: false,
      deferred: false,
      failed: true,
      detail: `${item.id}: IP whitelist — intentos agotados`,
    };
  }

  if (strategy === "fail_terminal") {
    await failQueueAndPanelMessage(
      item,
      providerResult.error_code ?? "REJECTED",
      errMsg ?? "Proveedor rechazó",
      { panelMetadata: { raw_response: rawResponse } },
    );
    return { sent: false, deferred: false, failed: true };
  }

  const nextAt = computeNextScheduledAt(attemptAfterProcessing);
  await requeueForRetry(item.id, nextAt);
  return {
    sent: false,
    deferred: true,
    failed: false,
    detail: `${item.id}: reintento en ${nextAt}`,
  };
}

async function processOneQueuedItem(
  item: SmsSendQueueRow,
  workerId: string,
): Promise<ItemProcessOutcome> {
  if (!item.provider_id || !item.route_id || !item.company_id) {
    await markFailed(item.id, {
      code: "MISSING_ROUTING",
      message: "Falta proveedor o ruta en cola",
    });
    return {
      sent: false,
      deferred: false,
      failed: true,
      detail: `${item.id}: sin routing`,
    };
  }

  const maxAttempts = item.max_attempts ?? 3;
  const attemptsBefore = item.attempts ?? 0;

  if (isAttemptExhausted(attemptsBefore, maxAttempts)) {
    await failQueueAndPanelMessage(
      item,
      "MAX_ATTEMPTS",
      MAX_ATTEMPTS_EXHAUSTED_MSG,
    );
    return {
      sent: false,
      deferred: false,
      failed: true,
      detail: `${item.id}: ${MAX_ATTEMPTS_EXHAUSTED_MSG}`,
    };
  }

  const queueFlow = item.campaign_id ? "campaign" : "queue";

  const canSend = await canSendNow({
    companyId: item.company_id,
    providerId: item.provider_id,
    routeId: item.route_id,
    ratePlanId: item.rate_plan_id,
    trafficType: item.traffic_type,
    flow: queueFlow,
  });

  if (!canSend.allowed) {
    return {
      sent: false,
      deferred: true,
      failed: false,
      detail: `${item.id}: diferido — ${canSend.reason ?? "límite TPS"}`,
    };
  }

  if (!tryAcquireProviderDispatchLock(item.provider_id)) {
    return {
      sent: false,
      deferred: true,
      failed: false,
      detail: `${item.id}: diferido — proveedor ocupado (serialización)`,
    };
  }

  const queueWebhook = canProcessLiveSmsQueue();
  if (!queueWebhook.allowed) {
    return {
      sent: false,
      deferred: true,
      failed: false,
      detail: `${item.id}: diferido — ${queueWebhook.reason}`,
    };
  }

  try {
    let processingRow: SmsSendQueueRow;
    try {
      processingRow = await markProcessing(item.id, workerId);
    } catch {
      return { sent: false, deferred: true, failed: false };
    }

    const provider = await getSmsProviderById(item.provider_id);
    if (!provider) {
      await markFailed(item.id, {
        code: "NO_PROVIDER",
        message: "Proveedor no encontrado",
      });
      return { sent: false, deferred: false, failed: true };
    }

    // Protección multi-instancia: el lock por proveedor (in-process) no evita
    // que 2 procesos distintos envíen en paralelo. aSMSC suele responder
    // «IP not Whitelisted» en ráfagas concurrentes aunque la IP esté OK.
    if (provider.code === "asmsc") {
      const [provInFlight, routeInFlight] = await Promise.all([
        countProcessingByProvider(item.provider_id),
        item.route_id ? countProcessingByRoute(item.route_id) : Promise.resolve(0),
      ]);
      if (provInFlight > 1 || routeInFlight > 1) {
        await requeueForRetry(item.id, new Date(Date.now() + 1_000).toISOString());
        return {
          sent: false,
          deferred: true,
          failed: false,
          detail: `${item.id}: diferido — control concurrencia aSMSC`,
        };
      }
    }

    const message = item.message_id
      ? await getPanelSmsMessageById(item.message_id)
      : null;

    if (!message) {
      await markFailed(item.id, {
        code: "NO_MESSAGE",
        message: "Mensaje panel no encontrado",
      });
      return { sent: false, deferred: false, failed: true };
    }

    try {
      const providerResult = await dispatchProviderSend(provider, {
        to: message.recipient_number,
        message: message.message,
        senderId: message.sender_id ?? "TELVOICE",
        metadata: { panel_message_id: message.id, queue_id: item.id },
      });

      if (!providerResult.accepted) {
        return handleProviderRejection({
          item,
          processingRow,
          message,
          provider,
          workerId,
          providerResult,
          effectiveTps: canSend.effectiveTps,
        });
      }

      const panelStatus: PanelSmsMessageStatus =
        providerResult.status === "pending" ? "pending" : "sent";

      try {
        await finalizeQueuedSend({
          companyId: item.company_id,
          messageId: message.id,
          campaignId: message.campaign_id,
          costSms: message.cost_sms,
          panelStatus,
          provider: providerResult.provider,
          providerMessageId: providerResult.provider_message_id ?? null,
          providerResult,
        });
      } catch {
        await markFailed(item.id, {
          code: "FINALIZE_FAILED",
          message: "Error al finalizar envío",
        });
        return { sent: false, deferred: false, failed: true };
      }

      await markSent(item.id);
      recordTpsSend({
        companyId: item.company_id,
        providerId: item.provider_id,
        routeId: item.route_id,
        ratePlanId: item.rate_plan_id,
      });
      return {
        sent: true,
        deferred: false,
        failed: false,
        detail: `${item.id}: enviado`,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Error";
      const attemptAfterProcessing = processingRow.attempts ?? 0;

      if (attemptAfterProcessing >= maxAttempts) {
        await failQueueAndPanelMessage(item, "DISPATCH_ERROR", errMsg);
        return { sent: false, deferred: false, failed: true };
      }

      const nextAt = computeNextScheduledAt(attemptAfterProcessing);
      await requeueForRetry(item.id, nextAt);
      await updatePanelSmsMessage(message.id, {
        status: "queued",
        error_code: null,
        error_message: null,
      });
      return {
        sent: false,
        deferred: true,
        failed: false,
        detail: `${item.id}: error dispatch, reintento en ${nextAt}`,
      };
    } finally {
      releaseConcurrency({
        companyId: item.company_id,
        providerId: item.provider_id,
        routeId: item.route_id,
      });
    }
  } finally {
    releaseProviderDispatchLock(item.provider_id);
  }
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function processQueueTick(
  limit = 5,
  workerId = "manual-tick",
): Promise<QueueTickResult> {
  const schedCfg = await getEffectiveSchedulerConfigCached();
  const result: QueueTickResult = {
    processed: 0,
    sent: 0,
    deferred: 0,
    failed: 0,
    details: [],
  };

  const queueWebhook = canProcessLiveSmsQueue();
  if (!queueWebhook.allowed) {
    result.details.push(`Cola live omitida: ${queueWebhook.reason}`);
    return result;
  }

  const released = await releaseStaleProcessingQueueItems();
  if (released > 0) {
    result.details.push(`${released} ítem(s) processing liberados a cola`);
  }

  const batch = await getNextQueuedMessages(limit);
  const outcomes: ItemProcessOutcome[] = [];
  let asmscSentThisTick = 0;
  for (const item of batch) {
    let isAsmsc = false;
    if (item.provider_id) {
      const provider = await getSmsProviderById(item.provider_id);
      isAsmsc = provider?.code === "asmsc";
      if (isAsmsc) {
        if (asmscSentThisTick >= schedCfg.asmscMaxSendsPerTick) {
          result.deferred += 1;
          result.details.push(
            `${item.id}: diferido — tope ${schedCfg.asmscMaxSendsPerTick} aSMSC/tick`,
          );
          continue;
        }
        const inflight = await countProcessingByProvider(item.provider_id);
        if (inflight > 0) {
          result.deferred += 1;
          result.details.push(
            `${item.id}: diferido — aSMSC en vuelo (otro proceso o envío previo)`,
          );
          continue;
        }
        if (asmscSentThisTick > 0) {
          await sleepMs(schedCfg.asmscInterSendMs);
        }
      }
    }
    const outcome = await processOneQueuedItem(item, workerId);
    if (isAsmsc && outcome.sent) {
      asmscSentThisTick += 1;
    }
    outcomes.push(outcome);
  }

  for (const outcome of outcomes) {
    result.processed += 1;
    if (outcome.sent) result.sent += 1;
    if (outcome.deferred) result.deferred += 1;
    if (outcome.failed) result.failed += 1;
    if (outcome.detail) result.details.push(outcome.detail);
  }

  const campaignIds = new Set(
    batch
      .map((item) => item.campaign_id)
      .filter((id): id is string => Boolean(id)),
  );
  for (const campaignId of campaignIds) {
    const companyId = batch.find((i) => i.campaign_id === campaignId)?.company_id;
    if (companyId) {
      await refreshCampaignStatusFromQueue(campaignId, companyId);
    }
  }

  const finalized = await refreshProcessingCampaignsFromQueue();
  if (finalized > 0) {
    result.details.push(`${finalized} campaña(s) finalizadas desde cola`);
  }

  return result;
}

/** Integración live_test: política + TPS antes del envío inmediato. */
export async function assertLiveTestTrafficAllowed(input: {
  companyId: string;
  routeId: string;
  providerId: string;
  ratePlanId: string;
  segmentCost: number;
}): Promise<void> {
  await resolveTrafficPolicy({
    companyId: input.companyId,
    routeId: input.routeId,
    providerId: input.providerId,
    ratePlanId: input.ratePlanId,
  });

  await assertCanSendNow({
    companyId: input.companyId,
    providerId: input.providerId,
    routeId: input.routeId,
    ratePlanId: input.ratePlanId,
    flow: "live_test",
    segmentCost: input.segmentCost,
  });
}

/** Campaña masiva por cola: política comercial + TPS (sin pacing entre destinos). */
export async function assertCampaignTrafficAllowed(input: {
  companyId: string;
  routeId: string;
  providerId: string;
  ratePlanId: string;
  segmentCost: number;
}): Promise<void> {
  const trafficType = env.smsCampaign.trafficType;

  await resolveTrafficPolicy({
    companyId: input.companyId,
    routeId: input.routeId,
    providerId: input.providerId,
    ratePlanId: input.ratePlanId,
    trafficType,
  });

  await assertCanSendNow({
    companyId: input.companyId,
    providerId: input.providerId,
    routeId: input.routeId,
    ratePlanId: input.ratePlanId,
    trafficType,
    flow: "campaign",
    segmentCost: input.segmentCost,
  });
}

/** Configuración del scheduler (lectura para UI/diagnóstico). */
export function getSmsQueueSchedulerConfig(): {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
} {
  return {
    enabled: env.smsQueueScheduler.enabled,
    intervalSeconds: env.smsQueueScheduler.intervalSeconds,
    batchSize: env.smsQueueScheduler.batchSize,
  };
}
