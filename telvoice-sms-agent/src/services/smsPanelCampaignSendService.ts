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
import {
  assertCampaignDispatchEnabled,
  assertCampaignRecipientAllowed,
} from "./smsCampaignPolicy.js";
import {
  bulkEnqueueCampaignRecipients,
  shouldEnqueueCampaignViaBulk,
  type BulkCampaignItem,
} from "./smsCampaignBulkEnqueueService.js";
import { dispatchProviderSend } from "./smsProviderDispatchService.js";
import {
  assertCampaignTrafficAllowed,
  assertLiveTestTrafficAllowed,
} from "./smsDispatchWorkerService.js";
import { env } from "../config/env.js";
import { recordTpsSend } from "./smsTpsLimiterService.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { findCompanyById } from "./companyService.js";
import {
  buildMassCampaignFingerprint,
  findCampaignByIdempotencyKey,
  findRecentCampaignByMassFingerprint,
  isPostgresUniqueViolation,
  panelCampaignSendResultFromRow,
  pinIdempotencyCampaignId,
} from "./smsSendIdempotencyService.js";
import { buildCampaignTpsMetadataFields } from "../utils/campaignTpsMetadata.js";
import { resolveTrafficPolicy } from "./smsTrafficPolicyService.js";

export type MassCampaignSendRow = {
  phone: string;
  message: string;
};

export type SendPanelCampaignInput = {
  companyId: string;
  senderId: string;
  /** Mensaje común (lista sin CSV o filas sin columna mensaje). */
  message?: string;
  /** Filas con número y mensaje (CSV o JSON del formulario). */
  rows?: MassCampaignSendRow[];
  /** Solo números — usa `message` para todos (compatibilidad). */
  recipients?: string[];
  campaignName: string;
  mode: "mass" | "scheduled";
  scheduledAt?: string | null;
  createdBy?: string | null;
  sendSource?: string;
  /** Evita campaña duplicada si el POST se repite. */
  idempotencyKey?: string | null;
};

type ResolvedCampaignItem = {
  phone: string;
  messageText: string;
  segmentInfo: ReturnType<typeof calculateSmsSegments>;
};

async function resolveCampaignItems(input: SendPanelCampaignInput): Promise<{
  items: ResolvedCampaignItem[];
  invalid: number;
  rawCount: number;
  campaignMessage: string;
  personalized: boolean;
}> {
  const defaultMessage = String(input.message ?? "").trim();
  const rawRows: MassCampaignSendRow[] = [];

  if (input.rows?.length) {
    rawRows.push(...input.rows);
  } else if (input.recipients?.length) {
    for (const phone of input.recipients) {
      rawRows.push({ phone, message: defaultMessage });
    }
  }

  const rawCount = rawRows.length;
  let invalid = 0;
  const byPhone = new Map<string, ResolvedCampaignItem>();

  for (const row of rawRows) {
    const messageText = (row.message?.trim() || defaultMessage).trim();
    if (!messageText) {
      invalid += 1;
      continue;
    }
    try {
      const phone = await assertCampaignRecipientAllowed({
        companyId: input.companyId,
        to: row.phone,
      });
      const segmentInfo = calculateSmsSegments(messageText);
      if (segmentInfo.segments < 1) {
        invalid += 1;
        continue;
      }
      byPhone.set(phone, { phone, messageText, segmentInfo });
    } catch {
      invalid += 1;
    }
  }

  const items = [...byPhone.values()];
  if (items.length === 0) {
    throw new AppError(
      "No hay destinatarios válidos con mensaje. Revisa el CSV o el texto común.",
      400,
    );
  }

  const messages = new Set(items.map((i) => i.messageText));
  const personalized = messages.size > 1;
  const campaignMessage = personalized
    ? `Campaña personalizada (${items.length} destinatarios, ${messages.size} variantes)`
    : items[0]!.messageText;

  return { items, invalid, rawCount, campaignMessage, personalized };
}

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
      metadata: {
        asmsc_uid: providerResult.asmsc_uid ?? null,
      },
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

export async function sendPanelCampaign(
  input: SendPanelCampaignInput,
): Promise<PanelCampaignSendResult> {
  const sendSource = input.sendSource ?? "app_send_sms_campaign";
  assertCampaignDispatchEnabled();

  if (input.idempotencyKey?.trim()) {
    const existing = await findCampaignByIdempotencyKey(
      input.companyId,
      input.idempotencyKey.trim(),
    );
    if (existing) {
      return panelCampaignSendResultFromRow(existing, input.companyId);
    }
  }

  const senderId = String(input.senderId ?? "").trim();
  if (!senderId) {
    throw new AppError("El remitente (Sender ID) es obligatorio.", 400);
  }

  await assertCompanyCanSend(input.companyId);

  const { items, invalid, rawCount, campaignMessage, personalized } =
    await resolveCampaignItems(input);

  const fingerprint = buildMassCampaignFingerprint(
    input.companyId,
    items.map((i) => ({ phone: i.phone, message: i.messageText })),
    campaignMessage,
    input.mode,
    input.scheduledAt,
  );
  const recentDuplicate = await findRecentCampaignByMassFingerprint(
    input.companyId,
    fingerprint,
  );
  if (recentDuplicate) {
    return panelCampaignSendResultFromRow(recentDuplicate, input.companyId);
  }

  const totalCost = items.reduce((sum, i) => sum + i.segmentInfo.costSms, 0);

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

  const isScheduled =
    input.mode === "scheduled" && Boolean(input.scheduledAt?.trim());
  const useBulkQueue = shouldEnqueueCampaignViaBulk(input.mode, items.length);
  const scheduledAt =
    isScheduled && input.scheduledAt?.trim()
      ? input.scheduledAt.trim()
      : new Date().toISOString();

  const campaignMetadata: Record<string, unknown> = {
    source: sendSource,
    send_mode: input.mode,
    production: true,
    personalized_messages: personalized,
    mass_fingerprint: fingerprint,
  };
  if (input.idempotencyKey?.trim()) {
    campaignMetadata.idempotency_key = input.idempotencyKey.trim();
  }

  let campaign;
  try {
    campaign = await createSmsCampaign({
      companyId: input.companyId,
      name: input.campaignName,
      senderId,
      message: campaignMessage,
      status: "processing",
      totalRecipients: rawCount,
      validRecipients: items.length,
      invalidRecipients: invalid,
      estimatedSmsCost: totalCost,
      realSmsCost: 0,
      mode: "live_test",
      createdBy: input.createdBy ?? null,
      scheduledAt: input.scheduledAt ?? null,
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
        return panelCampaignSendResultFromRow(existing, input.companyId);
      }
    }
    throw err;
  }

  if (input.idempotencyKey?.trim()) {
    await pinIdempotencyCampaignId({
      companyId: input.companyId,
      key: input.idempotencyKey.trim(),
      campaignId: campaign.id,
      sendMode: input.mode,
    });
  }

  let sent = 0;
  let failed = 0;
  let queued = 0;
  let smsConsumed = 0;

  if (useBulkQueue) {
    const resolved = await resolveRouteForMessage({
      companyId: input.companyId,
      country: "CL",
      trafficType: env.smsCampaign.trafficType,
    });

    await assertCampaignTrafficAllowed({
      companyId: input.companyId,
      routeId: resolved.route.id,
      providerId: resolved.provider.id,
      ratePlanId: resolved.ratePlan.id,
      segmentCost: 1,
    });

    const trafficPolicy = await resolveTrafficPolicy({
      companyId: input.companyId,
      routeId: resolved.route.id,
      providerId: resolved.provider.id,
      ratePlanId: resolved.ratePlan.id,
      trafficType: env.smsCampaign.trafficType,
    });

    const bulkItems: BulkCampaignItem[] = items.map((item) => ({
      phone: item.phone,
      messageText: item.messageText,
      segments: item.segmentInfo.segments,
      costSms: item.segmentInfo.costSms,
      encoding: item.segmentInfo.encoding,
      characters: item.segmentInfo.characters,
    }));

    const bulk = await bulkEnqueueCampaignRecipients({
      companyId: input.companyId,
      campaignId: campaign.id,
      senderId,
      items: bulkItems,
      scheduledAt,
      resolved,
      effectiveTps: trafficPolicy.effective_tps,
    });
    queued = bulk.queued;
    failed = bulk.failed + invalid;

    await updateSmsCampaign(campaign.id, {
      status: queued > 0 ? "processing" : "failed",
      real_sms_cost: 0,
      metadata: {
        source: sendSource,
        send_mode: input.mode,
        production: true,
        queued,
        failed_enqueue: failed,
        awaiting_scheduler: true,
        bulk_queue: true,
        ...(await buildCampaignTpsMetadataFields({
          policy: trafficPolicy,
          requestedTps: null,
        })),
      },
    });
  } else {
    for (const item of items) {
      const result = await sendOneInCampaign({
        companyId: input.companyId,
        campaignId: campaign.id,
        senderId,
        messageText: item.messageText,
        phone: item.phone,
        segmentInfo: item.segmentInfo,
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
      sent === 0 ? "failed" : sent < items.length ? "processing" : "sent";

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
    totalRecipients: items.length,
    sent,
    failed,
    queued,
    balanceBefore,
    balanceAfter,
    scheduledAt: input.scheduledAt ?? null,
    smsConsumed,
  };
}
