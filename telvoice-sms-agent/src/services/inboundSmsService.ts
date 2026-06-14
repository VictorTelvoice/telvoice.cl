import { createHash } from "node:crypto";
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
  /** Polling: solo mensajes con received_at estrictamente posterior. */
  afterReceivedAt?: string;
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
  if (filters.afterReceivedAt) {
    query = query.gt("received_at", filters.afterReceivedAt);
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

/** Conteo de no leídos (status received) por empresa. */
export async function countUnreadInboundByCompany(
  companyId: string,
  numberId?: string,
): Promise<number> {
  const sb = getSupabase();
  let query = sb
    .from("inbound_sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "received");

  if (numberId) {
    query = query.eq("client_number_id", numberId);
  }

  const { count, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return 0;
    throw wrapSupabaseError(error, "inbound_sms_messages");
  }
  return count ?? 0;
}

/** Conteos por client_number_id para sidebar del inbox. */
export async function countInboundByClientNumber(
  companyId: string,
): Promise<Record<string, number>> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("inbound_sms_messages")
    .select("client_number_id")
    .eq("company_id", companyId);

  if (error) {
    if (isMissingTableError(error)) return {};
    throw wrapSupabaseError(error, "inbound_sms_messages");
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = String(row.client_number_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export type InboundSmsApiMessage = {
  id: string;
  client_number_id: string;
  to_number: string;
  from_number: string | null;
  body: string;
  detected_otp: string | null;
  received_at: string;
  status: InboundSmsStatus;
  source: string | null;
};

export function serializeInboundMessageForApi(
  row: InboundSmsMessageRow,
): InboundSmsApiMessage {
  return {
    id: row.id,
    client_number_id: row.client_number_id,
    to_number: row.to_number,
    from_number: row.from_number,
    body: row.body,
    detected_otp: row.detected_otp,
    received_at: row.received_at,
    status: row.status,
    source: row.source,
  };
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
  /** Idempotencia: fila raw telsim_inbound_sms (referencia, no clave única). */
  telsim_inbound_id?: string;
  slot_id?: string;
  idempotency_key?: string;
};

/** Clave idempotente para inbox — evita duplicados en reintentos del proveedor. */
export function buildInboundIdempotencyKey(input: {
  provider?: string;
  providerMessageId?: string;
  telsimInboundId?: string;
  slotId?: string;
  to: string;
  from?: string;
  body: string;
  receivedAt: string;
}): string {
  if (input.providerMessageId?.trim()) {
    return `provider:${input.provider ?? "gateway"}:${input.providerMessageId.trim()}`;
  }

  const norm = (s: string) => String(s).replace(/\D/g, "");
  const bodyHash = createHash("sha256")
    .update(input.body)
    .digest("hex")
    .slice(0, 16);
  const ts = input.receivedAt.trim();

  return [
    "inbound",
    input.provider ?? "gateway",
    input.slotId?.trim() ?? "",
    norm(input.to),
    norm(input.from ?? ""),
    bodyHash,
    ts,
  ].join(":");
}

async function findExistingInboundByIdempotencyKey(
  idempotencyKey: string,
): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("inbound_sms_messages")
    .select("id")
    .eq("metadata->>idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "inbound_sms_messages");
  }
  return data?.id != null ? String(data.id) : null;
}

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

  const idempotencyKey =
    payload.idempotency_key?.trim() ??
    buildInboundIdempotencyKey({
      provider: payload.provider,
      providerMessageId: payload.provider_message_id,
      telsimInboundId: payload.telsim_inbound_id,
      slotId: payload.slot_id,
      to,
      from: payload.from,
      body,
      receivedAt,
    });

  const existingId = await findExistingInboundByIdempotencyKey(idempotencyKey);
  if (existingId) {
    console.info(
      "[inbound-sms] idempotente (existente)",
      JSON.stringify({
        to: maskInboundPhone(to),
        message_id: existingId,
        idempotency_key: idempotencyKey.slice(0, 48),
      }),
    );
    return { ok: true, messageId: existingId };
  }

  const metadata: Record<string, unknown> = {
    idempotency_key: idempotencyKey,
  };
  if (payload.provider_message_id?.trim()) {
    metadata.provider_message_id = payload.provider_message_id.trim();
  }
  if (payload.telsim_inbound_id?.trim()) {
    metadata.telsim_inbound_id = payload.telsim_inbound_id.trim();
  }
  if (payload.slot_id?.trim()) {
    metadata.telsim_slot_id = payload.slot_id.trim();
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
  telsimInboundId?: string;
  slotId?: string;
  providerMessageId?: string;
}): Promise<{ ok: boolean; messageId?: string; skipped?: boolean }> {
  const line = input.linePhone?.trim();
  if (!line) {
    console.warn(
      "[inbound-sms] telsim forward omitido: sin line_phone",
      JSON.stringify({ slot_id: input.slotId ?? null }),
    );
    return { ok: false, skipped: true };
  }

  const idempotencyKey = buildInboundIdempotencyKey({
    provider: "telsim",
    providerMessageId: input.providerMessageId,
    telsimInboundId: input.telsimInboundId,
    slotId: input.slotId,
    to: line,
    from: input.from,
    body: input.body,
    receivedAt: input.receivedAt,
  });

  return processInboundSmsWebhook({
    to: line,
    from: input.from,
    body: input.body,
    received_at: input.receivedAt,
    provider: "telsim",
    provider_message_id: input.providerMessageId,
    telsim_inbound_id: input.telsimInboundId,
    slot_id: input.slotId,
    idempotency_key: idempotencyKey,
  });
}

/** Simula SMS entrante desde el panel cliente (origen `simulation`). */
export async function simulateInboundSmsForCompany(input: {
  companyId: string;
  clientNumberId: string;
  from: string;
  body: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const from = input.from?.trim();
  const body = input.body?.trim();
  if (!from) {
    return { ok: false, error: "Número remitente requerido." };
  }
  if (!body) {
    return { ok: false, error: "Mensaje requerido." };
  }

  const sb = getSupabase();
  const { data: numberRow, error } = await sb
    .from("client_numbers")
    .select("id, company_id, number, status")
    .eq("company_id", input.companyId)
    .eq("id", input.clientNumberId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: "Módulo de numeraciones no disponible." };
    }
    throw wrapSupabaseError(error, "client_numbers");
  }
  if (!numberRow) {
    return { ok: false, error: "Numeración no encontrada." };
  }
  if (String(numberRow.status) !== "active") {
    return { ok: false, error: "La numeración no está activa para recibir SMS." };
  }

  return processInboundSmsWebhook({
    to: String(numberRow.number),
    from,
    body,
    provider: "simulation",
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
