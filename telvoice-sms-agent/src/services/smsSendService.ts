import type { CompanyRow } from "../types/tenant.js";
import type { MockSmsSendResult, PanelSmsMessageStatus } from "../types/sms-panel.js";
import { findCompanyById } from "./companyService.js";
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
import { hasSmsDebitForMessage } from "./walletTransactionService.js";
import { assertLiveTestSendAllowed } from "./smsLiveTestPolicy.js";
import { dispatchProviderSend } from "./smsProviderDispatchService.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { sendViaProvider } from "./sms-providers/providerFactory.js";
import { AppError } from "../utils/errors.js";

export type SendMockSmsInput = {
  companyId: string;
  senderId: string;
  to: string;
  message: string;
  campaignName?: string | null;
  createdBy?: string | null;
};

export type SendPanelSmsInput = SendMockSmsInput & {
  sendMode?: "mock" | "live_test";
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

async function validateSendBasics(input: SendMockSmsInput): Promise<{
  messageText: string;
  senderId: string;
  phone: string;
  segmentInfo: ReturnType<typeof calculateSmsSegments>;
  wallet: Awaited<ReturnType<typeof getOrCreateCompanyWallet>>;
  balanceBefore: number;
}> {
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

  return {
    messageText,
    senderId,
    phone: phone.normalized,
    segmentInfo,
    wallet,
    balanceBefore,
  };
}

function defaultCampaignName(): string {
  return `Envío individual ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
}

export async function sendPanelSms(
  input: SendPanelSmsInput,
): Promise<MockSmsSendResult> {
  if (input.sendMode === "live_test") {
    return sendLiveTestSms(input);
  }
  return sendMockSms(input);
}

export async function sendMockSms(
  input: SendMockSmsInput,
): Promise<MockSmsSendResult> {
  const basics = await validateSendBasics(input);
  const { messageText, senderId, phone, segmentInfo, balanceBefore } = basics;

  const campaignName = input.campaignName?.trim() || defaultCampaignName();

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
    metadata: { source: "app_send_sms_mock", mode: "mock" },
  });

  const pendingMessage = await createPanelSmsMessage({
    companyId: input.companyId,
    campaignId: campaign.id,
    recipientNumber: phone,
    senderId,
    message: messageText,
    segments: segmentInfo.segments,
    costSms: segmentInfo.costSms,
    status: "queued",
    mode: "mock",
    metadata: {
      source: "app_send_sms_mock",
      mode: "mock",
      encoding: segmentInfo.encoding,
      characters: segmentInfo.characters,
    },
  });

  const alreadyDebited = await hasSmsDebitForMessage(pendingMessage.id);
  if (alreadyDebited) {
    const existing = await getPanelSmsMessageById(pendingMessage.id);
    const bal = await getCompanyBalance(input.companyId);
    return {
      messageId: pendingMessage.id,
      campaignId: campaign.id,
      recipientNumber: phone,
      segments: existing?.segments ?? segmentInfo.segments,
      balanceBefore: bal.availableSms + (existing?.cost_sms ?? 0),
      balanceAfter: bal.availableSms,
      status: existing?.status ?? "delivered",
      providerMessageId: existing?.provider_message_id ?? "",
      sendMode: "mock",
    };
  }

  const providerResult = await sendViaProvider("mock", {
    to: phone,
    message: messageText,
    senderId,
    metadata: { segments: segmentInfo.segments },
  });

  if (!providerResult.accepted) {
    await updatePanelSmsMessage(pendingMessage.id, {
      status: "failed",
      error_code: providerResult.error_code ?? "mock_failed",
      error_message: providerResult.error_message ?? "Mock rechazado",
    });
    await updateSmsCampaign(campaign.id, { status: "failed" });
    throw new AppError(
      providerResult.error_message ?? "No se pudo simular el envío.",
      502,
    );
  }

  try {
    await debitSmsUsage({
      companyId: input.companyId,
      amount: segmentInfo.costSms,
      referenceType: "sms_message",
      referenceId: pendingMessage.id,
      actorUserId: input.createdBy ?? null,
      description: "Consumo por envío SMS mock",
      metadata: { mode: "mock" },
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

  const updatedMessage = await updatePanelSmsMessage(pendingMessage.id, {
    status: "delivered",
    provider: "mock",
    provider_message_id: providerResult.provider_message_id,
    sent_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
    metadata: {
      source: "app_send_sms_mock",
      mode: "mock",
      encoding: segmentInfo.encoding,
      characters: segmentInfo.characters,
    },
  });

  await insertPanelDeliveryEvent({
    companyId: input.companyId,
    messageId: pendingMessage.id,
    provider: "mock",
    providerMessageId: providerResult.provider_message_id,
    status: "delivered",
    rawPayload: providerResult.raw_response,
  });

  const now = new Date().toISOString();
  await updateSmsCampaign(campaign.id, {
    status: "completed",
    real_sms_cost: segmentInfo.costSms,
    sent_at: now,
  });

  return {
    messageId: updatedMessage.id,
    campaignId: campaign.id,
    recipientNumber: phone,
    segments: segmentInfo.segments,
    balanceBefore,
    balanceAfter: balanceBefore - segmentInfo.costSms,
    status: "delivered",
    providerMessageId: providerResult.provider_message_id ?? "",
    sendMode: "mock",
  };
}

export async function sendLiveTestSms(
  input: SendMockSmsInput,
): Promise<MockSmsSendResult> {
  const phone = assertLiveTestSendAllowed({
    companyId: input.companyId,
    to: input.to,
  });

  const basics = await validateSendBasics({ ...input, to: phone });
  const { messageText, senderId, segmentInfo, balanceBefore } = basics;

  const campaignName = input.campaignName?.trim() || defaultCampaignName();

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
    mode: "live_test",
    createdBy: input.createdBy ?? null,
    metadata: { source: "app_send_sms_live_test", mode: "live_test" },
  });

  const resolved = await resolveRouteForMessage({
    companyId: input.companyId,
    country: "CL",
    phone,
    trafficType: "transactional",
  });

  const effectiveSender =
    senderId || resolved.provider.default_sender_id || "TELVOICE";

  const pendingMessage = await createPanelSmsMessage({
    companyId: input.companyId,
    campaignId: campaign.id,
    recipientNumber: phone,
    senderId: effectiveSender,
    message: messageText,
    segments: segmentInfo.segments,
    costSms: segmentInfo.costSms,
    status: "queued",
    mode: "live_test",
    provider: resolved.provider.code,
    metadata: {
      source: "app_send_sms_live_test",
      mode: "live_test",
      encoding: segmentInfo.encoding,
      characters: segmentInfo.characters,
      provider_id: resolved.provider.id,
      route_id: resolved.route.id,
      rate_plan_id: resolved.ratePlan.id,
    },
  });

  const providerResult = await dispatchProviderSend(resolved.provider, {
    to: phone,
    message: messageText,
    senderId: effectiveSender,
    metadata: {
      segments: segmentInfo.segments,
      panel_message_id: pendingMessage.id,
      route_id: resolved.route.id,
    },
  });

  if (!providerResult.accepted) {
    await updatePanelSmsMessage(pendingMessage.id, {
      status: "failed",
      provider: providerResult.provider,
      provider_message_id: providerResult.provider_message_id,
      error_code: providerResult.error_code ?? "PROVIDER_REJECTED",
      error_message: providerResult.error_message ?? "Proveedor rechazó el envío",
      metadata: {
        source: "app_send_sms_live_test",
        mode: "live_test",
        asmsc_uid: providerResult.asmsc_uid ?? null,
        raw_response: providerResult.raw_response,
      },
    });
    await updateSmsCampaign(campaign.id, { status: "failed" });
    throw new AppError(
      providerResult.error_message ??
        "El proveedor no aceptó el SMS. No se descontó saldo.",
      502,
    );
  }

  const panelStatus: PanelSmsMessageStatus =
    providerResult.status === "pending" ? "pending" : "sent";

  if (await hasSmsDebitForMessage(pendingMessage.id)) {
    const existing = await getPanelSmsMessageById(pendingMessage.id);
    const bal = await getCompanyBalance(input.companyId);
    return {
      messageId: pendingMessage.id,
      campaignId: campaign.id,
      recipientNumber: phone,
      segments: segmentInfo.segments,
      balanceBefore: bal.availableSms + segmentInfo.costSms,
      balanceAfter: bal.availableSms,
      status: existing?.status ?? panelStatus,
      providerMessageId: existing?.provider_message_id ?? "",
      sendMode: "live_test",
    };
  }

  try {
    await debitSmsUsage({
      companyId: input.companyId,
      amount: segmentInfo.costSms,
      referenceType: "sms_message",
      referenceId: pendingMessage.id,
      actorUserId: input.createdBy ?? null,
      description: "Consumo por envío SMS live_test (API aSMSC)",
      metadata: { mode: "live_test", provider: providerResult.provider },
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

  const sentAt = new Date().toISOString();
  const updatedMessage = await updatePanelSmsMessage(pendingMessage.id, {
    status: panelStatus,
    provider: resolved.provider.code,
    provider_message_id: providerResult.provider_message_id,
    sent_at: sentAt,
    provider_id: resolved.provider.id,
    route_id: resolved.route.id,
    rate_plan_id: resolved.ratePlan.id,
    sell_price_per_sms: resolved.sellPricePerSms,
    cost_price_per_sms: resolved.costPricePerSms,
    currency: resolved.currency,
    margin: resolved.margin,
    metadata: {
      source: "app_send_sms_live_test",
      mode: "live_test",
      asmsc_uid: providerResult.asmsc_uid ?? null,
      encoding: segmentInfo.encoding,
      characters: segmentInfo.characters,
      raw_response: providerResult.raw_response,
      rate_plan_code: resolved.ratePlan.code,
      route_name: resolved.route.name,
    },
  });

  await insertPanelDeliveryEvent({
    companyId: input.companyId,
    messageId: pendingMessage.id,
    provider: providerResult.provider,
    providerMessageId: providerResult.provider_message_id,
    status: panelStatus,
    rawPayload: {
      ...providerResult.raw_response,
      event: "submit_accepted",
    },
  });

  await updateSmsCampaign(campaign.id, {
    status: "sent",
    real_sms_cost: segmentInfo.costSms,
    sent_at: sentAt,
  });

  return {
    messageId: updatedMessage.id,
    campaignId: campaign.id,
    recipientNumber: phone,
    segments: segmentInfo.segments,
    balanceBefore,
    balanceAfter: balanceBefore - segmentInfo.costSms,
    status: panelStatus,
    providerMessageId: providerResult.provider_message_id ?? "",
    sendMode: "live_test",
  };
}
