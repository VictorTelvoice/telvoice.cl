import { getSupabase } from "../database/supabaseClient.js";
import type { SmsSendQueueRow, SmsQueueStatus } from "../types/sms-traffic.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function enqueueMessage(input: {
  companyId: string;
  messageId?: string | null;
  campaignId?: string | null;
  providerId?: string | null;
  routeId?: string | null;
  ratePlanId?: string | null;
  priority?: number;
  trafficType?: string;
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
}): Promise<SmsSendQueueRow> {
  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .insert({
      company_id: input.companyId,
      message_id: input.messageId ?? null,
      campaign_id: input.campaignId ?? null,
      provider_id: input.providerId ?? null,
      route_id: input.routeId ?? null,
      rate_plan_id: input.ratePlanId ?? null,
      priority: input.priority ?? 100,
      traffic_type: input.trafficType ?? "transactional",
      status: "queued",
      scheduled_at: input.scheduledAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError("Migración 016 no aplicada (sms_send_queue).", 503);
    }
    wrapSupabaseError(error, "enqueueMessage");
  }
  return data as SmsSendQueueRow;
}

export async function enqueueMessagesBulk(
  inputs: {
    companyId: string;
    messageId?: string | null;
    campaignId?: string | null;
    providerId?: string | null;
    routeId?: string | null;
    ratePlanId?: string | null;
    priority?: number;
    trafficType?: string;
    scheduledAt?: string;
    metadata?: Record<string, unknown>;
  }[],
): Promise<SmsSendQueueRow[]> {
  if (inputs.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const rows = inputs.map((input) => ({
    company_id: input.companyId,
    message_id: input.messageId ?? null,
    campaign_id: input.campaignId ?? null,
    provider_id: input.providerId ?? null,
    route_id: input.routeId ?? null,
    rate_plan_id: input.ratePlanId ?? null,
    priority: input.priority ?? 100,
    traffic_type: input.trafficType ?? "transactional",
    status: "queued",
    scheduled_at: input.scheduledAt ?? now,
    metadata: input.metadata ?? {},
  }));

  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .insert(rows)
    .select("*");

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError("Migración 016 no aplicada (sms_send_queue).", 503);
    }
    wrapSupabaseError(error, "enqueueMessagesBulk");
  }

  return (data ?? []) as SmsSendQueueRow[];
}

export async function getNextQueuedMessages(
  limit = 10,
): Promise<SmsSendQueueRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .select("*")
    .eq("status", "queued")
    .lte("scheduled_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "getNextQueuedMessages");
  }
  return (data ?? []) as SmsSendQueueRow[];
}

export async function markProcessing(
  queueId: string,
  lockedBy: string,
): Promise<SmsSendQueueRow> {
  const { data: current, error: readErr } = await getSupabase()
    .from("sms_send_queue")
    .select("*")
    .eq("id", queueId)
    .eq("status", "queued")
    .maybeSingle();

  if (readErr) {
    wrapSupabaseError(readErr, "markProcessing.read");
  }
  if (!current) {
    throw new AppError("Mensaje de cola no disponible para procesar.", 409);
  }

  const row = current as SmsSendQueueRow;
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .update({
      status: "processing",
      locked_at: now,
      locked_by: lockedBy,
      attempts: (row.attempts ?? 0) + 1,
    })
    .eq("id", queueId)
    .eq("status", "queued")
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "markProcessing");
  }
  return data as SmsSendQueueRow;
}

async function setQueueStatus(
  queueId: string,
  status: SmsQueueStatus,
  extra?: Partial<{
    error_code: string;
    error_message: string;
    processed_at: string;
  }>,
): Promise<SmsSendQueueRow> {
  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .update({
      status,
      processed_at: extra?.processed_at ?? new Date().toISOString(),
      error_code: extra?.error_code ?? null,
      error_message: extra?.error_message ?? null,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", queueId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "setQueueStatus");
  }
  return data as SmsSendQueueRow;
}

export async function markSent(queueId: string): Promise<SmsSendQueueRow> {
  return setQueueStatus(queueId, "sent");
}

/** Devuelve un ítem de processing a queued para reintento (TPS / proveedor). */
export async function requeueForRetry(queueId: string): Promise<SmsSendQueueRow> {
  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .update({
      status: "queued",
      locked_at: null,
      locked_by: null,
      processed_at: null,
      error_code: null,
      error_message: null,
    })
    .eq("id", queueId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "requeueForRetry");
  }
  return data as SmsSendQueueRow;
}

export async function markFailed(
  queueId: string,
  error: { code?: string; message?: string },
): Promise<SmsSendQueueRow> {
  return setQueueStatus(queueId, "failed", {
    error_code: error.code ?? "SEND_FAILED",
    error_message: error.message ?? "Error de envío",
  });
}

export async function cancelQueuedMessage(
  queueId: string,
): Promise<SmsSendQueueRow> {
  return setQueueStatus(queueId, "cancelled");
}

export async function pauseQueueByRoute(routeId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .update({ status: "paused" })
    .eq("route_id", routeId)
    .eq("status", "queued")
    .select("id");

  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    wrapSupabaseError(error, "pauseQueueByRoute");
  }
  return data?.length ?? 0;
}

export async function pauseQueueByProvider(providerId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .update({ status: "paused" })
    .eq("provider_id", providerId)
    .eq("status", "queued")
    .select("id");

  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    wrapSupabaseError(error, "pauseQueueByProvider");
  }
  return data?.length ?? 0;
}

const DEFAULT_STALE_PROCESSING_MS = 5 * 60 * 1000;

/** Reencola ítems en processing con lock antiguo (crash o tick interrumpido). */
export async function releaseStaleProcessingQueueItems(
  maxAgeMs = DEFAULT_STALE_PROCESSING_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { data, error } = await getSupabase()
    .from("sms_send_queue")
    .update({
      status: "queued",
      locked_at: null,
      locked_by: null,
      processed_at: null,
      error_code: null,
      error_message: null,
    })
    .eq("status", "processing")
    .lt("locked_at", cutoff)
    .select("id");

  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    wrapSupabaseError(error, "releaseStaleProcessingQueueItems");
  }
  return data?.length ?? 0;
}

export async function countPendingQueueForCampaign(
  campaignId: string,
): Promise<number> {
  const { count, error } = await getSupabase()
    .from("sms_send_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "processing"]);

  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    wrapSupabaseError(error, "countPendingQueueForCampaign");
  }
  return count ?? 0;
}

export async function countQueueByStatus(): Promise<Record<string, number>> {
  const statuses = ["queued", "processing", "sent", "failed", "paused"] as const;
  const out: Record<string, number> = {};
  for (const s of statuses) {
    const { count, error } = await getSupabase()
      .from("sms_send_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    if (error && !isMissingTableError(error)) {
      wrapSupabaseError(error, "countQueueByStatus");
    }
    out[s] = count ?? 0;
  }
  return out;
}
