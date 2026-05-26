import { getSupabase } from "../database/supabaseClient.js";
import type { SmsCampaignStatus } from "../types/sms-panel.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  getCampaignByIdForCompany,
  updateSmsCampaign,
} from "./smsCampaignService.js";
import { countPendingQueueForCampaign } from "./smsQueueService.js";

const TERMINAL_MESSAGE_STATUSES = new Set([
  "sent",
  "delivered",
  "pending",
  "failed",
  "rejected",
  "expired",
]);

const SENT_LIKE_STATUSES = new Set(["sent", "delivered", "pending"]);

function deriveCampaignStatusFromMessages(
  statuses: string[],
): SmsCampaignStatus | null {
  if (statuses.length === 0) {
    return "failed";
  }

  const stillQueued = statuses.some((s) => s === "queued");
  if (stillQueued) {
    return null;
  }

  if (!statuses.every((s) => TERMINAL_MESSAGE_STATUSES.has(s))) {
    return null;
  }

  const sentLike = statuses.filter((s) => SENT_LIKE_STATUSES.has(s)).length;
  const failedLike = statuses.filter(
    (s) => s === "failed" || s === "rejected" || s === "expired",
  ).length;

  if (failedLike > 0 && sentLike < statuses.length) {
    return "failed";
  }
  if (sentLike === statuses.length) {
    return "sent";
  }
  if (failedLike === statuses.length) {
    return "failed";
  }
  return sentLike > 0 ? "sent" : "failed";
}

/** Actualiza campaña en processing cuando ya no hay ítems pendientes en cola. */
export async function refreshCampaignStatusFromQueue(
  campaignId: string,
  companyId: string,
): Promise<boolean> {
  const campaign = await getCampaignByIdForCompany(campaignId, companyId);
  if (!campaign || campaign.status !== "processing") {
    return false;
  }

  const pending = await countPendingQueueForCampaign(campaignId);
  if (pending > 0) {
    return false;
  }

  const { data: messages, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("status")
    .eq("campaign_id", campaignId)
    .eq("company_id", companyId);

  if (error) {
    if (isMissingTableError(error)) {
      return false;
    }
    wrapSupabaseError(error, "refreshCampaignStatusFromQueue");
  }

  const statuses = (messages ?? []).map((m) => String(m.status));
  const nextStatus = deriveCampaignStatusFromMessages(statuses);
  if (!nextStatus) {
    return false;
  }

  const meta = { ...(campaign.metadata ?? {}) };
  delete meta.awaiting_scheduler;

  await updateSmsCampaign(campaignId, {
    status: nextStatus,
    sent_at:
      nextStatus === "sent"
        ? campaign.sent_at ?? new Date().toISOString()
        : campaign.sent_at,
    metadata: {
      ...meta,
      queue_finalized_at: new Date().toISOString(),
    },
  });

  return true;
}

/** Revisa campañas en processing sin cola pendiente (p. ej. cola ya drenada). */
export async function refreshProcessingCampaignsFromQueue(
  limit = 25,
): Promise<number> {
  const { data: campaigns, error } = await getSupabase()
    .from("sms_campaigns")
    .select("id, company_id")
    .eq("status", "processing")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    wrapSupabaseError(error, "refreshProcessingCampaignsFromQueue");
  }

  let updated = 0;
  for (const row of campaigns ?? []) {
    const finalized = await refreshCampaignStatusFromQueue(
      row.id,
      row.company_id,
    );
    if (finalized) {
      updated += 1;
    }
  }
  return updated;
}
