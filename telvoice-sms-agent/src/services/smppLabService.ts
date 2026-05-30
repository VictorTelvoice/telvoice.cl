import { getSupabase } from "../database/supabaseClient.js";
import type {
  SmppBindType,
  SmppConnectionStatus,
  WholesaleSmppBindTestRow,
  WholesaleSmppConnectionEnriched,
  WholesaleSmppConnectionRow,
  WholesaleSmppNocSnapshot,
  WholesaleSmppSendTestRow,
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

export function parseSmppConnectionForm(body: unknown, opts?: { isEdit?: boolean }) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const label = String(r.label ?? "").trim();
  const host = String(r.host ?? "").trim();
  const system_id = String(r.system_id ?? "").trim();
  const password = String(r.password ?? "").trim();

  if (!label) throw new ValidationError("Nombre / label es obligatorio.");
  if (!host) throw new ValidationError("Host es obligatorio.");
  if (!system_id) throw new ValidationError("System ID es obligatorio.");
  if (!opts?.isEdit && !password) {
    throw new ValidationError("Password es obligatorio al crear la conexión.");
  }

  const providerRaw = String(r.provider_id ?? "").trim();

  return {
    provider_id: providerRaw || null,
    label,
    host,
    port: Math.max(1, Math.min(65535, parseIntField(r.port, 2775))),
    system_id,
    password: password || null,
    system_type: String(r.system_type ?? "").trim(),
    bind_type: parseBindType(r.bind_type),
    source_addr_ton: parseIntField(r.source_addr_ton, 0),
    source_addr_npi: parseIntField(r.source_addr_npi, 0),
    source_address: String(r.source_address ?? "").trim() || null,
    tps_limit: Math.max(1, parseIntField(r.tps_limit, 1)),
    enquire_link_interval: Math.max(
      5000,
      parseIntField(r.enquire_link_interval, 30_000),
    ),
    status: parseSmppStatus(r.status),
    notes: String(r.notes ?? "").trim() || null,
  };
}

export async function listSmppConnections(): Promise<WholesaleSmppConnectionEnriched[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_smpp_connections")
    .select("*, wholesale_providers(name)")
    .order("created_at", { ascending: false });
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

  return {
    host: row.host,
    port: row.port,
    system_id: row.system_id,
    password,
    system_type: row.system_type,
    bind_type: row.bind_type,
    source_addr_ton: row.source_addr_ton,
    source_addr_npi: row.source_addr_npi,
    source_address: row.source_address,
    enquire_link_interval: row.enquire_link_interval,
  };
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
      provider_id: input.provider_id,
      label: input.label,
      host: input.host,
      port: input.port,
      system_id: input.system_id,
      password_encrypted: encryptSmppSecret(input.password),
      system_type: input.system_type,
      bind_type: input.bind_type,
      source_addr_ton: input.source_addr_ton,
      source_addr_npi: input.source_addr_npi,
      source_address: input.source_address,
      tps_limit: input.tps_limit,
      enquire_link_interval: input.enquire_link_interval,
      status: input.status,
      notes: input.notes,
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
  const patch: Record<string, unknown> = {
    provider_id: input.provider_id,
    label: input.label,
    host: input.host,
    port: input.port,
    system_id: input.system_id,
    system_type: input.system_type,
    bind_type: input.bind_type,
    source_addr_ton: input.source_addr_ton,
    source_addr_npi: input.source_addr_npi,
    source_address: input.source_address,
    tps_limit: input.tps_limit,
    enquire_link_interval: input.enquire_link_interval,
    status: input.status,
    notes: input.notes,
  };
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
