import type { CompanyRow } from "../types/tenant.js";
import type { MockSmsSendResult } from "../types/sms-panel.js";
import { findCompanyById } from "./companyService.js";
import { sendViaMockProvider } from "./mockSmsProviderService.js";
import {
  createPanelSmsMessage,
  getPanelSmsMessageById,
  insertPanelDeliveryEvent,
  updatePanelSmsMessage,
} from "./panelSmsMessageService.js";
import {
  calculateSmsSegments,
  validateRecipientNumber,
} from "./smsSegmentService.js";
import { createSmsCampaign, updateSmsCampaign } from "./smsCampaignService.js";
import {
  debitSmsUsage,
  getCompanyBalance,
  getOrCreateCompanyWallet,
} from "./smsWalletService.js";
import {
  hasSmsDebitForMessage,
} from "./walletTransactionService.js";
import { AppError } from "../utils/errors.js";

export type SendMockSmsInput = {
  companyId: string;
  senderId: string;
  to: string;
  message: string;
  campaignName?: string | null;
  createdBy?: string | null;
};

async function assertCompanyCanSend(companyId: string): Promise<CompanyRow> {
  const company = await findCompanyById(companyId);
  if (!company) {
    throw new AppError("Empresa no encontrada.", 404);
  }
  if (company.status !== "active") {
    throw new AppError(
      `La cuenta empresa está en estado «${company.status}»; no permite envíos.`,
      403,
    );
  }
  return company;
}

export async function sendMockSms(
  input: SendMockSmsInput,
): Promise<MockSmsSendResult> {
  const messageText = String(input.message ?? "").trim();
  if (!messageText) {
    throw new AppError("El mensaje no puede estar vacío.", 400);
  }

  const senderId = String(input.senderId ?? "").trim();
  if (!senderId) {
    throw new AppError("El remitente (Sender ID) es obligatorio.", 400);
  }

  await assertCompanyCanSend(input.companyId);

  const phone = validateRecipientNumber(input.to);
  if (!phone.ok || !phone.normalized) {
    throw new AppError(phone.error ?? "Número inválido.", 400);
  }

  const segmentInfo = calculateSmsSegments(messageText);
  if (segmentInfo.segments < 1) {
    throw new AppError("El mensaje no genera segmentos válidos.", 400);
  }

  const wallet = await getOrCreateCompanyWallet(input.companyId);
  if (wallet.status !== "active") {
    throw new AppError(
      `Wallet en estado «${wallet.status}»; no permite envíos.`,
      403,
    );
  }

  const balanceBefore = wallet.available_sms;
  if (balanceBefore < segmentInfo.costSms) {
    throw new AppError(
      "No tienes saldo SMS suficiente para procesar este envío. Compra una nueva bolsa o reduce el mensaje.",
      400,
    );
  }

  const campaignName =
    input.campaignName?.trim() ||
    `Envío individual ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  const campaign = await createSmsCampaign({
    companyId: input.companyId,
    name: campaignName,
    senderId,
    message: messageText,
    status: "processing",
    totalRecipients: 1,
    validRecipients: 1,
    invalidRecipients: 0,
    estimatedSmsCost: segmentInfo.costSms,
    realSmsCost: 0,
    mode: "mock",
    createdBy: input.createdBy ?? null,
    metadata: { source: "app_send_sms", mode: "mock" },
  });

  const pendingMessage = await createPanelSmsMessage({
    companyId: input.companyId,
    campaignId: campaign.id,
    recipientNumber: phone.normalized,
    senderId,
    message: messageText,
    segments: segmentInfo.segments,
    costSms: segmentInfo.costSms,
    status: "queued",
    mode: "mock",
    metadata: {
      mode: "mock",
      encoding: segmentInfo.encoding,
      characters: segmentInfo.characters,
      debit_pending: true,
    },
  });

  const alreadyDebited = await hasSmsDebitForMessage(pendingMessage.id);
  if (alreadyDebited) {
    const existing = await getPanelSmsMessageById(pendingMessage.id);
    const bal = await getCompanyBalance(input.companyId);
    return {
      messageId: pendingMessage.id,
      campaignId: campaign.id,
      recipientNumber: phone.normalized,
      segments: existing?.segments ?? segmentInfo.segments,
      balanceBefore: bal.availableSms + (existing?.cost_sms ?? 0),
      balanceAfter: bal.availableSms,
      status: existing?.status ?? "delivered",
      providerMessageId: existing?.provider_message_id ?? "",
    };
  }

  try {
    await debitSmsUsage({
      companyId: input.companyId,
      amount: segmentInfo.costSms,
      referenceType: "sms_message",
      referenceId: pendingMessage.id,
      actorUserId: input.createdBy ?? null,
      description: "Consumo por envío SMS mock",
    });
  } catch (err) {
    await updatePanelSmsMessage(pendingMessage.id, {
      status: "failed",
      error_code: "debit_failed",
      error_message:
        err instanceof Error ? err.message : "Error al descontar saldo",
    });
    await updateSmsCampaign(campaign.id, { status: "failed" });
    throw err;
  }

  const mockResult = sendViaMockProvider({
    to: phone.normalized,
    from: senderId,
    message: messageText,
    segments: segmentInfo.segments,
  });

  const updatedMessage = await updatePanelSmsMessage(pendingMessage.id, {
    status: "delivered",
    provider_message_id: mockResult.providerMessageId,
    operator: mockResult.operator,
    sent_at: mockResult.sentAt,
    delivered_at: mockResult.deliveredAt,
    metadata: {
      mode: "mock",
      encoding: segmentInfo.encoding,
      characters: segmentInfo.characters,
      debit_pending: false,
    },
  });

  await insertPanelDeliveryEvent({
    companyId: input.companyId,
    messageId: pendingMessage.id,
    provider: "mock",
    providerMessageId: mockResult.providerMessageId,
    status: "delivered",
    rawPayload: {
      mode: "mock",
      operator: mockResult.operator,
      simulated: true,
    },
  });

  const now = new Date().toISOString();
  await updateSmsCampaign(campaign.id, {
    status: "completed",
    real_sms_cost: segmentInfo.costSms,
    sent_at: now,
  });

  const balanceAfter = balanceBefore - segmentInfo.costSms;

  return {
    messageId: updatedMessage.id,
    campaignId: campaign.id,
    recipientNumber: phone.normalized,
    segments: segmentInfo.segments,
    balanceBefore,
    balanceAfter,
    status: "delivered",
    providerMessageId: mockResult.providerMessageId,
  };
}
