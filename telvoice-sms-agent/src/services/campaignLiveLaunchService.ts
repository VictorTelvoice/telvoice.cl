import type { CampaignAudienceMember } from "../types/campaign-audience.js";
import type { ResolvedSmsRoute } from "../types/sms-routing.js";
import type { SmsCampaignRow, PanelSmsMessageRow } from "../types/sms-panel.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import {
  parseAudienceSourceFromCampaignMetadata,
  resolveCampaignAudience,
  validateCampaignAudience,
} from "./campaignAudienceService.js";
import {
  getCampaignLiveReadiness,
  validateCampaignCanGoLive,
} from "./campaignReadinessService.js";
import { findCompanyById } from "./companyService.js";
import {
  createPanelSmsMessagesBulk,
  countLiveMessagesForCampaign,
  listPanelMessagesByCampaign,
  updatePanelSmsMessage,
} from "./panelSmsMessageService.js";
import { sumSmsDebitsForCampaignMessages } from "./walletTransactionService.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { getCampaignByIdForCompany, updateSmsCampaign } from "./smsCampaignService.js";
import { calculateSmsSegments, validateRecipientNumber } from "./smsSegmentService.js";
import { assertCampaignTrafficAllowed } from "./smsDispatchWorkerService.js";
import { resolveTrafficPolicy } from "./smsTrafficPolicyService.js";
import {
  countQueueByCampaignStatus,
  countQueueItemsForCampaign,
  enqueueMessagesBulk,
} from "./smsQueueService.js";
import { getCompanyBalance } from "./smsWalletService.js";

export const LIVE_CAMPAIGN_LAUNCH_SOURCE = "campaign_live_launch";
export const LIVE_CAMPAIGN_EXECUTION_MODE = "live_campaign";
export const LIVE_CAMPAIGN_CONFIRM_TEXT = "ENVIAR";

const INSERT_CHUNK = 500;

export type LiveCampaignLaunchInput = {
  consentConfirmed: boolean;
  confirmText: string;
  launchedBy?: string | null;
};

export type LiveCampaignLaunchResult = {
  campaignId: string;
  status: "processing";
  mode: "live";
  messagesQueued: number;
  estimatedSmsCost: number;
  effectiveTps: number;
  alreadyLaunched?: boolean;
};

export type LiveCampaignLaunchStatus = {
  launched: boolean;
  canLaunch: boolean;
  launchBlockReasons: string[];
  liveMessageCount: number;
  queueItemCount: number;
  queueByStatus: Record<string, number>;
  messageByStatus: Record<string, number>;
  walletDebitedFromMessages: number;
  estimatedSmsCost: number;
  availableSms: number;
};

export type LiveLaunchRouteContext = {
  resolved: ResolvedSmsRoute;
  effectiveTps: number;
  trafficType: string;
};

function normalizeRecipientPhone(member: CampaignAudienceMember): string | null {
  const check = validateRecipientNumber(
    member.phoneNormalized || member.phone,
  );
  return check.ok && check.normalized ? check.normalized : null;
}

function audienceTypeFromMeta(metadata: Record<string, unknown>): string {
  const t = metadata.audience_type;
  return typeof t === "string" ? t : "contacts";
}

export async function validateLiveCampaignLaunch(
  companyId: string,
  campaignId: string,
  input: LiveCampaignLaunchInput,
): Promise<{ readiness: Awaited<ReturnType<typeof getCampaignLiveReadiness>> }> {
  const blockReasons: string[] = [];

  if (!input.consentConfirmed) {
    blockReasons.push(
      "Debes confirmar que tienes autorización para contactar a esta audiencia.",
    );
  }

  const confirmNorm = String(input.confirmText ?? "").trim().toUpperCase();
  if (confirmNorm !== LIVE_CAMPAIGN_CONFIRM_TEXT) {
    blockReasons.push(
      `Escribe ${LIVE_CAMPAIGN_CONFIRM_TEXT} para confirmar el envío real.`,
    );
  }

  const company = await findCompanyById(companyId);
  if (!company || company.status !== "active") {
    blockReasons.push("La cuenta empresa no está activa.");
  }

  const campaign = await getCampaignByIdForCompany(campaignId, companyId);
  if (!campaign) {
    throw new AppError("Campaña no encontrada.", 404);
  }

  if (campaign.company_id !== companyId) {
    throw new AppError("La campaña no pertenece a tu empresa.", 403);
  }

  if (campaign.status !== "draft") {
    blockReasons.push(
      `Solo se pueden lanzar campañas en borrador (estado actual: ${campaign.status}).`,
    );
  }

  const meta = campaign.metadata ?? {};
  if (meta.source !== "contacts_audience") {
    blockReasons.push(
      "Esta campaña no proviene de contactos; no admite envío live desde el panel.",
    );
  }

  const liveCount = await countLiveMessagesForCampaign(campaignId);
  if (liveCount > 0) {
    blockReasons.push(
      "La campaña ya tiene mensajes live registrados; no se puede lanzar de nuevo.",
    );
  }

  const queueCount = await countQueueItemsForCampaign(campaignId);
  if (queueCount > 0) {
    blockReasons.push(
      "La campaña ya tiene ítems en cola de envío; no se puede lanzar de nuevo.",
    );
  }

  if (meta.live_launched_at || meta.queue_created === true) {
    blockReasons.push("Esta campaña ya fue enviada a cola anteriormente.");
  }

  const readiness = await getCampaignLiveReadiness(companyId, campaignId);
  if (!readiness.canGoLive) {
    blockReasons.push(...readiness.blockedReasons);
  }

  const segmentInfo = calculateSmsSegments(campaign.message ?? "");
  if (segmentInfo.segments > env.smsLiveCampaign.maxSegments) {
    blockReasons.push(
      `El mensaje supera el máximo de ${env.smsLiveCampaign.maxSegments} segmentos por envío live.`,
    );
  }

  const validRecipients =
    campaign.valid_recipients ||
    (typeof meta.estimated_recipients === "number"
      ? meta.estimated_recipients
      : 0);

  if (validRecipients > env.smsLiveCampaign.maxRecipients) {
    blockReasons.push(
      `La campaña supera el máximo de ${env.smsLiveCampaign.maxRecipients} destinatarios por envío live.`,
    );
  }

  if (blockReasons.length > 0) {
    throw new AppError(blockReasons[0]!, 400);
  }

  return { readiness };
}

export async function buildLiveCampaignRecipients(
  companyId: string,
  campaign: SmsCampaignRow,
): Promise<{
  audience: Awaited<ReturnType<typeof validateCampaignAudience>>;
  recipients: { member: CampaignAudienceMember; phone: string }[];
  segmentInfo: ReturnType<typeof calculateSmsSegments>;
  totalCost: number;
}> {
  const audienceSource = parseAudienceSourceFromCampaignMetadata(
    campaign.metadata ?? {},
  );
  if (!audienceSource) {
    throw new AppError("No se pudo reconstruir la audiencia de la campaña.", 400);
  }

  const audience = validateCampaignAudience(
    await resolveCampaignAudience(companyId, audienceSource),
  );

  const messageText = String(campaign.message ?? "").trim();
  if (!messageText) {
    throw new AppError("La campaña no tiene mensaje.", 400);
  }

  const segmentInfo = calculateSmsSegments(messageText);
  if (segmentInfo.segments < 1) {
    throw new AppError("El mensaje no genera segmentos válidos.", 400);
  }

  const recipients: { member: CampaignAudienceMember; phone: string }[] = [];
  for (const member of audience.validRecipients) {
    const phone = normalizeRecipientPhone(member);
    if (phone) {
      recipients.push({ member, phone });
    }
  }

  if (recipients.length === 0) {
    throw new AppError("No hay destinatarios válidos para enviar.", 400);
  }

  const totalCost = recipients.length * segmentInfo.costSms;
  return { audience, recipients, segmentInfo, totalCost };
}

export async function resolveLiveLaunchRouteContext(
  companyId: string,
): Promise<LiveLaunchRouteContext> {
  const trafficType = env.smsCampaign.trafficType;
  const resolved = await resolveRouteForMessage({
    companyId,
    country: "CL",
    trafficType,
  });

  const policy = await resolveTrafficPolicy({
    companyId,
    routeId: resolved.route.id,
    providerId: resolved.provider.id,
    ratePlanId: resolved.ratePlan.id,
    trafficType,
    country: "CL",
  });

  return {
    resolved,
    effectiveTps: policy.effective_tps,
    trafficType,
  };
}

export async function createQueuedLiveMessages(
  input: {
    companyId: string;
    campaign: SmsCampaignRow;
    recipients: { member: CampaignAudienceMember; phone: string }[];
    segmentInfo: ReturnType<typeof calculateSmsSegments>;
    routeContext: LiveLaunchRouteContext;
    consentConfirmed: boolean;
  },
): Promise<PanelSmsMessageRow[]> {
  const {
    companyId,
    campaign,
    recipients,
    segmentInfo,
    routeContext,
    consentConfirmed,
  } = input;
  const { resolved } = routeContext;
  const senderId =
    String(campaign.sender_id ?? "").trim() ||
    resolved.provider.default_sender_id ||
    "TELVOICE";
  const audienceType = audienceTypeFromMeta(campaign.metadata ?? {});
  const now = new Date().toISOString();
  const allMessages: PanelSmsMessageRow[] = [];

  for (let offset = 0; offset < recipients.length; offset += INSERT_CHUNK) {
    const chunk = recipients.slice(offset, offset + INSERT_CHUNK);
    const payloads = chunk.map(({ member, phone }) => ({
      companyId,
      campaignId: campaign.id,
      recipientNumber: phone,
      senderId,
      message: campaign.message,
      segments: segmentInfo.segments,
      costSms: segmentInfo.costSms,
      provider: resolved.provider.code,
      status: "queued" as const,
      mode: "live",
      metadata: {
        source: LIVE_CAMPAIGN_LAUNCH_SOURCE,
        campaign_id: campaign.id,
        contact_id: member.contactId,
        audience_type: audienceType,
        phone_normalized: phone,
        live: true,
        queued_at: now,
        consent_confirmed: consentConfirmed,
        launched_from: "client_panel",
        provider_id: resolved.provider.id,
        route_id: resolved.route.id,
        rate_plan_id: resolved.ratePlan.id,
      },
    }));

    const created = await createPanelSmsMessagesBulk(payloads);
    for (const msg of created) {
      await updatePanelSmsMessage(msg.id, {
        provider_id: resolved.provider.id,
        route_id: resolved.route.id,
        rate_plan_id: resolved.ratePlan.id,
        sell_price_per_sms: resolved.sellPricePerSms,
        cost_price_per_sms: resolved.costPricePerSms,
        margin: resolved.margin,
        currency: resolved.currency,
      });
    }
    allMessages.push(...created);
  }

  return allMessages;
}

export async function enqueueCampaignMessages(
  companyId: string,
  campaignId: string,
  messages: PanelSmsMessageRow[],
  routeContext: LiveLaunchRouteContext,
): Promise<number> {
  if (messages.length === 0) {
    return 0;
  }

  const { resolved, trafficType } = routeContext;
  const now = new Date().toISOString();
  const payloads = messages.map((m) => ({
    companyId,
    messageId: m.id,
    campaignId,
    providerId: resolved.provider.id,
    routeId: resolved.route.id,
    ratePlanId: resolved.ratePlan.id,
    trafficType,
    scheduledAt: now,
    priority: 50,
    metadata: {
      source: LIVE_CAMPAIGN_LAUNCH_SOURCE,
      campaign_id: campaignId,
      message_id: m.id,
      flow: "campaign",
    },
  }));

  const rows = await enqueueMessagesBulk(payloads);
  return rows.length;
}

export async function markCampaignProcessing(
  companyId: string,
  campaignId: string,
  launchMetadata: Record<string, unknown>,
): Promise<SmsCampaignRow> {
  const campaign = await getCampaignByIdForCompany(campaignId, companyId);
  if (!campaign) {
    throw new AppError("Campaña no encontrada.", 404);
  }

  const launchedAt = new Date().toISOString();
  return updateSmsCampaign(campaignId, {
    status: "processing",
    mode: "live",
    metadata: {
      ...campaign.metadata,
      ...launchMetadata,
      execution_mode: LIVE_CAMPAIGN_EXECUTION_MODE,
      source: LIVE_CAMPAIGN_LAUNCH_SOURCE,
      live_launched_at: launchedAt,
      processing_at: launchedAt,
      consent_confirmed: true,
      queue_created: true,
      production: true,
    },
  });
}

export async function getLiveLaunchStatus(
  companyId: string,
  campaignId: string,
): Promise<LiveCampaignLaunchStatus> {
  const campaign = await getCampaignByIdForCompany(campaignId, companyId);
  const launchBlockReasons: string[] = [];

  const liveMessageCount = await countLiveMessagesForCampaign(campaignId);
  const queueItemCount = await countQueueItemsForCampaign(campaignId);
  const queueByStatus = await countQueueByCampaignStatus(campaignId);

  const messages = campaign
    ? await listPanelMessagesByCampaign(campaignId, 500)
    : [];

  const messageByStatus: Record<string, number> = {};
  for (const msg of messages) {
    messageByStatus[msg.status] = (messageByStatus[msg.status] ?? 0) + 1;
  }

  const walletDebitedFromMessages = campaign
    ? await sumSmsDebitsForCampaignMessages(campaignId, companyId)
    : 0;

  const balance = await getCompanyBalance(companyId);
  const meta = campaign?.metadata ?? {};
  const launched = Boolean(
    meta.live_launched_at || liveMessageCount > 0 || queueItemCount > 0,
  );

  const readiness = await getCampaignLiveReadiness(companyId, campaignId);
  if (!readiness.canGoLive) {
    launchBlockReasons.push(...readiness.blockedReasons);
  }

  if (!campaign) {
    launchBlockReasons.push("Campaña no encontrada.");
  } else {
    if (campaign.status !== "draft") {
      launchBlockReasons.push("La campaña ya no está en borrador.");
    }
    if (meta.source !== "contacts_audience") {
      launchBlockReasons.push("Solo campañas desde contactos admiten envío live.");
    }
    if (liveMessageCount > 0) {
      launchBlockReasons.push("Ya existen mensajes live para esta campaña.");
    }
    if (queueItemCount > 0) {
      launchBlockReasons.push("Ya existe cola de envío para esta campaña.");
    }
    const segmentInfo = calculateSmsSegments(campaign.message ?? "");
    if (segmentInfo.segments > env.smsLiveCampaign.maxSegments) {
      launchBlockReasons.push(
        `Máximo ${env.smsLiveCampaign.maxSegments} segmentos por mensaje.`,
      );
    }
    if (campaign.valid_recipients > env.smsLiveCampaign.maxRecipients) {
      launchBlockReasons.push(
        `Máximo ${env.smsLiveCampaign.maxRecipients} destinatarios por campaña live.`,
      );
    }
  }

  const uniqueBlocks = [...new Set(launchBlockReasons)];
  const canLaunch =
    Boolean(campaign) &&
    campaign!.status === "draft" &&
    liveMessageCount === 0 &&
    queueItemCount === 0 &&
    readiness.canGoLive &&
    uniqueBlocks.length === 0;

  return {
    launched,
    canLaunch,
    launchBlockReasons: uniqueBlocks,
    liveMessageCount,
    queueItemCount,
    queueByStatus,
    messageByStatus,
    walletDebitedFromMessages,
    estimatedSmsCost: campaign?.estimated_sms_cost ?? 0,
    availableSms: balance.availableSms,
  };
}

export async function launchLiveCampaign(
  companyId: string,
  campaignId: string,
  input: LiveCampaignLaunchInput,
): Promise<LiveCampaignLaunchResult> {
  const { readiness } = await validateLiveCampaignLaunch(
    companyId,
    campaignId,
    input,
  );

  await validateCampaignCanGoLive(companyId, campaignId);

  const campaign = await getCampaignByIdForCompany(campaignId, companyId);
  if (!campaign) {
    throw new AppError("Campaña no encontrada.", 404);
  }

  const liveCount = await countLiveMessagesForCampaign(campaignId);
  if (liveCount > 0) {
    throw new AppError(
      "La campaña ya tiene mensajes live; lanzamiento idempotente rechazado.",
      409,
    );
  }

  const queueCount = await countQueueItemsForCampaign(campaignId);
  if (queueCount > 0) {
    throw new AppError(
      "La campaña ya tiene cola de envío; lanzamiento idempotente rechazado.",
      409,
    );
  }

  const { recipients, segmentInfo, totalCost } =
    await buildLiveCampaignRecipients(companyId, campaign);

  const routeContext = await resolveLiveLaunchRouteContext(companyId);

  await assertCampaignTrafficAllowed({
    companyId,
    routeId: routeContext.resolved.route.id,
    providerId: routeContext.resolved.provider.id,
    ratePlanId: routeContext.resolved.ratePlan.id,
    segmentCost: totalCost,
  });

  const balance = await getCompanyBalance(companyId);
  if (balance.availableSms < totalCost) {
    throw new AppError(
      `Saldo insuficiente: necesitas ${totalCost} SMS y tienes ${balance.availableSms}.`,
      400,
    );
  }

  const messages = await createQueuedLiveMessages({
    companyId,
    campaign,
    recipients,
    segmentInfo,
    routeContext,
    consentConfirmed: input.consentConfirmed,
  });

  const queued = await enqueueCampaignMessages(
    companyId,
    campaignId,
    messages,
    routeContext,
  );

  await markCampaignProcessing(companyId, campaignId, {
    launched_by: input.launchedBy ?? null,
    route_id: routeContext.resolved.route.id,
    provider_id: routeContext.resolved.provider.id,
    rate_plan_id: routeContext.resolved.ratePlan.id,
    effective_tps: routeContext.effectiveTps,
    estimated_sms_cost: totalCost,
    estimated_recipients: recipients.length,
    queued_count: queued,
    segments_per_message: segmentInfo.segments,
    encoding: segmentInfo.encoding,
    live_enabled: readiness.liveEnabled,
    campaigns_enabled: readiness.campaignsEnabled,
  });

  return {
    campaignId,
    status: "processing",
    mode: "live",
    messagesQueued: queued,
    estimatedSmsCost: totalCost,
    effectiveTps: routeContext.effectiveTps,
  };
}

/** Alias para API documentada en la etapa. */
export const prepareLiveCampaignExecution = validateLiveCampaignLaunch;
export const executeLiveCampaignLaunch = launchLiveCampaign;
