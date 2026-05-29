import { PANEL_PRODUCTION_MODE } from "../constants/panel-sms-mode.js";
import { getSupabase } from "../database/supabaseClient.js";
import type {
  SmsCampaignRow,
  SmsCampaignStatus,
  SmsCampaignWithCompany,
} from "../types/sms-panel.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function createSmsCampaign(input: {
  companyId: string;
  name: string;
  senderId?: string | null;
  message: string;
  status?: SmsCampaignStatus;
  totalRecipients?: number;
  validRecipients?: number;
  invalidRecipients?: number;
  estimatedSmsCost?: number;
  realSmsCost?: number;
  mode?: string;
  createdBy?: string | null;
  scheduledAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<SmsCampaignRow> {
  const { data, error } = await getSupabase()
    .from("sms_campaigns")
    .insert({
      company_id: input.companyId,
      name: input.name,
      sender_id: input.senderId ?? null,
      message: input.message,
      status: input.status ?? "draft",
      total_recipients: input.totalRecipients ?? 0,
      valid_recipients: input.validRecipients ?? 0,
      invalid_recipients: input.invalidRecipients ?? 0,
      estimated_sms_cost: input.estimatedSmsCost ?? 0,
      real_sms_cost: input.realSmsCost ?? 0,
      mode: input.mode ?? PANEL_PRODUCTION_MODE,
      created_by: input.createdBy ?? null,
      scheduled_at: input.scheduledAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Tablas de campañas SMS no disponibles. Aplica la migración 012.",
        503,
      );
    }
    wrapSupabaseError(error, "createSmsCampaign");
  }

  return data as SmsCampaignRow;
}

export async function updateSmsCampaign(
  id: string,
  patch: Partial<{
    status: SmsCampaignStatus;
    mode: string;
    total_recipients: number;
    valid_recipients: number;
    invalid_recipients: number;
    estimated_sms_cost: number;
    real_sms_cost: number;
    sent_at: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<SmsCampaignRow> {
  const { data, error } = await getSupabase()
    .from("sms_campaigns")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateSmsCampaign");
  }

  return data as SmsCampaignRow;
}

export async function listCampaignsByCompany(
  companyId: string,
  limit = 50,
  filters?: {
    q?: string;
    status?: SmsCampaignStatus;
    senderId?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<SmsCampaignRow[]> {
  let q = getSupabase()
    .from("sms_campaigns")
    .select("*")
    .eq("company_id", companyId);

  const text = filters?.q?.trim();
  if (text) {
    q = q.ilike("name", `%${text}%`);
  }
  if (filters?.status) {
    q = q.eq("status", filters.status);
  }
  const sender = filters?.senderId?.trim();
  if (sender) {
    q = q.eq("sender_id", sender);
  }
  if (filters?.startDate) {
    q = q.gte("created_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters?.endDate) {
    q = q.lte("created_at", `${filters.endDate}T23:59:59.999Z`);
  }

  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listCampaignsByCompany");
  }

  return (data ?? []) as SmsCampaignRow[];
}

export async function listAllCampaignsWithCompany(
  limit = 100,
): Promise<SmsCampaignWithCompany[]> {
  const { data, error } = await getSupabase()
    .from("sms_campaigns")
    .select("*, companies(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listAllCampaignsWithCompany");
  }

  return (data ?? []).map((row) => {
    const r = row as SmsCampaignRow & { companies?: { name: string } | null };
    return {
      ...r,
      company_name: r.companies?.name ?? "—",
    };
  });
}

export async function getCampaignByIdForCompany(
  campaignId: string,
  companyId: string,
): Promise<SmsCampaignRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getCampaignByIdForCompany");
  }

  return data as SmsCampaignRow | null;
}
