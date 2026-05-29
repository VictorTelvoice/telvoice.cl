import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import {
  createPanelSmsMessage,
  insertPanelDeliveryEvent,
  updatePanelSmsMessage,
} from "../panelSmsMessageService.js";
import { sendViaMockProvider } from "../mockSmsProviderService.js";
import { debitSmsUsage, getCompanyBalance } from "../smsWalletService.js";
import { calculateSmsSegments, validateRecipientNumber } from "../smsSegmentService.js";
import { createSmsCampaign } from "../smsCampaignService.js";
import type { StoredPendingAction } from "./pendingActions.js";

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

  const after = await getCompanyBalance(input.companyId);
  return (
    `Envío simulado confirmado a ${phone.normalized}.\n` +
    `Mensaje ID: ${pendingMessage.id}\n` +
    `Costo: ${segmentInfo.costSms} SMS · Saldo restante: ${after.availableSms.toLocaleString("es-CL")}.\n` +
    `Revisa /app/inbox.`
  );
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

        const params = new URLSearchParams({
          to,
          message,
          sender_id: senderId,
        });
        return (
          `Tu servidor está en modo **${env.smsProvider.mode}**. ` +
          `Por seguridad, completa el envío en el panel:\n` +
          `/app/send-sms?${params.toString()}\n\n` +
          `Costo estimado: ${String(pending.payload.costSms ?? "?")} SMS.`
        );
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
}): {
  to: string;
  message: string;
  senderId: string;
  costSms: number;
  confirmToken: string;
} {
  const seg = calculateSmsSegments(input.message);
  return {
    to: input.to,
    message: input.message,
    senderId: input.senderId ?? "TELVOICE",
    costSms: seg.costSms,
    confirmToken: randomUUID().slice(0, 8),
  };
}
