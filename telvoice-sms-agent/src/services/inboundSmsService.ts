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

/** Enmascara E.164 para logs (últimos 3 dígitos visibles). */
export function maskInboundPhone(e164: string): string {
  const digits = String(e164).replace(/\D/g, "");
  const last3 = digits.slice(-3);
  if (digits.startsWith("569") && digits.length >= 11) {
    return `+56 9 *** *** ${last3}`;
  }
  return `*** *** ${last3 || "?"}`;
}

function normalizeInboundDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function inboundPhoneVariants(raw: string): string[] {
  const trimmed = String(raw ?? "").trim();
  const digits = normalizeInboundDigits(trimmed);
  const variants = new Set<string>();
  if (trimmed) variants.add(trimmed);
  if (digits) {
    variants.add(digits);
    if (digits.startsWith("56")) variants.add(`+${digits}`);
    if (digits.startsWith("569") && digits.length === 11) {
      variants.add(`+${digits}`);
      variants.add(`+56 ${digits.slice(2, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`);
    }
  }
  return [...variants];
}

async function findActiveClientNumberByDestination(
  toRaw: string,
): Promise<{ id: string; company_id: string; number: string } | null> {
  const sb = getSupabase();
  const variants = inboundPhoneVariants(toRaw);
  for (const candidate of variants) {
    const { data, error } = await sb
      .from("client_numbers")
      .select("id, company_id, number, status")
      .eq("number", candidate)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return null;
      throw wrapSupabaseError(error, "client_numbers");
    }
    if (data) {
      return {
        id: String(data.id),
        company_id: String(data.company_id),
        number: String(data.number),
      };
    }
  }

  const digits = normalizeInboundDigits(toRaw);
  if (digits.length >= 9) {
    const { data: rows, error } = await sb
      .from("client_numbers")
      .select("id, company_id, number, status")
      .eq("status", "active");
    if (error) {
      if (isMissingTableError(error)) return null;
      throw wrapSupabaseError(error, "client_numbers");
    }
    const match = (rows ?? []).find(
      (r) => normalizeInboundDigits(String(r.number)) === digits,
    );
    if (match) {
      return {
        id: String(match.id),
        company_id: String(match.company_id),
        number: String(match.number),
      };
    }
  }

  return null;
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
  body?: string;
  text?: string;
  received_at?: string;
  provider?: string;
  provider_message_id?: string;
};

export async function processInboundSmsWebhook(
  payload: InboundSmsWebhookPayload,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const to = payload.to?.trim();
  const body = (payload.body ?? payload.text ?? "").trim();
  if (!to || !body) {
    return { ok: false, error: "Campos to y body/text son obligatorios." };
  }

  const numberRow = await findActiveClientNumberByDestination(to);
  if (!numberRow) {
    console.warn(
      "[inbound-sms] destino sin numeración activa:",
      maskInboundPhone(to),
    );
    return { ok: false, error: "Numeración no encontrada o no activa." };
  }

  const detectedOtp = detectOtpFromBody(body);
  const receivedAt = payload.received_at
    ? new Date(payload.received_at).toISOString()
    : new Date().toISOString();

  const metadata: Record<string, unknown> = {};
  if (payload.provider_message_id?.trim()) {
    metadata.provider_message_id = payload.provider_message_id.trim();
  }

  const sb = getSupabase();
  const { data: inserted, error: insErr } = await sb
    .from("inbound_sms_messages")
    .insert({
      company_id: numberRow.company_id,
      client_number_id: numberRow.id,
      to_number: numberRow.number,
      from_number: payload.from?.trim() || null,
      body,
      detected_otp: detectedOtp,
      received_at: receivedAt,
      status: "received",
      source: payload.provider ?? "gateway",
      raw_payload: payload as unknown as Record<string, unknown>,
      metadata,
    })
    .select("id")
    .single();

  if (insErr) {
    throw wrapSupabaseError(insErr, "inbound_sms_messages");
  }

  console.info(
    "[inbound-sms] recibido",
    JSON.stringify({
      to: maskInboundPhone(numberRow.number),
      from: payload.from ? maskInboundPhone(payload.from) : null,
      company_id: numberRow.company_id,
      message_id: inserted.id,
    }),
  );

  return { ok: true, messageId: String(inserted.id) };
}

/** Puente Telsim → bandeja cliente cuando la línea está asignada. */
export async function forwardTelsimInboundToClientInbox(input: {
  linePhone: string | null | undefined;
  from: string;
  body: string;
  receivedAt: string;
}): Promise<{ ok: boolean; messageId?: string }> {
  const line = input.linePhone?.trim();
  if (!line) return { ok: false };
  return processInboundSmsWebhook({
    to: line,
    from: input.from,
    body: input.body,
    received_at: input.receivedAt,
    provider: "telsim",
  });
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
