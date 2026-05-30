import { getSupabase } from "../database/supabaseClient.js";
import type {
  SmppAccountType,
  SmppBindType,
  SmppConnectionStatus,
  SmppLogLevel,
  SmppRouteType,
  WholesaleSmppBindTestRow,
  WholesaleSmppConnectionEnriched,
  WholesaleSmppConnectionRow,
  WholesaleSmppNocSnapshot,
  WholesaleSmppSendTestRow,
} from "../types/smpp-lab.js";
import {
  enquireLinkIntervalMs,
  resolveSmppBindPort,
  SMPP_DEFAULT_MESSAGE_TYPES,
} from "../types/smpp-lab.js";
import type { WholesaleTrafficType } from "../types/wholesale.js";
import { ValidationError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  decryptSmppSecret,
  encryptSmppSecret,
  SMPP_CREDENTIALS_UNAVAILABLE_MESSAGE,
} from "../utils/secret-crypto.js";
import {
  executeSmppBindTest,
  executeSmppSendTest,
  type SmppConnectionConfig,
} from "./smppClientService.js";

function dbError(error: unknown, ctx: string): void {
  if (error) wrapSupabaseError(error as Parameters<typeof wrapSupabaseError>[0], ctx);
}

function parseSmppStatus(raw: unknown): SmppConnectionStatus {
  const v = String(raw ?? "draft").trim().toLowerCase();
  const allowed: SmppConnectionStatus[] = [
    "draft",
    "testing",
    "active",
    "paused",
    "failed",
  ];
  if (!allowed.includes(v as SmppConnectionStatus)) {
    throw new ValidationError("Estado SMPP inválido.");
  }
  return v as SmppConnectionStatus;
}

function parseBindType(raw: unknown): SmppBindType {
  const v = String(raw ?? "transceiver").trim().toLowerCase();
  if (v === "transmitter" || v === "receiver" || v === "transceiver") return v;
  throw new ValidationError("Bind type inválido.");
}

function parseIntField(raw: unknown, fallback: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseOptionalInt(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseBoolField(raw: unknown, fallback: boolean): boolean {
  if (raw === true || raw === "true" || raw === "yes" || raw === "on" || raw === "1") {
    return true;
  }
  if (raw === false || raw === "false" || raw === "no" || raw === "off" || raw === "0") {
    return false;
  }
  return fallback;
}

function parseCreditLimit(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseAccountType(raw: unknown): SmppAccountType {
  const v = String(raw ?? "smpp").trim().toLowerCase();
  if (v === "smpp") return "smpp";
  throw new ValidationError("Account type inválido.");
}

function parseLogLevel(raw: unknown): SmppLogLevel {
  const v = String(raw ?? "off").trim().toLowerCase();
  const allowed: SmppLogLevel[] = ["off", "debug", "info", "warn", "error"];
  if (allowed.includes(v as SmppLogLevel)) return v as SmppLogLevel;
  return "off";
}

function parseRouteType(raw: unknown): SmppRouteType {
  const v = String(raw ?? "direct").trim().toLowerCase();
  if (v === "direct" || v === "indirect" || v === "hub") return v;
  return "direct";
}

function rowToConnectionConfig(
  row: WholesaleSmppConnectionRow,
  password: string,
): SmppConnectionConfig {
  const transmitterPort =
    row.transmitter_port ?? row.port ?? 2775;
  const receiverPort = row.receiver_port ?? transmitterPort;
  const enquireSeconds =
    row.enquire_link_interval_seconds ??
    Math.max(1, Math.round((row.enquire_link_interval ?? 45_000) / 1000));

  return {
    host: row.host,
    port: resolveSmppBindPort(
      row.bind_type,
      transmitterPort,
      receiverPort,
      row.port,
    ),
    transmitter_port: transmitterPort,
    receiver_port: receiverPort,
    system_id: row.system_id,
    password,
    system_type: row.system_type,
    bind_type: row.bind_type,
    addr_ton: row.addr_ton ?? 0,
    addr_npi: row.addr_npi ?? 0,
    source_addr_ton: row.source_addr_ton,
    source_addr_npi: row.source_addr_npi,
    dest_addr_ton: row.dest_addr_ton ?? 1,
    dest_addr_npi: row.dest_addr_npi ?? 1,
    source_address: row.source_address,
    enquire_link_interval: enquireLinkIntervalMs(enquireSeconds),
    response_timeout_seconds: row.response_timeout_seconds ?? 300,
    phone_number_prepend: row.phone_number_prepend,
    sender_id_prefix: row.sender_id_prefix,
    message_types_allowed:
      row.message_types_allowed?.trim() || SMPP_DEFAULT_MESSAGE_TYPES,
    tlv_tag: row.tlv_tag,
    tlv_value: row.tlv_value,
    send_validity_period_as_null: row.send_validity_period_as_null ?? false,
  };
}

function connectionPayload(
  input: ReturnType<typeof parseSmppConnectionForm>,
): Record<string, unknown> {
  const enquireSeconds = input.enquire_link_interval_seconds;
  return {
    provider_id: input.provider_id,
    label: input.label,
    account_type: input.account_type,
    account_active: input.account_active,
    host: input.host,
    port: input.transmitter_port,
    transmitter_port: input.transmitter_port,
    receiver_port: input.receiver_port,
    system_id: input.system_id,
    system_type: input.system_type,
    bind_type: input.bind_type,
    addr_ton: input.addr_ton,
    addr_npi: input.addr_npi,
    source_addr_ton: input.source_addr_ton,
    source_addr_npi: input.source_addr_npi,
    dest_addr_ton: input.dest_addr_ton,
    dest_addr_npi: input.dest_addr_npi,
    source_address: input.source_address,
    response_timeout_seconds: input.response_timeout_seconds,
    enquire_link_interval: enquireLinkIntervalMs(enquireSeconds),
    enquire_link_interval_seconds: enquireSeconds,
    submit_speed_per_second: input.submit_speed_per_second,
    delay_time_seconds: input.delay_time_seconds,
    sessions: input.sessions,
    tps_limit: input.tps_limit,
    sender_id_prefix: input.sender_id_prefix,
    phone_number_prepend: input.phone_number_prepend,
    message_types_allowed: input.message_types_allowed,
    route_type: input.route_type,
    identifier: input.identifier,
    currency: input.currency,
    credit_limit: input.credit_limit,
    log_level: input.log_level,
    tlv_tag: input.tlv_tag,
    tlv_value: input.tlv_value,
    esme_acknowledgement: input.esme_acknowledgement,
    send_validity_period_as_null: input.send_validity_period_as_null,
    enable_affix_for_sms_id: input.enable_affix_for_sms_id,
    enable_decimal_only_for_sms_id: input.enable_decimal_only_for_sms_id,
    auto_import_enabled: input.auto_import_enabled,
    secure_connection_enabled: input.secure_connection_enabled,
    delivery_optional_parameters_enabled:
      input.delivery_optional_parameters_enabled,
    status: input.status,
    notes: input.notes,
  };
}

export function parseSmppConnectionForm(body: unknown, opts?: { isEdit?: boolean }) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const label = String(r.label ?? "").trim();
  const host = String(r.host ?? "").trim();
  const system_id = String(r.system_id ?? "").trim();
  const password = String(r.password ?? "").trim();

  if (!label) throw new ValidationError("Account name es obligatorio.");
  if (!host) throw new ValidationError("Host es obligatorio.");
  if (!system_id) throw new ValidationError("System ID es obligatorio.");
  if (!opts?.isEdit && !password) {
    throw new ValidationError("Password es obligatorio al crear la conexión.");
  }

  const providerRaw = String(r.provider_id ?? "").trim();
  const bind_type = parseBindType(r.bind_type);

  const txRaw = parseOptionalInt(r.transmitter_port);
  const rxRaw = parseOptionalInt(r.receiver_port);
  const legacyPort = parseIntField(r.port, 2775);
  const transmitter_port = txRaw ?? legacyPort;
  const receiver_port = rxRaw ?? transmitter_port;

  const enquire_link_interval_seconds = Math.max(
    1,
    Math.min(3600, parseIntField(r.enquire_link_interval_seconds, 45)),
  );

  return {
    provider_id: providerRaw || null,
    label,
    account_type: parseAccountType(r.account_type),
    account_active: parseBoolField(r.account_active, true),
    host,
    transmitter_port: Math.max(1, Math.min(65535, transmitter_port)),
    receiver_port: Math.max(1, Math.min(65535, receiver_port)),
    system_id,
    password: password || null,
    system_type: String(r.system_type ?? "").trim(),
    bind_type,
    addr_ton: parseIntField(r.addr_ton, 0),
    addr_npi: parseIntField(r.addr_npi, 0),
    source_addr_ton: parseIntField(r.source_addr_ton, 0),
    source_addr_npi: parseIntField(r.source_addr_npi, 0),
    dest_addr_ton: parseIntField(r.dest_addr_ton, 1),
    dest_addr_npi: parseIntField(r.dest_addr_npi, 1),
    source_address: String(r.source_address ?? "").trim() || null,
    response_timeout_seconds: Math.max(
      5,
      Math.min(3600, parseIntField(r.response_timeout_seconds, 300)),
    ),
    enquire_link_interval_seconds,
    submit_speed_per_second: Math.max(
      1,
      parseIntField(r.submit_speed_per_second, 1),
    ),
    delay_time_seconds: Math.max(0, parseIntField(r.delay_time_seconds, 0)),
    sessions: Math.max(1, parseIntField(r.sessions, 1)),
    tps_limit: Math.max(1, parseIntField(r.tps_limit, 1)),
    sender_id_prefix: String(r.sender_id_prefix ?? "").trim() || null,
    phone_number_prepend: String(r.phone_number_prepend ?? "").trim() || null,
    message_types_allowed:
      String(r.message_types_allowed ?? "").trim() || SMPP_DEFAULT_MESSAGE_TYPES,
    route_type: parseRouteType(r.route_type),
    identifier: String(r.identifier ?? "").trim() || null,
    currency: String(r.currency ?? "USD").trim().toUpperCase().slice(0, 8) || "USD",
    credit_limit: parseCreditLimit(r.credit_limit),
    log_level: parseLogLevel(r.log_level),
    tlv_tag: String(r.tlv_tag ?? "").trim() || null,
    tlv_value: String(r.tlv_value ?? "").trim() || null,
    esme_acknowledgement: parseBoolField(r.esme_acknowledgement, false),
    send_validity_period_as_null: parseBoolField(
      r.send_validity_period_as_null,
      false,
    ),
    enable_affix_for_sms_id: parseBoolField(r.enable_affix_for_sms_id, false),
    enable_decimal_only_for_sms_id: parseBoolField(
      r.enable_decimal_only_for_sms_id,
      false,
    ),
    auto_import_enabled: parseBoolField(r.auto_import_enabled, false),
    secure_connection_enabled: parseBoolField(r.secure_connection_enabled, false),
    delivery_optional_parameters_enabled: parseBoolField(
      r.delivery_optional_parameters_enabled,
      false,
    ),
    status: parseSmppStatus(r.status),
    notes: String(r.notes ?? "").trim() || null,
  };
}

export async function listSmppConnections(options?: {
  providerId?: string;
}): Promise<WholesaleSmppConnectionEnriched[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("wholesale_smpp_connections")
    .select("*, wholesale_providers(name)")
    .order("created_at", { ascending: false });
  if (options?.providerId) {
    query = query.eq("provider_id", options.providerId);
  }
  const { data, error } = await query;
  dbError(error, "smppLab");

  const connections = (data ?? []).map((row) => {
    const r = row as WholesaleSmppConnectionRow & {
      wholesale_providers?: { name: string } | null;
    };
    return { ...r, provider_name: r.wholesale_providers?.name };
  });

  const ids = connections.map((c) => c.id);
  if (!ids.length) return connections;

  const { data: tests } = await supabase
    .from("wholesale_smpp_bind_tests")
    .select("*")
    .in("connection_id", ids)
    .order("tested_at", { ascending: false });

  const latestByConn = new Map<string, WholesaleSmppBindTestRow>();
  for (const t of (tests ?? []) as WholesaleSmppBindTestRow[]) {
    if (!latestByConn.has(t.connection_id)) {
      latestByConn.set(t.connection_id, t);
    }
  }

  return connections.map((c) => ({
    ...c,
    last_bind_test: latestByConn.get(c.id) ?? null,
  }));
}

export async function getSmppConnectionById(
  id: string,
): Promise<WholesaleSmppConnectionEnriched> {
  const list = await listSmppConnections();
  const found = list.find((c) => c.id === id);
  if (!found) throw new ValidationError("Conexión SMPP no encontrada.");
  return found;
}

async function loadConnectionConfig(id: string): Promise<SmppConnectionConfig> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_smpp_connections")
    .select("*")
    .eq("id", id)
    .single();
  dbError(error, "smppLab");
  if (!data) throw new ValidationError("Conexión SMPP no encontrada.");

  const row = data as WholesaleSmppConnectionRow;
  let password: string;
  try {
    password = decryptSmppSecret(row.password_encrypted);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(SMPP_CREDENTIALS_UNAVAILABLE_MESSAGE);
  }

  if (!password) {
    throw new ValidationError(SMPP_CREDENTIALS_UNAVAILABLE_MESSAGE);
  }

  return rowToConnectionConfig(row, password);
}

export async function createSmppConnection(
  input: ReturnType<typeof parseSmppConnectionForm>,
): Promise<WholesaleSmppConnectionRow> {
  if (!input.password) {
    throw new ValidationError("Password es obligatorio.");
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_smpp_connections")
    .insert({
      ...connectionPayload(input),
      password_encrypted: encryptSmppSecret(input.password),
    })
    .select("*")
    .single();
  dbError(error, "smppLab");
  return data as WholesaleSmppConnectionRow;
}

export async function updateSmppConnection(
  id: string,
  input: ReturnType<typeof parseSmppConnectionForm>,
): Promise<WholesaleSmppConnectionRow> {
  const supabase = getSupabase();
  const patch: Record<string, unknown> = connectionPayload(input);
  if (input.password) {
    patch.password_encrypted = encryptSmppSecret(input.password);
  }

  const { data, error } = await supabase
    .from("wholesale_smpp_connections")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  dbError(error, "smppLab");
  if (!data) throw new ValidationError("Conexión SMPP no encontrada.");
  return data as WholesaleSmppConnectionRow;
}

export async function deleteSmppConnection(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("wholesale_smpp_connections")
    .delete()
    .eq("id", id);
  dbError(error, "smppLab");
}

export async function listSmppBindTests(
  connectionId?: string,
): Promise<WholesaleSmppBindTestRow[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("wholesale_smpp_bind_tests")
    .select("*")
    .order("tested_at", { ascending: false })
    .limit(50);
  if (connectionId) q = q.eq("connection_id", connectionId);
  const { data, error } = await q;
  dbError(error, "smppLab");
  return (data ?? []) as WholesaleSmppBindTestRow[];
}

export async function listSmppSendTests(
  connectionId?: string,
): Promise<WholesaleSmppSendTestRow[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("wholesale_smpp_send_tests")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(50);
  if (connectionId) q = q.eq("connection_id", connectionId);
  const { data, error } = await q;
  dbError(error, "smppLab");
  return (data ?? []) as WholesaleSmppSendTestRow[];
}

export async function runSmppBindTest(
  connectionId: string,
): Promise<WholesaleSmppBindTestRow> {
  const config = await loadConnectionConfig(connectionId);
  const outcome = await executeSmppBindTest(config);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("wholesale_smpp_bind_tests")
    .insert({
      connection_id: connectionId,
      result: outcome.success ? "success" : "failed",
      error_code: outcome.error_code,
      error_message: outcome.error_message,
      latency_ms: outcome.latency_ms,
    })
    .select("*")
    .single();
  dbError(error, "smppLab");

  await supabase
    .from("wholesale_smpp_connections")
    .update(
      outcome.success
        ? { last_bind_ok_at: new Date().toISOString(), status: "active" }
        : { last_bind_failed_at: new Date().toISOString(), status: "failed" },
    )
    .eq("id", connectionId);

  return data as WholesaleSmppBindTestRow;
}

export function parseSmppSendTestForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const connection_id = String(r.connection_id ?? "").trim();
  const destination_number = String(r.destination_number ?? "").trim();
  const message_text = String(r.message_text ?? "").trim();

  if (!connection_id) throw new ValidationError("Conexión SMPP es obligatoria.");
  if (!destination_number) throw new ValidationError("Número destino es obligatorio.");
  if (!message_text) throw new ValidationError("Texto del mensaje es obligatorio.");
  if (message_text.length > 160) {
    throw new ValidationError("Máximo 160 caracteres para prueba manual.");
  }

  const trafficRaw = String(r.traffic_type ?? "mixed").trim().toLowerCase();
  const trafficMap: Record<string, WholesaleTrafficType> = {
    otp: "otp",
    transactional: "transactional",
    marketing: "promotional",
    promotional: "promotional",
    mixed: "mixed",
  };
  const traffic_type = trafficMap[trafficRaw] ?? "mixed";

  return {
    connection_id,
    destination_number,
    source_address: String(r.source_address ?? "").trim() || null,
    message_text,
    country_code: String(r.country_code ?? "").trim().toUpperCase().slice(0, 3) || null,
    operator_name: String(r.operator_name ?? "").trim() || null,
    traffic_type,
    confirm: String(r.confirm ?? "") === "yes",
  };
}

export async function runSmppSendTest(
  input: ReturnType<typeof parseSmppSendTestForm>,
): Promise<WholesaleSmppSendTestRow> {
  if (!input.confirm) {
    throw new ValidationError("Confirme el envío de prueba marcando la casilla.");
  }

  const config = await loadConnectionConfig(input.connection_id);
  const source =
    input.source_address ?? config.source_address ?? "Telvoice";

  const outcome = await executeSmppSendTest(config, {
    destination_number: input.destination_number,
    source_address: source,
    message_text: input.message_text,
  });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_smpp_send_tests")
    .insert({
      connection_id: input.connection_id,
      destination_number: input.destination_number,
      source_address: source,
      message_text: input.message_text,
      country_code: input.country_code,
      operator_name: input.operator_name,
      traffic_type: input.traffic_type,
      submit_status: outcome.submit_status,
      provider_message_id: outcome.provider_message_id,
      command_status: outcome.command_status,
      error_message: outcome.error_message,
      dlr_status: outcome.dlr_status,
      dlr_received_at:
        outcome.dlr_status === "delivered"
          ? new Date().toISOString()
          : null,
    })
    .select("*")
    .single();
  dbError(error, "smppLab");
  return data as WholesaleSmppSendTestRow;
}

export async function buildSmppNocSnapshot(): Promise<WholesaleSmppNocSnapshot> {
  const supabase = getSupabase();
  const [connections, bindTests, sendTests, routesRes, ratePlansRes] =
    await Promise.all([
      listSmppConnections(),
      listSmppBindTests(),
      listSmppSendTests(),
      supabase.from("wholesale_routes").select("country_code, status"),
      supabase
        .from("wholesale_international_rate_plans")
        .select("status"),
    ]);

  const active = connections.filter((c) => c.status === "active").length;
  const lastBindOk = bindTests.find((t) => t.result === "success") ?? null;
  const lastBindFailed = bindTests.find((t) => t.result === "failed") ?? null;
  const lastSendTest = sendTests[0] ?? null;

  const liveRoutes = ((routesRes.data ?? []) as { country_code: string; status: string }[]).filter(
    (r) => r.status === "live",
  );
  const byCountry = new Map<string, number>();
  for (const r of liveRoutes) {
    const key = r.country_code.toUpperCase();
    byCountry.set(key, (byCountry.get(key) ?? 0) + 1);
  }

  const plans = (ratePlansRes.data ?? []) as { status: string }[];

  return {
    connectionsTotal: connections.length,
    connectionsActive: active,
    lastBindOk,
    lastBindFailed,
    lastSendTest,
    routesLiveByCountry: [...byCountry.entries()].map(([country_iso, count]) => ({
      country_iso,
      count,
    })),
    ratePlansDraft: plans.filter((p) => p.status === "draft").length,
    ratePlansTesting: plans.filter((p) => p.status === "testing").length,
    ratePlansLive: plans.filter((p) => p.status === "live").length,
  };
}
