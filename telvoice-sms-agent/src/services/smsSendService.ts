import type { MockSmsSendResult, PanelSmsMessageStatus } from "../types/sms-panel.js";
import { AppError } from "../utils/errors.js";
import { assertCompanyCanSendSms } from "./companySendGuardService.js";
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
import { assertLiveTestOperationalLimits } from "./smsLiveTestLimiterService.js";
import { assertLiveTestSendAllowed } from "./smsLiveTestPolicy.js";
import { dispatchProviderSend } from "./smsProviderDispatchService.js";
import { assertLiveTestTrafficAllowed } from "./smsDispatchWorkerService.js";
import { assertDlrWebhookSafeForLiveTraffic } from "../utils/dlr-callback.js";
import { recordTpsSend } from "./smsTpsLimiterService.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { APP_CLIENT_LIVE_SOURCE, PANEL_PRODUCTION_MODE } from "../constants/panel-sms-mode.js";
import {
  findCampaignByIdempotencyKey,
  isPostgresUniqueViolation,
  mockSmsSendResultFromIdempotentCampaign,
} from "./smsSendIdempotencyService.js";

export type SendMockSmsInput = {
  companyId: string;
  senderId: string;
  to: string;
  message: string;
  campaignName?: string | null;
  createdBy?: string | null;
};

export type SendPanelSmsInput = SendMockSmsInput & {
  sendSource?: "app_send_sms_live" | "app_send_sms_live_test" | "app_send_sms_verify_test";
  idempotencyKey?: string | null;
  /** Sin cooldown de 1 min (p. ej. /admin/test superadmin). */
  skipInterSendCooldown?: boolean;
};

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

  await assertCompanyCanSendSms(input.companyId);

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
  return sendLiveTestSms(input);
}

export async function sendLiveTestSms(
  input: SendPanelSmsInput,
): Promise<MockSmsSendResult> {
  const sendSource = input.sendSource ?? APP_CLIENT_LIVE_SOURCE;

  if (input.idempotencyKey?.trim()) {
    const existing = await findCampaignByIdempotencyKey(
      input.companyId,
      input.idempotencyKey.trim(),
    );
    if (existing) {
      return mockSmsSendResultFromIdempotentCampaign(
        existing,
        input.companyId,
      );
    }
  }

  const phone = await assertLiveTestSendAllowed({
    companyId: input.companyId,
    to: input.to,
  });

  const basics = await validateSendBasics({ ...input, to: phone });
  const { messageText, senderId, segmentInfo, balanceBefore } = basics;

  await assertLiveTestOperationalLimits({
    companyId: input.companyId,
    to: phone,
    segmentCount: segmentInfo.segments,
    skipInterSendCooldown: input.skipInterSendCooldown,
  });

  const campaignName = input.campaignName?.trim() || defaultCampaignName();

  const campaignMetadata: Record<string, unknown> = {
    source: sendSource,
    mode: PANEL_PRODUCTION_MODE,
  };
  if (input.idempotencyKey?.trim()) {
    campaignMetadata.idempotency_key = input.idempotencyKey.trim();
  }

  let campaign;
  try {
    campaign = await createSmsCampaign({
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
      mode: PANEL_PRODUCTION_MODE,
      createdBy: input.createdBy ?? null,
      metadata: campaignMetadata,
    });
  } catch (err) {
    if (
      input.idempotencyKey?.trim() &&
      isPostgresUniqueViolation(err)
    ) {
      const existing = await findCampaignByIdempotencyKey(
        input.companyId,
        input.idempotencyKey.trim(),
      );
      if (existing) {
        return mockSmsSendResultFromIdempotentCampaign(
          existing,
          input.companyId,
        );
      }
    }
    throw err;
  }

  const resolved = await resolveRouteForMessage({
    companyId: input.companyId,
    country: "CL",
    phone,
    trafficType: "transactional",
  });

  await assertLiveTestTrafficAllowed({
    companyId: input.companyId,
    routeId: resolved.route.id,
    providerId: resolved.provider.id,
    ratePlanId: resolved.ratePlan.id,
    segmentCost: segmentInfo.costSms,
  });
  assertDlrWebhookSafeForLiveTraffic();

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
    mode: PANEL_PRODUCTION_MODE,
    provider: resolved.provider.code,
    metadata: {
      source: sendSource,
      mode: PANEL_PRODUCTION_MODE,
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
        source: sendSource,
        mode: PANEL_PRODUCTION_MODE,
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
      sendMode: PANEL_PRODUCTION_MODE,
    };
  }

  try {
    await debitSmsUsage({
      companyId: input.companyId,
      amount: segmentInfo.costSms,
      referenceType: "sms_message",
      referenceId: pendingMessage.id,
      actorUserId: input.createdBy ?? null,
      description: "Consumo por envío SMS (panel)",
      metadata: { mode: PANEL_PRODUCTION_MODE, provider: providerResult.provider },
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
      source: sendSource,
      mode: PANEL_PRODUCTION_MODE,
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

  recordTpsSend({
    companyId: input.companyId,
    providerId: resolved.provider.id,
    routeId: resolved.route.id,
    ratePlanId: resolved.ratePlan.id,
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
    sendMode: PANEL_PRODUCTION_MODE,
  };
}
