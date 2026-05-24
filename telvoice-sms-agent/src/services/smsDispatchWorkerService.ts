/**
 * Worker de cola — solo invocado manualmente (POST process-tick).
 * No inicia loop automático. Opción B: descontar saldo al aceptar proveedor.
 *
 * Campañas masivas: conviene reservar saldo al encolar (futuro).
 */
import { getPanelSmsMessageById } from "./panelSmsMessageService.js";
import { dispatchProviderSend } from "./smsProviderDispatchService.js";
import { getSmsProviderById } from "./smsProviderService.js";
import {
  getNextQueuedMessages,
  markFailed,
  markProcessing,
  markSent,
} from "./smsQueueService.js";
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

const WORKER_ID = "manual-tick";

export async function processQueueTick(limit = 5): Promise<QueueTickResult> {
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
      await markProcessing(item.id, WORKER_ID);
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
          result.failed += 1;
        } else {
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
