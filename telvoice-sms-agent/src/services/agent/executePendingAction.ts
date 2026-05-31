import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { APP_CLIENT_LIVE_SOURCE } from "../../constants/panel-sms-mode.js";
import { AppError } from "../../utils/errors.js";
import { sendPanelSms } from "../smsSendService.js";
import { sendPanelCampaign } from "../smsPanelCampaignSendService.js";
import {
  createPanelSmsMessage,
  insertPanelDeliveryEvent,
  updatePanelSmsMessage,
} from "../panelSmsMessageService.js";
import { sendViaMockProvider } from "../mockSmsProviderService.js";
import { debitSmsUsage, getCompanyBalance } from "../smsWalletService.js";
import { calculateSmsSegments, validateRecipientNumber } from "../smsSegmentService.js";
import { createSmsCampaign, updateSmsCampaign } from "../smsCampaignService.js";
import { displayPhoneChile } from "./agentPanelCsvService.js";
import type { StoredPendingAction } from "./pendingActions.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AGENT_SEND_SAFE_ERROR =
  "No pude completar el envío por un problema interno de validación. El equipo Telvoice puede revisarlo con el registro de esta operación. No se descontó saldo si el envío no fue aceptado.";

/** Clave idempotente válida para sendPanelSms / sendPanelCampaign (UUID v4). */
export function resolvePendingActionIdempotencyKey(pendingId: string): string {
  const id = pendingId.trim();
  if (UUID_RE.test(id)) {
    return id;
  }
  return randomUUID();
}

function fmtSmsCount(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("es-CL");
}

export type AgentConfirmBalanceInput = {
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  smsConsumed?: number | null;
  smsEstimated?: number | null;
};

/** Deriva saldo/consumo cuando el proveedor aún no debitó todo (cola masiva). */
export function resolveAgentConfirmBalances(
  input: AgentConfirmBalanceInput,
): { balanceBefore: number; smsConsumed: number; balanceAfter: number } {
  let balanceBefore = Number(input.balanceBefore ?? 0);
  let balanceAfter =
    input.balanceAfter != null ? Number(input.balanceAfter) : Number.NaN;
  let smsConsumed = Number(input.smsConsumed ?? 0);
  const smsEstimated = Number(input.smsEstimated ?? 0);

  if (smsConsumed <= 0 && smsEstimated > 0) {
    smsConsumed = smsEstimated;
  }
  if (Number.isNaN(balanceAfter)) {
    balanceAfter =
      balanceBefore > 0
        ? Math.max(0, balanceBefore - smsConsumed)
        : 0;
  }
  if (smsConsumed <= 0 && balanceBefore > 0 && balanceAfter >= 0) {
    smsConsumed = Math.max(0, balanceBefore - balanceAfter);
  }
  if (balanceBefore <= 0 && balanceAfter >= 0 && smsConsumed > 0) {
    balanceBefore = balanceAfter + smsConsumed;
  }

  return {
    balanceBefore: Math.max(0, balanceBefore),
    smsConsumed: Math.max(0, smsConsumed),
    balanceAfter: Math.max(0, balanceAfter),
  };
}

function formatBalanceBlock(
  balances: ReturnType<typeof resolveAgentConfirmBalances>,
): string {
  return (
    `Saldo antes del envío: ${fmtSmsCount(balances.balanceBefore)} SMS\n` +
    `SMS consumidos: ${fmtSmsCount(balances.smsConsumed)}\n` +
    `Saldo actual: ${fmtSmsCount(balances.balanceAfter)} SMS`
  );
}

export function formatAgentCampaignAcceptedMessage(input: {
  validContacts: number;
  queued: number;
  smsEstimated: number;
  referenceId: string;
  balances: AgentConfirmBalanceInput;
  pending?: StoredPendingAction;
}): string {
  const balances = resolveAgentConfirmBalances({
    balanceBefore:
      input.balances.balanceBefore ??
      (input.pending?.payload.balance_before != null
        ? Number(input.pending.payload.balance_before)
        : undefined),
    balanceAfter:
      input.balances.balanceAfter ??
      (input.pending?.payload.balance_after_estimated != null
        ? Number(input.pending.payload.balance_after_estimated)
        : undefined),
    smsConsumed: input.balances.smsConsumed,
    smsEstimated: input.smsEstimated ?? input.balances.smsEstimated,
  });

  return (
    `Campaña aceptada.\n\n` +
    `${formatBalanceBlock(balances)}\n\n` +
    `Contactos válidos: ${fmtSmsCount(input.validContacts)}\n` +
    `Mensajes en cola: ${fmtSmsCount(input.queued)}\n` +
    `SMS estimados: ${fmtSmsCount(input.smsEstimated)}\n\n` +
    `Puedes revisar el avance en Bandeja o Campañas.\n` +
    `Referencia: ${input.referenceId}`
  );
}

export function formatAgentSingleSmsAcceptedMessage(input: {
  destination: string;
  statusLine: string;
  balances: AgentConfirmBalanceInput;
  pending?: StoredPendingAction;
}): string {
  const payload = input.pending?.payload;
  const payloadCost =
    payload?.costSms != null
      ? Number(payload.costSms)
      : payload?.segments != null
        ? Number(payload.segments)
        : undefined;

  const balances = resolveAgentConfirmBalances({
    balanceBefore:
      input.balances.balanceBefore ??
      (payload?.balance_before != null
        ? Number(payload.balance_before)
        : undefined),
    balanceAfter: input.balances.balanceAfter,
    smsConsumed: input.balances.smsConsumed ?? payloadCost,
    smsEstimated: input.balances.smsEstimated ?? payloadCost,
  });

  const digits = input.destination.replace(/\D/g, "");
  const dest = digits.length >= 10 ? displayPhoneChile(digits) : input.destination;

  return (
    `SMS aceptado.\n\n` +
    `${formatBalanceBlock(balances)}\n\n` +
    `Destino: ${dest}\n` +
    `Estado: ${input.statusLine}\n\n` +
    `Puedes revisar el estado en Bandeja.`
  );
}

function resolveCampaignSmsEstimate(
  pending: StoredPendingAction,
  result: {
    smsConsumed: number;
    queued: number;
    totalRecipients: number;
  },
): number {
  const fromPayload = Number(pending.payload.estimated_total_sms ?? 0);
  if (fromPayload > 0) {
    return fromPayload;
  }
  if (result.smsConsumed > 0) {
    return result.smsConsumed;
  }
  const perContact = Number(pending.payload.segments_per_contact ?? 1);
  if (result.queued > 0) {
    return result.queued * perContact;
  }
  return result.totalRecipients * perContact;
}

function logAgentSendFailure(pending: StoredPendingAction, err: unknown): void {
  const technical = err instanceof Error ? err.message : String(err ?? "");
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(
    "[agent-send]",
    JSON.stringify({
      pending_action_id: pending.id,
      company_id: pending.context.companyId,
      user_id: pending.context.userId,
      channel: pending.context.channel,
      action_type: pending.type,
      session_id: pending.context.sessionId,
      error: technical,
      stack,
      phase: "execute_before_provider_accept",
    }),
  );
}

export function formatAgentSmsSendError(
  err: unknown,
  pending?: StoredPendingAction,
): string {
  if (pending) {
    logAgentSendFailure(pending, err);
  }
  const technical = err instanceof Error ? err.message : String(err ?? "");
  if (/idempotency|uuid\s+válido|uuid valido/i.test(technical)) {
    return AGENT_SEND_SAFE_ERROR;
  }
  if (err instanceof AppError) {
    const msg = err.message;
    if (/idempotency|uuid\s+válido|uuid valido/i.test(msg)) {
      return AGENT_SEND_SAFE_ERROR;
    }
    if (/saldo|insuficiente|wallet/i.test(msg)) {
      return "No tienes saldo suficiente para este envío. Puedo ayudarte a comprar más SMS.";
    }
    if (/proveedor|provider|rechaz|no aceptó/i.test(msg)) {
      return `El proveedor rechazó el SMS. Motivo: ${msg}`;
    }
    if (err.statusCode >= 500) {
      return AGENT_SEND_SAFE_ERROR;
    }
    if (err.statusCode >= 400 && !/idempotency/i.test(msg)) {
      return msg;
    }
    return AGENT_SEND_SAFE_ERROR;
  }
  return AGENT_SEND_SAFE_ERROR;
}

async function executeMockSingleSms(input: {
  companyId: string;
  userId: string | null;
  to: string;
  message: string;
  senderId: string;
}): Promise<string> {
  const phone = validateRecipientNumber(input.to);
  if (!phone.ok || !phone.normalized) {
    throw new AppError(phone.error ?? "Número inválido.", 400);
  }

  const segmentInfo = calculateSmsSegments(input.message);
  const balance = await getCompanyBalance(input.companyId);
  if (balance.availableSms < segmentInfo.costSms) {
    throw new AppError(
      "Saldo insuficiente. Compra más SMS en /app/buy-sms antes de enviar.",
      400,
    );
  }

  const campaign = await createSmsCampaign({
    companyId: input.companyId,
    name: `Agente panel ${new Date().toISOString().slice(0, 16)}`,
    message: input.message,
    senderId: input.senderId,
    status: "draft",
    estimatedSmsCost: segmentInfo.costSms,
    createdBy: input.userId,
    metadata: { source: "panel_agent_send" },
  });

  const pendingMessage = await createPanelSmsMessage({
    companyId: input.companyId,
    campaignId: campaign.id,
    recipientNumber: phone.normalized,
    senderId: input.senderId,
    message: input.message,
    segments: segmentInfo.segments,
    costSms: segmentInfo.costSms,
    status: "queued",
    mode: "mock",
    provider: "mock",
    metadata: {
      source: "panel_agent",
      encoding: segmentInfo.encoding,
    },
  });

  const mockResult = sendViaMockProvider({
    to: phone.normalized,
    from: input.senderId,
    message: input.message,
    segments: segmentInfo.segments,
  });

  await updatePanelSmsMessage(pendingMessage.id, {
    status: "delivered",
    provider_message_id: mockResult.providerMessageId,
    sent_at: mockResult.sentAt,
    delivered_at: new Date(Date.now() + 500).toISOString(),
  });

  await insertPanelDeliveryEvent({
    companyId: input.companyId,
    messageId: pendingMessage.id,
    provider: "mock",
    providerMessageId: mockResult.providerMessageId,
    status: "delivered",
    rawPayload: { source: "panel_agent", simulated: true },
  });

  await debitSmsUsage({
    companyId: input.companyId,
    amount: segmentInfo.costSms,
    referenceType: "sms_message",
    referenceId: pendingMessage.id,
    description: `Consumo SMS agente panel (mock)`,
    actorUserId: input.userId,
  });

  const balanceAfter = (await getCompanyBalance(input.companyId)).availableSms;
  return formatAgentSingleSmsAcceptedMessage({
    destination: phone.normalized,
    statusLine: "En cola (simulación)",
    balances: {
      balanceBefore: balance.availableSms,
      balanceAfter,
      smsConsumed: segmentInfo.costSms,
    },
  });
}

async function executeMockCampaignCsv(input: {
  companyId: string;
  userId: string | null;
  message: string;
  senderId: string;
  recipients: string[];
  campaignName: string;
}): Promise<string> {
  const segmentInfo = calculateSmsSegments(input.message);
  const totalCost = input.recipients.length * segmentInfo.costSms;
  const balance = await getCompanyBalance(input.companyId);
  if (balance.availableSms < totalCost) {
    throw new AppError(
      "Saldo insuficiente. Compra más SMS en /app/buy-sms antes de enviar.",
      400,
    );
  }

  const campaign = await createSmsCampaign({
    companyId: input.companyId,
    name: input.campaignName,
    message: input.message,
    senderId: input.senderId,
    status: "processing",
    estimatedSmsCost: totalCost,
    createdBy: input.userId,
    metadata: { source: "panel_agent_csv", mode: "mock" },
  });

  let queued = 0;
  for (const raw of input.recipients.slice(0, 500)) {
    const phone = validateRecipientNumber(raw);
    if (!phone.ok || !phone.normalized) {
      continue;
    }
    const pendingMessage = await createPanelSmsMessage({
      companyId: input.companyId,
      campaignId: campaign.id,
      recipientNumber: phone.normalized,
      senderId: input.senderId,
      message: input.message,
      segments: segmentInfo.segments,
      costSms: segmentInfo.costSms,
      status: "queued",
      mode: "mock",
      provider: "mock",
      metadata: { source: "panel_agent_csv" },
    });
    const mockResult = sendViaMockProvider({
      to: phone.normalized,
      from: input.senderId,
      message: input.message,
      segments: segmentInfo.segments,
    });
    await updatePanelSmsMessage(pendingMessage.id, {
      status: "delivered",
      provider_message_id: mockResult.providerMessageId,
      sent_at: mockResult.sentAt,
    });
    await debitSmsUsage({
      companyId: input.companyId,
      amount: segmentInfo.costSms,
      referenceType: "sms_message",
      referenceId: pendingMessage.id,
      description: "Consumo SMS agente CSV (mock)",
      actorUserId: input.userId,
    });
    queued += 1;
  }

  await updateSmsCampaign(campaign.id, {
    status: "completed",
    real_sms_cost: totalCost,
  });

  const after = await getCompanyBalance(input.companyId);
  return formatAgentCampaignAcceptedMessage({
    validContacts: queued,
    queued,
    smsEstimated: totalCost,
    referenceId: campaign.id,
    balances: {
      balanceBefore: balance.availableSms,
      balanceAfter: after.availableSms,
      smsConsumed: totalCost,
      smsEstimated: totalCost,
    },
  });
}

export async function executePendingAction(
  pending: StoredPendingAction,
): Promise<string> {
  const { companyId, userId } = pending.context;

  switch (pending.type) {
      case "send_single_sms": {
        const to = String(pending.payload.to ?? "");
        const message = String(pending.payload.message ?? "");
        const senderId = String(pending.payload.senderId ?? "TELVOICE");

        if (env.smsProvider.mode === "mock") {
          return await executeMockSingleSms({
            companyId,
            userId,
            to,
            message,
            senderId,
          });
        }

        try {
          const idempotencyKey = resolvePendingActionIdempotencyKey(pending.id);
          const result = await sendPanelSms({
            companyId,
            to,
            message,
            senderId,
            createdBy: userId,
            sendSource: APP_CLIENT_LIVE_SOURCE,
            idempotencyKey,
          });
          return formatAgentSingleSmsAcceptedMessage({
            destination: result.recipientNumber,
            statusLine: "En cola / enviado a proveedor",
            balances: {
              balanceBefore: result.balanceBefore,
              balanceAfter: result.balanceAfter,
              smsConsumed: result.segments,
            },
            pending,
          });
        } catch (err) {
          return formatAgentSmsSendError(err, pending);
        }
      }

      case "send_campaign_csv": {
        const message = String(pending.payload.message ?? "");
        const senderId = String(pending.payload.sender_id ?? "TELVOICE");
        const recipients = (pending.payload.valid_recipients as string[]) ?? [];
        const campaignName = String(
          pending.payload.campaign_name ?? `Agente CSV ${new Date().toISOString().slice(0, 10)}`,
        );

        if (env.smsProvider.mode === "mock") {
          return await executeMockCampaignCsv({
            companyId,
            userId,
            message,
            senderId,
            recipients,
            campaignName,
          });
        }

        try {
          const idempotencyKey = resolvePendingActionIdempotencyKey(pending.id);
          const result = await sendPanelCampaign({
            companyId,
            senderId,
            message,
            recipients,
            campaignName,
            mode: "mass",
            createdBy: userId,
            sendSource: "app_send_sms_campaign",
            idempotencyKey,
          });
          const smsEstimate = resolveCampaignSmsEstimate(pending, result);
          return formatAgentCampaignAcceptedMessage({
            validContacts: result.totalRecipients,
            queued: result.queued,
            smsEstimated: smsEstimate,
            referenceId: result.campaignId,
            balances: {
              balanceBefore: result.balanceBefore,
              balanceAfter: result.balanceAfter,
              smsConsumed: result.smsConsumed,
              smsEstimated: smsEstimate,
            },
            pending,
          });
        } catch (err) {
          return formatAgentSmsSendError(err, pending);
        }
      }

      case "launch_campaign": {
        const campaignId = String(pending.payload.campaignId ?? "");
        return (
          `Para lanzar la campaña confirma en el panel (requiere permisos de operador):\n` +
          `/app/campaigns/${campaignId}\n\n` +
          `Costo estimado: ${String(pending.payload.estimatedCost ?? "?")} SMS.`
        );
      }

      case "create_checkout": {
        return (
          `Abre /app/buy-sms para pagar ${String(pending.payload.quantity ?? "")} SMS ` +
          `con MercadoPago cuando esté disponible.`
        );
      }

      default:
        return "Acción no reconocida.";
    }
}

export function buildSendSmsPendingPayload(input: {
  to: string;
  message: string;
  senderId?: string;
  segments?: number;
  estimatedCost?: number;
  companyId?: string;
  companyLabel?: string;
}): {
  to: string;
  message: string;
  senderId: string;
  costSms: number;
  segments: number;
  companyId?: string;
  companyLabel?: string;
  confirmToken: string;
} {
  const seg = calculateSmsSegments(input.message);
  return {
    to: input.to,
    message: input.message,
    senderId: input.senderId ?? "TELVOICE",
    costSms: input.estimatedCost ?? seg.costSms,
    segments: input.segments ?? seg.segments,
    companyId: input.companyId,
    companyLabel: input.companyLabel,
    confirmToken: randomUUID().slice(0, 8),
  };
}
