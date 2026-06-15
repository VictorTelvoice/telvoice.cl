import { PANEL_LIVE_MODES, PANEL_PRODUCTION_MODE } from "../constants/panel-sms-mode.js";
import { getSupabase } from "../database/supabaseClient.js";
import type {
  PanelSmsMessageRow,
  PanelSmsMessageStatus,
  PanelSmsMessageWithCompany,
} from "../types/sms-panel.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const PANEL_LIST_COLUMNS =
  "id, company_id, campaign_id, recipient_number, sender_id, message, segments, cost_sms, provider, provider_message_id, operator, status, error_code, error_message, mode, sent_at, delivered_at, metadata, created_at, updated_at";

const PANEL_ADMIN_LIST_COLUMNS =
  "id, company_id, campaign_id, recipient_number, sender_id, message, segments, cost_sms, provider, provider_message_id, operator, status, error_code, error_message, mode, sent_at, delivered_at, metadata, created_at, updated_at, companies(name), sms_campaigns(name)";

export async function createPanelSmsMessage(input: {
  companyId: string;
  campaignId?: string | null;
  recipientNumber: string;
  senderId?: string | null;
  message: string;
  segments: number;
  costSms: number;
  provider?: string;
  status?: PanelSmsMessageStatus;
  mode?: string;
  metadata?: Record<string, unknown>;
}): Promise<PanelSmsMessageRow> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .insert({
      company_id: input.companyId,
      campaign_id: input.campaignId ?? null,
      recipient_number: input.recipientNumber,
      sender_id: input.senderId ?? null,
      message: input.message,
      segments: input.segments,
      cost_sms: input.costSms,
      provider: input.provider ?? null,
      status: input.status ?? "queued",
      mode: input.mode ?? PANEL_PRODUCTION_MODE,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Tabla panel_sms_messages no disponible. Aplica la migración 012.",
        503,
      );
    }
    wrapSupabaseError(error, "createPanelSmsMessage");
  }

  return data as PanelSmsMessageRow;
}

export async function createPanelSmsMessagesBulk(
  inputs: {
    companyId: string;
    campaignId?: string | null;
    recipientNumber: string;
    senderId?: string | null;
    message: string;
    segments: number;
    costSms: number;
    provider?: string;
    status?: PanelSmsMessageStatus;
    mode?: string;
    metadata?: Record<string, unknown>;
  }[],
): Promise<PanelSmsMessageRow[]> {
  if (inputs.length === 0) {
    return [];
  }

  const rows = inputs.map((input) => ({
    company_id: input.companyId,
    campaign_id: input.campaignId ?? null,
    recipient_number: input.recipientNumber,
    sender_id: input.senderId ?? null,
    message: input.message,
    segments: input.segments,
    cost_sms: input.costSms,
    provider: input.provider ?? null,
    status: input.status ?? "queued",
    mode: input.mode ?? PANEL_PRODUCTION_MODE,
    metadata: input.metadata ?? {},
  }));

  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .insert(rows)
    .select("*");

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Tabla panel_sms_messages no disponible. Aplica la migración 012.",
        503,
      );
    }
    wrapSupabaseError(error, "createPanelSmsMessagesBulk");
  }

  return (data ?? []) as PanelSmsMessageRow[];
}

function asMetadataRecord(
  value: unknown,
): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Combina metadata existente con parches (shallow); usado antes de persistir. */
export function mergePanelMessageMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...asMetadataRecord(existing),
    ...patch,
  };
}

export async function updatePanelSmsMessage(
  id: string,
  patch: Partial<{
    status: PanelSmsMessageStatus;
    provider: string;
    provider_message_id: string | null;
    provider_id: string | null;
    route_id: string | null;
    rate_plan_id: string | null;
    sell_price_per_sms: number | null;
    cost_price_per_sms: number | null;
    currency: string | null;
    margin: number | null;
    operator: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    error_code: string | null;
    error_message: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<PanelSmsMessageRow> {
  let updatePatch = patch;

  if (patch.metadata !== undefined) {
    const current = await getPanelSmsMessageById(id);
    updatePatch = {
      ...patch,
      metadata: mergePanelMessageMetadata(current?.metadata, patch.metadata),
    };
  }

  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .update(updatePatch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updatePanelSmsMessage");
  }

  return data as PanelSmsMessageRow;
}

export async function findPanelMessageByProviderMessageId(
  providerMessageId: string,
): Promise<PanelSmsMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("*")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findPanelMessageByProviderMessageId");
  }

  return data as PanelSmsMessageRow | null;
}

export async function findPanelMessageByAsmscUid(
  uid: string,
): Promise<PanelSmsMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("*")
    .filter("metadata->>asmsc_uid", "eq", uid)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findPanelMessageByAsmscUid");
  }

  return data as PanelSmsMessageRow | null;
}

export async function findPanelMessageByAsmscUidInRawResponse(
  uid: string,
): Promise<PanelSmsMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("*")
    .filter("metadata->raw_response->>uid", "eq", uid)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findPanelMessageByAsmscUidInRawResponse");
  }

  return data as PanelSmsMessageRow | null;
}

/** Resuelve mensaje panel desde DLR aSMSC (provider id, uid en metadata o raw_response). */
export async function findPanelMessageForAsmscDlr(input: {
  providerMessageId: string | null;
  uid: string | null;
}): Promise<PanelSmsMessageRow | null> {
  const providerIds = new Set<string>();
  if (input.providerMessageId) {
    const raw = input.providerMessageId.trim();
    if (raw) {
      providerIds.add(raw);
      providerIds.add(String(raw));
    }
  }

  for (const providerMessageId of providerIds) {
    const byProvider = await findPanelMessageByProviderMessageId(providerMessageId);
    if (byProvider) {
      return byProvider;
    }
  }

  if (input.uid) {
    const byUid = await findPanelMessageByAsmscUid(input.uid);
    if (byUid) {
      return byUid;
    }
    return findPanelMessageByAsmscUidInRawResponse(input.uid);
  }

  return null;
}

export async function getLastLiveTestPanelMessage(): Promise<PanelSmsMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("*")
    .in("mode", [...PANEL_LIVE_MODES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getLastLiveTestPanelMessage");
  }

  return data as PanelSmsMessageRow | null;
}

export async function getPanelSmsMessageById(
  id: string,
): Promise<PanelSmsMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getPanelSmsMessageById");
  }

  return data as PanelSmsMessageRow | null;
}

export type PanelInboxListFilters = {
  startDate?: string;
  endDate?: string;
  status?: PanelSmsMessageStatus;
  senderId?: string;
  recipient?: string;
  reference?: string;
};

export async function listPanelMessagesByCompany(
  companyId: string,
  limit = 50,
  filters?: PanelInboxListFilters,
): Promise<PanelSmsMessageRow[]> {
  let q = getSupabase()
    .from("panel_sms_messages")
    .select(PANEL_LIST_COLUMNS)
    .eq("company_id", companyId);

  if (filters?.startDate) {
    q = q.gte("created_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters?.endDate) {
    q = q.lte("created_at", `${filters.endDate}T23:59:59.999Z`);
  }
  if (filters?.status) {
    q = q.eq("status", filters.status);
  }
  const sender = filters?.senderId?.trim();
  if (sender) {
    q = q.ilike("sender_id", `%${sender}%`);
  }
  const recipient = filters?.recipient?.trim();
  if (recipient) {
    q = q.ilike("recipient_number", `%${recipient}%`);
  }
  const text = filters?.reference?.trim();
  if (text) {
    q = q.ilike("provider_message_id", `%${text}%`);
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listPanelMessagesByCompany");
  }

  return (data ?? []) as PanelSmsMessageRow[];
}

const PANEL_VERIFY_MESSAGE_COLUMNS =
  "id, company_id, campaign_id, recipient_number, status, created_at, sent_at, metadata";

/** Mensajes recientes para panel de verificación pre-campaña (menos columnas y filas). */
export async function listRecentPanelMessagesForVerify(
  companyId: string,
  limit = 25,
): Promise<PanelSmsMessageRow[]> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select(PANEL_VERIFY_MESSAGE_COLUMNS)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listRecentPanelMessagesForVerify");
  }

  return (data ?? []) as PanelSmsMessageRow[];
}

export async function listPanelMessagesByCampaign(
  campaignId: string,
  limit = 50,
): Promise<PanelSmsMessageRow[]> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select(PANEL_LIST_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listPanelMessagesByCampaign");
  }

  return (data ?? []) as PanelSmsMessageRow[];
}

export async function countLiveMessagesForCampaign(
  campaignId: string,
): Promise<number> {
  const { count, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("mode", "live");

  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    wrapSupabaseError(error, "countLiveMessagesForCampaign");
  }
  return count ?? 0;
}

export async function listAllPanelMessagesWithCompany(
  options: {
    limit?: number;
    companyId?: string;
    search?: string;
  } = {},
): Promise<PanelSmsMessageWithCompany[]> {
  const limit = options.limit ?? 100;
  const fetchLimit = options.search?.trim() ? Math.min(500, limit * 4) : limit;

  let query = getSupabase()
    .from("panel_sms_messages")
    .select(PANEL_ADMIN_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (options.companyId?.trim()) {
    query = query.eq("company_id", options.companyId.trim());
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listAllPanelMessagesWithCompany");
  }

  let rows = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const companies = r.companies;
    const campaigns = r.sms_campaigns;
    const companyName =
      companies && typeof companies === "object" && "name" in companies
        ? String((companies as { name: string }).name)
        : Array.isArray(companies) && companies[0] && typeof companies[0] === "object"
          ? String((companies[0] as { name?: string }).name ?? "—")
          : "—";
    const campaignName =
      campaigns && typeof campaigns === "object" && "name" in campaigns
        ? String((campaigns as { name: string }).name)
        : Array.isArray(campaigns) && campaigns[0] && typeof campaigns[0] === "object"
          ? String((campaigns[0] as { name?: string }).name ?? "—")
          : "—";
    const { companies: _c, sms_campaigns: _s, ...base } = r;
    return {
      ...(base as PanelSmsMessageRow),
      company_name: companyName,
      campaign_name: campaignName,
    };
  });

  const search = options.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter(
      (m) =>
        (m.message ?? "").toLowerCase().includes(search) ||
        m.recipient_number.includes(search) ||
        (m.company_name ?? "").toLowerCase().includes(search) ||
        (m.campaign_name ?? "").toLowerCase().includes(search) ||
        (m.provider_message_id ?? "").toLowerCase().includes(search),
    );
  }

  return rows.slice(0, limit);
}

export async function insertPanelDeliveryEvent(input: {
  companyId: string;
  messageId: string;
  provider: string;
  providerMessageId?: string | null;
  status: string;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabase().from("panel_sms_delivery_events").insert({
    company_id: input.companyId,
    message_id: input.messageId,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? null,
    status: input.status,
    raw_payload: input.rawPayload ?? {},
  });

  if (error) {
    if (isMissingTableError(error)) {
      return;
    }
    wrapSupabaseError(error, "insertPanelDeliveryEvent");
  }
}
