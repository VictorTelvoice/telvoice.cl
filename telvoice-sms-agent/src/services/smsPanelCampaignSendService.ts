import type {
  PanelCampaignSendResult,
  PanelSmsMessageStatus,
} from "../types/sms-panel.js";
import { AppError } from "../utils/errors.js";
import { calculateSmsSegments } from "./smsSegmentService.js";
import { createSmsCampaign, updateSmsCampaign } from "./smsCampaignService.js";
import {
  createPanelSmsMessage,
  insertPanelDeliveryEvent,
  updatePanelSmsMessage,
} from "./panelSmsMessageService.js";
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
import { recordTpsSend } from "./smsTpsLimiterService.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { enqueueMessage } from "./smsQueueService.js";
import { findCompanyById } from "./companyService.js";
import { processQueueTick } from "./smsDispatchWorkerService.js";

export type SendPanelCampaignInput = {
  companyId: string;
  senderId: string;
  message: string;
  recipients: string[];
  campaignName: string;
  mode: "mass" | "scheduled";
  scheduledAt?: string | null;
  createdBy?: string | null;
  sendSource?: string;
};

async function assertCompanyCanSend(companyId: string): Promise<void> {
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
}

async function sendOneInCampaign(input: {
  companyId: string;
  campaignId: string;
  senderId: string;
  messageText: string;
  phone: string;
  segmentInfo: ReturnType<typeof calculateSmsSegments>;
  sendSource: string;
  createdBy?: string | null;
}): Promise<{ ok: true; costSms: number } | { ok: false; error: string }> {
  const {
    companyId,
    campaignId,
    senderId,
    messageText,
    phone,
    segmentInfo,
    sendSource,
    createdBy,
  } = input;

  try {
    await assertLiveTestOperationalLimits({
      companyId,
      to: phone,
      segmentCount: segmentInfo.segments,
    });

    const resolved = await resolveRouteForMessage({
      companyId,
      country: "CL",
      phone,
      trafficType: "transactional",
    });

    await assertLiveTestTrafficAllowed({
      companyId,
      routeId: resolved.route.id,
      providerId: resolved.provider.id,
      ratePlanId: resolved.ratePlan.id,
      segmentCost: segmentInfo.costSms,
    });

    const effectiveSender =
      senderId || resolved.provider.default_sender_id || "TELVOICE";

    const pendingMessage = await createPanelSmsMessage({
      companyId,
      campaignId,
      recipientNumber: phone,
      senderId: effectiveSender,
      message: messageText,
      segments: segmentInfo.segments,
      costSms: segmentInfo.costSms,
      status: "queued",
      mode: "live_test",
      provider: resolved.provider.code,
      metadata: {
        source: sendSource,
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
        error_code: providerResult.error_code ?? "PROVIDER_REJECTED",
        error_message:
          providerResult.error_message ?? "Proveedor rechazó el envío",
      });
      return {
        ok: false,
        error:
          providerResult.error_message ?? "El proveedor no aceptó el SMS.",
      };
    }

    const panelStatus: PanelSmsMessageStatus =
      providerResult.status === "pending" ? "pending" : "sent";

    if (!(await hasSmsDebitForMessage(pendingMessage.id))) {
      await debitSmsUsage({
        companyId,
        amount: segmentInfo.costSms,
        referenceType: "sms_message",
        referenceId: pendingMessage.id,
        actorUserId: createdBy ?? null,
        description: "Consumo por envío SMS (campaña panel)",
        metadata: { mode: "live_test", provider: providerResult.provider },
      });
    }

    const sentAt = new Date().toISOString();
    await updatePanelSmsMessage(pendingMessage.id, {
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
    });

    await insertPanelDeliveryEvent({
      companyId,
      messageId: pendingMessage.id,
      provider: providerResult.provider,
      providerMessageId: providerResult.provider_message_id,
      status: panelStatus,
      rawPayload: {
        ...providerResult.raw_response,
        event: "submit_accepted",
      },
    });

    recordTpsSend({
      companyId,
      providerId: resolved.provider.id,
      routeId: resolved.route.id,
      ratePlanId: resolved.ratePlan.id,
    });

    return { ok: true, costSms: segmentInfo.costSms };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error de envío",
    };
  }
}

async function queueOneForSchedule(input: {
  companyId: string;
  campaignId: string;
  senderId: string;
  messageText: string;
  phone: string;
  segmentInfo: ReturnType<typeof calculateSmsSegments>;
  scheduledAt: string;
  sendSource: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resolved = await resolveRouteForMessage({
      companyId: input.companyId,
      country: "CL",
      phone: input.phone,
      trafficType: "transactional",
    });

    const effectiveSender =
      input.senderId || resolved.provider.default_sender_id || "TELVOICE";

    const pendingMessage = await createPanelSmsMessage({
      companyId: input.companyId,
      campaignId: input.campaignId,
      recipientNumber: input.phone,
      senderId: effectiveSender,
      message: input.messageText,
      segments: input.segmentInfo.segments,
      costSms: input.segmentInfo.costSms,
      status: "queued",
      mode: "live_test",
      provider: resolved.provider.code,
      metadata: {
        source: input.sendSource,
        send_mode: "scheduled",
        scheduled_at: input.scheduledAt,
      },
    });

    await enqueueMessage({
      companyId: input.companyId,
      messageId: pendingMessage.id,
      campaignId: input.campaignId,
      providerId: resolved.provider.id,
      routeId: resolved.route.id,
      ratePlanId: resolved.ratePlan.id,
      scheduledAt: input.scheduledAt,
      metadata: { source: input.sendSource, panel_message_id: pendingMessage.id },
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al encolar",
    };
  }
}

export async function sendPanelCampaign(
  input: SendPanelCampaignInput,
): Promise<PanelCampaignSendResult> {
  const sendSource = input.sendSource ?? "app_send_sms_campaign";
  const messageText = String(input.message ?? "").trim();
  if (!messageText) {
    throw new AppError("El mensaje no puede estar vacío.", 400);
  }

  const senderId = String(input.senderId ?? "").trim();
  if (!senderId) {
    throw new AppError("El remitente (Sender ID) es obligatorio.", 400);
  }

  await assertCompanyCanSend(input.companyId);

  const rawRecipients = input.recipients.filter(Boolean);
  if (rawRecipients.length === 0) {
    throw new AppError("No hay destinatarios para enviar.", 400);
  }

  const phones: string[] = [];
  let invalid = 0;
  for (const r of rawRecipients) {
    try {
      const normalized = assertLiveTestSendAllowed({
        companyId: input.companyId,
        to: r,
      });
      phones.push(normalized);
    } catch {
      invalid += 1;
    }
  }

  if (phones.length === 0) {
    throw new AppError(
      "Ningún destinatario está autorizado o es válido para envío.",
      400,
    );
  }

  const segmentInfo = calculateSmsSegments(messageText);
  const totalCost = segmentInfo.costSms * phones.length;

  const wallet = await getOrCreateCompanyWallet(input.companyId);
  if (wallet.status !== "active") {
    throw new AppError(
      `Wallet en estado «${wallet.status}»; no permite envíos.`,
      403,
    );
  }

  const balanceBefore = wallet.available_sms;
  if (balanceBefore < totalCost) {
    throw new AppError(
      `Saldo insuficiente: necesitas ${totalCost} SMS y tienes ${balanceBefore}.`,
      400,
    );
  }

  const scheduleMs = input.scheduledAt
    ? new Date(input.scheduledAt).getTime()
    : 0;
  const isScheduled =
    input.mode === "scheduled" &&
    scheduleMs > 0 &&
    scheduleMs > Date.now();

  const campaign = await createSmsCampaign({
    companyId: input.companyId,
    name: input.campaignName,
    senderId,
    message: messageText,
    status: "processing",
    totalRecipients: rawRecipients.length,
    validRecipients: phones.length,
    invalidRecipients: invalid,
    estimatedSmsCost: totalCost,
    realSmsCost: 0,
    mode: "live_test",
    createdBy: input.createdBy ?? null,
    scheduledAt: input.scheduledAt ?? null,
    metadata: {
      source: sendSource,
      send_mode: input.mode,
      production: true,
    },
  });

  let sent = 0;
  let failed = 0;
  let queued = 0;
  let smsConsumed = 0;

  if (isScheduled && input.scheduledAt) {
    for (const phone of phones) {
      const result = await queueOneForSchedule({
        companyId: input.companyId,
        campaignId: campaign.id,
        senderId,
        messageText,
        phone,
        segmentInfo,
        scheduledAt: input.scheduledAt,
        sendSource,
      });
      if (result.ok) queued += 1;
      else failed += 1;
    }

    const tick = await processQueueTick(Math.min(phones.length, 20));
    sent += tick.sent;
    failed += tick.failed;

    await updateSmsCampaign(campaign.id, {
      status: queued > 0 ? "processing" : "failed",
      real_sms_cost: smsConsumed,
      metadata: {
        source: sendSource,
        send_mode: input.mode,
        production: true,
        queued,
        dispatch_tick: tick,
      },
    });
  } else {
    for (const phone of phones) {
      const result = await sendOneInCampaign({
        companyId: input.companyId,
        campaignId: campaign.id,
        senderId,
        messageText,
        phone,
        segmentInfo,
        sendSource,
        createdBy: input.createdBy,
      });
      if (result.ok) {
        sent += 1;
        smsConsumed += result.costSms;
      } else {
        failed += 1;
      }
    }

    const finalStatus =
      sent === 0 ? "failed" : sent < phones.length ? "processing" : "sent";

    await updateSmsCampaign(campaign.id, {
      status: finalStatus,
      real_sms_cost: smsConsumed,
      sent_at: sent > 0 ? new Date().toISOString() : null,
    });
  }

  const balanceAfter = (await getCompanyBalance(input.companyId)).availableSms;

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    mode: input.mode,
    totalRecipients: phones.length,
    sent,
    failed,
    queued,
    balanceBefore,
    balanceAfter,
    scheduledAt: input.scheduledAt ?? null,
    smsConsumed,
  };
}
