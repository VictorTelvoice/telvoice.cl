/**
 * Worker de cola — process-tick manual (superadmin) o scheduler automático.
 * Descontar saldo y actualizar mensaje panel al aceptar proveedor.
 */
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
import {
  getNextQueuedMessages,
  markFailed,
  markProcessing,
  markSent,
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
    }
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

  const batch = await getNextQueuedMessages(limit);

  for (const item of batch) {
    result.processed += 1;

    if (!item.provider_id || !item.route_id || !item.company_id) {
      await markFailed(item.id, {
        code: "MISSING_ROUTING",
        message: "Falta proveedor o ruta en cola",
      });
      result.failed += 1;
      result.details.push(`${item.id}: sin routing`);
      continue;
    }

    const canSend = await canSendNow({
      companyId: item.company_id,
      providerId: item.provider_id,
      routeId: item.route_id,
      ratePlanId: item.rate_plan_id,
      trafficType: item.traffic_type,
      flow: "queue",
    });

    if (!canSend.allowed) {
      result.deferred += 1;
      result.details.push(
        `${item.id}: diferido — ${canSend.reason ?? "límite TPS"}`,
      );
      continue;
    }

    try {
      await markProcessing(item.id, workerId);
    } catch {
      result.deferred += 1;
      continue;
    }

    const provider = await getSmsProviderById(item.provider_id);
    if (!provider) {
      await markFailed(item.id, { code: "NO_PROVIDER", message: "Proveedor no encontrado" });
      result.failed += 1;
      continue;
    }

    const message = item.message_id
      ? await getPanelSmsMessageById(item.message_id)
      : null;

    if (!message) {
      await markFailed(item.id, {
        code: "NO_MESSAGE",
        message: "Mensaje panel no encontrado",
      });
      result.failed += 1;
      continue;
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
          result.failed += 1;
        } else {
          await requeueForRetry(item.id);
          result.deferred += 1;
          result.details.push(`${item.id}: reintento pendiente`);
        }
        releaseConcurrency({
          companyId: item.company_id,
          providerId: item.provider_id,
          routeId: item.route_id,
        });
        continue;
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
      } catch (finalizeErr) {
        await markFailed(item.id, {
          code: "FINALIZE_FAILED",
          message:
            finalizeErr instanceof Error
              ? finalizeErr.message
              : "Error al finalizar envío",
        });
        result.failed += 1;
        releaseConcurrency({
          companyId: item.company_id,
          providerId: item.provider_id,
          routeId: item.route_id,
        });
        continue;
      }

      await markSent(item.id);
      recordTpsSend({
        companyId: item.company_id,
        providerId: item.provider_id,
        routeId: item.route_id,
        ratePlanId: item.rate_plan_id,
      });
      result.sent += 1;
      result.details.push(`${item.id}: enviado`);
    } catch (err) {
      await markFailed(item.id, {
        code: "DISPATCH_ERROR",
        message: err instanceof Error ? err.message : "Error",
      });
      if (message) {
        await updatePanelSmsMessage(message.id, {
          status: "failed",
          error_code: "DISPATCH_ERROR",
          error_message: err instanceof Error ? err.message : "Error de envío",
        });
      }
      result.failed += 1;
    } finally {
      releaseConcurrency({
        companyId: item.company_id,
        providerId: item.provider_id,
        routeId: item.route_id,
      });
    }
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
