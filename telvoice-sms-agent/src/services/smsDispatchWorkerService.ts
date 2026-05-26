/**
 * Worker de cola — process-tick manual (superadmin) o scheduler automático.
 * Descontar saldo y actualizar mensaje panel al aceptar proveedor.
 */
import { env } from "../config/env.js";
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
import { getSmsProviderById } from "./smsProviderService.js";
import type { SmsSendQueueRow } from "../types/sms-traffic.js";
import {
  refreshCampaignStatusFromQueue,
  refreshProcessingCampaignsFromQueue,
} from "./smsCampaignQueueFinalizeService.js";
import {
  getNextQueuedMessages,
  markFailed,
  markProcessing,
  markSent,
  releaseStaleProcessingQueueItems,
  requeueForRetry,
} from "./smsQueueService.js";
import { debitSmsUsage, getCompanyBalance } from "./smsWalletService.js";
import { hasSmsDebitForMessage } from "./walletTransactionService.js";
import {
  assertCanSendNow,
  canSendNow,
  recordTpsSend,
  releaseConcurrency,
} from "./smsTpsLimiterService.js";
import { resolveTrafficPolicy } from "./smsTrafficPolicyService.js";

export type QueueTickResult = {
  processed: number;
  sent: number;
  deferred: number;
  failed: number;
  details: string[];
};

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

async function processOneQueuedItem(
  item: SmsSendQueueRow,
  workerId: string,
): Promise<ItemProcessOutcome> {
  if (!item.provider_id || !item.route_id || !item.company_id) {
    await markFailed(item.id, {
      code: "MISSING_ROUTING",
      message: "Falta proveedor o ruta en cola",
    });
    return { sent: false, deferred: false, failed: true, detail: `${item.id}: sin routing` };
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

  try {
    await markProcessing(item.id, workerId);
  } catch {
    return { sent: false, deferred: true, failed: false };
  }

  const provider = await getSmsProviderById(item.provider_id);
  if (!provider) {
    await markFailed(item.id, { code: "NO_PROVIDER", message: "Proveedor no encontrado" });
    return { sent: false, deferred: false, failed: true };
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
      if (item.attempts >= item.max_attempts) {
        await markFailed(item.id, {
          code: providerResult.error_code ?? "REJECTED",
          message: providerResult.error_message ?? "Proveedor rechazó",
        });
        await updatePanelSmsMessage(message.id, {
          status: "failed",
          error_code: providerResult.error_code ?? "PROVIDER_REJECTED",
          error_message:
            providerResult.error_message ?? "Proveedor rechazó el envío",
        });
        return { sent: false, deferred: false, failed: true };
      }
      await requeueForRetry(item.id);
      return {
        sent: false,
        deferred: true,
        failed: false,
        detail: `${item.id}: reintento pendiente`,
      };
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
    return { sent: true, deferred: false, failed: false, detail: `${item.id}: enviado` };
  } catch (err) {
    await markFailed(item.id, {
      code: "DISPATCH_ERROR",
      message: err instanceof Error ? err.message : "Error",
    });
    await updatePanelSmsMessage(message.id, {
      status: "failed",
      error_code: "DISPATCH_ERROR",
      error_message: err instanceof Error ? err.message : "Error de envío",
    });
    return { sent: false, deferred: false, failed: true };
  } finally {
    releaseConcurrency({
      companyId: item.company_id,
      providerId: item.provider_id,
      routeId: item.route_id,
    });
  }
}

export async function processQueueTick(
  limit = 5,
  workerId = "manual-tick",
): Promise<QueueTickResult> {
  const result: QueueTickResult = {
    processed: 0,
    sent: 0,
    deferred: 0,
    failed: 0,
    details: [],
  };

  const released = await releaseStaleProcessingQueueItems();
  if (released > 0) {
    result.details.push(`${released} ítem(s) processing liberados a cola`);
  }

  const batch = await getNextQueuedMessages(limit);
  // Un envío a la vez: aSMSC puede devolver «IP not Whitelisted» si llegan varios
  // SendSMS en paralelo aunque la IP esté autorizada (envíos individuales /app OK).
  const outcomes: ItemProcessOutcome[] = [];
  for (const item of batch) {
    outcomes.push(await processOneQueuedItem(item, workerId));
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
