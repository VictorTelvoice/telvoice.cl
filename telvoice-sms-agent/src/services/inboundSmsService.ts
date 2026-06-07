import { getSupabase } from "../database/supabaseClient.js";
import type {
  InboundSmsMessageRow,
  InboundSmsStatus,
} from "../types/client-numbers.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type InboundSmsFilters = {
  numberId?: string;
  q?: string;
  from?: string;
  startDate?: string;
  endDate?: string;
  status?: InboundSmsStatus;
};

function mapRow(row: Record<string, unknown>): InboundSmsMessageRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    client_number_id: String(row.client_number_id),
    to_number: String(row.to_number),
    from_number: row.from_number != null ? String(row.from_number) : null,
    body: String(row.body),
    detected_otp: row.detected_otp != null ? String(row.detected_otp) : null,
    received_at: String(row.received_at),
    status: row.status as InboundSmsStatus,
    source: row.source != null ? String(row.source) : null,
    raw_payload:
      row.raw_payload && typeof row.raw_payload === "object"
        ? (row.raw_payload as Record<string, unknown>)
        : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
  };
}

/** Detecta OTP: secuencia de 4 a 8 dígitos en el cuerpo del mensaje. */
export function detectOtpFromBody(body: string): string | null {
  const match = body.match(/\b(\d{4,8})\b/);
  return match?.[1] ?? null;
}

export async function listInboundSmsByCompany(
  companyId: string,
  filters: InboundSmsFilters = {},
  limit = 200,
): Promise<InboundSmsMessageRow[]> {
  const sb = getSupabase();
  let query = sb
    .from("inbound_sms_messages")
    .select("*")
    .eq("company_id", companyId)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (filters.numberId) {
    query = query.eq("client_number_id", filters.numberId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.from) {
    query = query.ilike("from_number", `%${filters.from}%`);
  }
  if (filters.startDate) {
    query = query.gte("received_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    query = query.lte("received_at", `${filters.endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "inbound_sms_messages");
  }

  let rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));

  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.body.toLowerCase().includes(q) ||
        (r.from_number?.toLowerCase().includes(q) ?? false) ||
        (r.detected_otp?.includes(q) ?? false),
    );
  }

  return rows;
}

export async function getInboundSmsById(
  companyId: string,
  messageId: string,
): Promise<InboundSmsMessageRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("inbound_sms_messages")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "inbound_sms_messages");
  }
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function updateInboundSmsStatus(
  companyId: string,
  messageId: string,
  status: InboundSmsStatus,
): Promise<boolean> {
  const sb = getSupabase();
  const { error } = await sb
    .from("inbound_sms_messages")
    .update({ status })
    .eq("company_id", companyId)
    .eq("id", messageId);

  if (error) {
    if (isMissingTableError(error)) return false;
    throw wrapSupabaseError(error, "inbound_sms_messages");
  }
  return true;
}

export type InboundSmsWebhookPayload = {
  to: string;
  from?: string;
  body: string;
  received_at?: string;
  provider?: string;
};

export async function processInboundSmsWebhook(
  payload: InboundSmsWebhookPayload,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const to = payload.to?.trim();
  const body = payload.body?.trim();
  if (!to || !body) {
    return { ok: false, error: "Campos to y body son obligatorios." };
  }

  const sb = getSupabase();
  const { data: numberRow, error: numErr } = await sb
    .from("client_numbers")
    .select("id, company_id, status")
    .eq("number", to)
    .eq("status", "active")
    .maybeSingle();

  if (numErr) {
    if (isMissingTableError(numErr)) {
      return { ok: false, error: "Módulo de numeraciones no disponible." };
    }
    throw wrapSupabaseError(numErr, "client_numbers");
  }

  if (!numberRow) {
    return { ok: false, error: "Numeración no encontrada o no activa." };
  }

  const detectedOtp = detectOtpFromBody(body);
  const receivedAt = payload.received_at
    ? new Date(payload.received_at).toISOString()
    : new Date().toISOString();

  const { data: inserted, error: insErr } = await sb
    .from("inbound_sms_messages")
    .insert({
      company_id: numberRow.company_id,
      client_number_id: numberRow.id,
      to_number: to,
      from_number: payload.from?.trim() || null,
      body,
      detected_otp: detectedOtp,
      received_at: receivedAt,
      status: "received",
      source: payload.provider ?? "gateway",
      raw_payload: payload as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (insErr) {
    throw wrapSupabaseError(insErr, "inbound_sms_messages");
  }

  return { ok: true, messageId: String(inserted.id) };
}

export function inboundSmsStatusLabel(status: InboundSmsStatus): string {
  const map: Record<InboundSmsStatus, string> = {
    received: "Recibido",
    read: "Leído",
    archived: "Archivado",
    forwarded: "Reenviado",
    failed: "Fallido",
  };
  return map[status] ?? status;
}
