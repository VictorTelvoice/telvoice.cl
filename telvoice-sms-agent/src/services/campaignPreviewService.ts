import type {
  CampaignAudienceSource,
  CampaignAudienceSummary,
  CampaignPreviewResult,
} from "../types/campaign-audience.js";
import { PANEL_PRODUCTION_MODE } from "../constants/panel-sms-mode.js";
import { AppError } from "../utils/errors.js";
import {
  parseAudienceSourceFromQuery,
  resolveCampaignAudience,
  validateCampaignAudience,
} from "./campaignAudienceService.js";
import { calculateSmsSegments } from "./smsSegmentService.js";
import { getCompanyBalance } from "./smsWalletService.js";
import { createSmsCampaign } from "./smsCampaignService.js";

export type BuildCampaignPreviewInput = {
  companyId: string;
  audienceSource: CampaignAudienceSource;
  senderId: string;
  message: string;
  campaignName?: string;
};

export async function buildCampaignPreview(
  input: BuildCampaignPreviewInput,
): Promise<CampaignPreviewResult> {
  let audience = await resolveCampaignAudience(
    input.companyId,
    input.audienceSource,
  );

  const segmentsInfo = calculateSmsSegments(input.message);
  const validRecipientCount = audience.validCount;
  const segmentsPerMessage = segmentsInfo.segments || 1;
  const totalSmsEstimated = validRecipientCount * segmentsPerMessage;

  const balance = await getCompanyBalance(input.companyId);
  const balanceAvailable = balance.availableSms;
  const balanceAfter = balanceAvailable - totalSmsEstimated;

  let canProceed = validRecipientCount > 0 && balanceAfter >= 0;
  let blockReason: string | null = null;

  if (validRecipientCount === 0) {
    canProceed = false;
    blockReason = "La audiencia seleccionada no tiene contactos válidos.";
  } else if (balanceAfter < 0) {
    canProceed = false;
    blockReason = "Saldo insuficiente para esta campaña.";
  }

  const omitted =
    audience.totalFound -
    audience.validCount -
    audience.duplicatesOmitted;
  if (
    omitted > 0 &&
    validRecipientCount > 0 &&
    !blockReason
  ) {
    /* informativo — no bloquea preview */
  }

  const campaignName =
    (input.campaignName ?? "").trim() ||
    `Campaña ${new Date().toISOString().slice(0, 10)}`;

  return {
    audience,
    campaignName,
    senderId: input.senderId.trim(),
    message: input.message,
    characters: segmentsInfo.characters,
    encoding: segmentsInfo.encoding,
    segmentsPerMessage,
    validRecipientCount,
    totalSmsEstimated,
    balanceAvailable,
    balanceAfter,
    canProceed,
    blockReason,
    sendEnabled: false,
  };
}

export async function buildCampaignPreviewFromRequest(
  companyId: string,
  params: {
    contacts?: string;
    list_id?: string;
    tag_id?: string;
    sender_id?: string;
    message?: string;
    campaign_name?: string;
  },
): Promise<CampaignPreviewResult> {
  const source = parseAudienceSourceFromQuery(params);
  if (!source) {
    throw new AppError(
      "Selecciona una audiencia desde Contactos (contactos, agenda o tag).",
      400,
    );
  }

  const preview = await buildCampaignPreview({
    companyId,
    audienceSource: source,
    senderId: params.sender_id ?? "",
    message: params.message ?? "",
    campaignName: params.campaign_name,
  });

  if (preview.validRecipientCount > 0) {
    validateCampaignAudience(preview.audience);
  }

  return preview;
}

export async function createCampaignDraftFromPreview(
  companyId: string,
  preview: CampaignPreviewResult,
  createdBy?: string | null,
): Promise<{ id: string; name: string }> {
  if (preview.validRecipientCount === 0) {
    throw new AppError(
      "La audiencia seleccionada no tiene contactos válidos.",
      400,
    );
  }

  const campaign = await createSmsCampaign({
    companyId,
    name: preview.campaignName,
    senderId: preview.senderId || null,
    message: preview.message,
    status: "draft",
    totalRecipients: preview.audience.totalFound,
    validRecipients: preview.validRecipientCount,
    invalidRecipients:
      preview.audience.invalidCount +
      preview.audience.blockedCount +
      preview.audience.optOutCount +
      preview.audience.duplicatesOmitted,
    estimatedSmsCost: preview.totalSmsEstimated,
    realSmsCost: 0,
    mode: PANEL_PRODUCTION_MODE,
    createdBy: createdBy ?? null,
    metadata: {
      source: "contacts_audience",
      audience_type: preview.audience.sourceType,
      audience_ref: preview.audience.sourceRef,
      estimated_recipients: preview.validRecipientCount,
      estimated_sms_cost: preview.totalSmsEstimated,
      send_enabled: false,
      segments_per_message: preview.segmentsPerMessage,
      encoding: preview.encoding,
      duplicates_omitted: preview.audience.duplicatesOmitted,
      blocked_count: preview.audience.blockedCount,
      opt_out_count: preview.audience.optOutCount,
    },
  });

  return { id: campaign.id, name: campaign.name };
}

export function audienceHiddenFields(
  source: CampaignAudienceSummary,
): Record<string, string> {
  if (source.sourceType === "contacts") {
    return { contacts: source.sourceRef };
  }
  if (source.sourceType === "list") {
    return { list_id: source.sourceRef };
  }
  return { tag_id: source.sourceRef };
}
