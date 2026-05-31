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

  return (
    `SMS aceptado.\n\n` +
    `Destino: ${phone.normalized.replace(/\D/g, "").replace(/^56/, "569").slice(0, 11)}\n` +
    `Estado: Enviado a cola (simulación)\n` +
    `Referencia: ${pendingMessage.id}\n` +
    `Crédito consumido/estimado: ${segmentInfo.costSms} SMS\n\n` +
    `Puedes revisar el estado en Bandeja.`
  );
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
  return (
    `Campaña aceptada.\n\n` +
    `Contactos válidos: ${queued.toLocaleString("es-CL")}\n` +
    `Mensajes en cola: ${queued.toLocaleString("es-CL")}\n` +
    `SMS estimados: ${totalCost.toLocaleString("es-CL")}\n` +
    `Crédito disponible después del envío: ${after.availableSms.toLocaleString("es-CL")} SMS\n\n` +
    `Puedes revisar el avance en Bandeja o Campañas.\n` +
    `Referencia campaña: ${campaign.id}`
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

        try {
          const result = await sendPanelSms({
            companyId,
            to,
            message,
            senderId,
            createdBy: userId,
            sendSource: APP_CLIENT_LIVE_SOURCE,
            idempotencyKey: `agent-pending-${pending.id}`,
          });
          return (
            `SMS aceptado.\n\n` +
            `Destino: ${result.recipientNumber.replace(/\D/g, "").replace(/^\+?56/, "56")}\n` +
            `Estado: Enviado a cola/proveedor\n` +
            `Referencia: ${result.messageId}\n` +
            `Crédito consumido/estimado: ${result.segments} SMS\n\n` +
            `Puedes revisar el estado en Bandeja.`
          );
        } catch (err) {
          return formatAgentSmsSendError(err);
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
          const result = await sendPanelCampaign({
            companyId,
            senderId,
            message,
            recipients,
            campaignName,
            mode: "mass",
            createdBy: userId,
            sendSource: "app_send_sms_campaign",
            idempotencyKey: `agent-csv-${pending.id}`,
          });
          return (
            `Campaña aceptada.\n\n` +
            `Contactos válidos: ${result.totalRecipients.toLocaleString("es-CL")}\n` +
            `Mensajes en cola: ${result.queued.toLocaleString("es-CL")}\n` +
            `SMS estimados: ${result.smsConsumed.toLocaleString("es-CL")}\n` +
            `Crédito disponible después del envío: ${result.balanceAfter.toLocaleString("es-CL")} SMS\n\n` +
            `Puedes revisar el avance en Bandeja o Campañas.\n` +
            `Referencia: ${result.campaignId}`
          );
        } catch (err) {
          return formatAgentSmsSendError(err);
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

function formatAgentSmsSendError(err: unknown): string {
  if (err instanceof AppError) {
    const msg = err.message;
    if (/saldo|insuficiente|wallet/i.test(msg)) {
      return "No tienes saldo suficiente para este envío. Puedo ayudarte a comprar más SMS.";
    }
    if (/proveedor|provider|rechaz|no aceptó/i.test(msg)) {
      return `El proveedor rechazó el SMS. Motivo: ${msg}`;
    }
    return msg;
  }
  return "El proveedor rechazó el SMS. Revisa la configuración de tu cuenta o contacta soporte.";
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
