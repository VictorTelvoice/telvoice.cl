import { getSupabase } from "../database/supabaseClient.js";
import type {
  ApiEnvironment,
  ApiStatus,
  ClientApiModuleState,
  ClientApiServiceResult,
  ClientApiSettings,
  ClientApiSettingsInput,
  ClientApiSettingsRow,
  ClientApiWebhookInput,
  WebhookEvent,
  WebhookStatus,
} from "../types/client-api-settings.js";
import { WEBHOOK_EVENTS } from "../types/client-api-settings.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export const DEFAULT_DEMO_API_KEY = "tlv_live_ch7k2m9p4q1n8x6w5v3b2a";

const API_STATUSES: ApiStatus[] = ["Activa", "Pausada", "Pendiente"];
const WEBHOOK_STATUSES: WebhookStatus[] = ["No configurado", "Activo", "Error"];
const ENVIRONMENTS: ApiEnvironment[] = ["Producción", "Sandbox"];

export function buildDefaultClientApiSettings(): ClientApiSettings {
  const now = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const key = DEFAULT_DEMO_API_KEY;
  return {
    apiStatus: "Activa",
    apiKeyDemo: key,
    apiKeyMasked: maskDemoApiKey(key),
    apiKeyLabel: "Demo",
    environment: "Producción",
    createdAt: now,
    lastUsedLabel: "Hace 12 minutos",
    webhookUrl: "",
    webhookStatus: "No configurado",
    webhookEvents: {
      delivered: true,
      failed: true,
      expired: true,
      rejected: true,
    },
    smppRequested: false,
    smppRequestedAt: null,
  };
}

export function generateDemoApiKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "tlv_live_";
  for (let i = 0; i < 20; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export function maskDemoApiKey(key: string): string {
  const clean = key.trim();
  if (clean.length <= 8) {
    return "tlv_live_••••••••••••";
  }
  const suffix = clean.slice(-4);
  return `tlv_live_${"•".repeat(12)}${suffix}`;
}

function parseApiStatus(raw: unknown, fallback: ApiStatus): ApiStatus {
  const v = typeof raw === "string" ? raw.trim() : "";
  return API_STATUSES.includes(v as ApiStatus) ? (v as ApiStatus) : fallback;
}

function parseWebhookStatus(raw: unknown, fallback: WebhookStatus): WebhookStatus {
  const v = typeof raw === "string" ? raw.trim() : "";
  return WEBHOOK_STATUSES.includes(v as WebhookStatus)
    ? (v as WebhookStatus)
    : fallback;
}

function parseEnvironment(raw: unknown, fallback: ApiEnvironment): ApiEnvironment {
  const v = typeof raw === "string" ? raw.trim() : "";
  return ENVIRONMENTS.includes(v as ApiEnvironment) ? (v as ApiEnvironment) : fallback;
}

function parseWebhookEvents(
  raw: unknown,
  fallback: Record<WebhookEvent, boolean>,
): Record<WebhookEvent, boolean> {
  const events = { ...fallback };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && WEBHOOK_EVENTS.includes(item as WebhookEvent)) {
        events[item as WebhookEvent] = true;
      }
    }
    for (const key of WEBHOOK_EVENTS) {
      if (!raw.includes(key)) {
        events[key] = false;
      }
    }
    return events;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const key of WEBHOOK_EVENTS) {
      if (typeof o[key] === "boolean") {
        events[key] = o[key];
      }
    }
  }
  return events;
}

export function webhookEventsToArray(
  events: Record<WebhookEvent, boolean>,
): WebhookEvent[] {
  return WEBHOOK_EVENTS.filter((e) => events[e]);
}

export function mergeSettingsFromRow(
  base: ClientApiSettings,
  row: ClientApiSettingsRow | null,
): ClientApiSettings {
  if (!row) {
    return structuredClone(base);
  }

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const key =
    typeof row.api_key_demo === "string" && row.api_key_demo.trim()
      ? row.api_key_demo.trim()
      : base.apiKeyDemo;

  return {
    apiStatus: parseApiStatus(row.api_status, base.apiStatus),
    apiKeyDemo: key,
    apiKeyMasked:
      typeof row.api_key_masked === "string" && row.api_key_masked.trim()
        ? row.api_key_masked.trim()
        : maskDemoApiKey(key),
    apiKeyLabel:
      typeof row.api_key_label === "string" ? row.api_key_label : base.apiKeyLabel,
    environment: parseEnvironment(row.environment, base.environment),
    createdAt: row.created_at || base.createdAt,
    lastUsedLabel:
      typeof meta.lastUsedLabel === "string"
        ? meta.lastUsedLabel
        : base.lastUsedLabel,
    webhookUrl: row.webhook_url?.trim() ?? "",
    webhookStatus: parseWebhookStatus(row.webhook_status, base.webhookStatus),
    webhookEvents: parseWebhookEvents(row.webhook_events, base.webhookEvents),
    smppRequested: !!row.smpp_requested,
    smppRequestedAt: row.smpp_requested_at ?? null,
  };
}

function settingsToRowPayload(
  settings: ClientApiSettings,
  userId?: string | null,
): Record<string, unknown> {
  return {
    api_status: settings.apiStatus,
    api_key_label: settings.apiKeyLabel,
    api_key_masked: settings.apiKeyMasked,
    api_key_demo: settings.apiKeyDemo,
    environment: settings.environment,
    webhook_url: settings.webhookUrl || null,
    webhook_status: settings.webhookStatus,
    webhook_events: webhookEventsToArray(settings.webhookEvents),
    smpp_requested: settings.smppRequested,
    smpp_requested_at: settings.smppRequestedAt,
    metadata: { lastUsedLabel: settings.lastUsedLabel },
    source: "client_panel",
    user_id: userId ?? null,
  };
}

export function validateWebhookUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    return;
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("invalid");
    }
  } catch {
    throw new AppError("Ingresa una URL válida (http o https).", 400);
  }
}

export function validateWebhookEvents(events: unknown): WebhookEvent[] {
  if (!Array.isArray(events)) {
    throw new AppError("Eventos de webhook inválidos.", 400);
  }
  const out: WebhookEvent[] = [];
  for (const item of events) {
    if (typeof item !== "string" || !WEBHOOK_EVENTS.includes(item as WebhookEvent)) {
      throw new AppError("Evento de webhook no permitido.", 400);
    }
    if (!out.includes(item as WebhookEvent)) {
      out.push(item as WebhookEvent);
    }
  }
  return out;
}

export async function getClientApiSettingsModuleState(): Promise<ClientApiModuleState> {
  const { error } = await getSupabase()
    .from("client_api_settings")
    .select("id")
    .limit(1);

  if (error && isMissingTableError(error)) {
    return { available: false, migrationPending: true };
  }
  if (error) {
    console.warn("[client-api] getClientApiSettingsModuleState", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

async function fetchRow(companyId: string): Promise<ClientApiSettingsRow | null> {
  const { data, error } = await getSupabase()
    .from("client_api_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "fetchClientApiSettings");
  }
  return (data as ClientApiSettingsRow | null) ?? null;
}

export async function getClientApiSettings(
  companyId: string,
  defaults: ClientApiSettings,
): Promise<
  ClientApiServiceResult<{
    settings: ClientApiSettings;
    hasStoredRecord: boolean;
  }>
> {
  try {
    const row = await fetchRow(companyId);
    return {
      ok: true,
      data: {
        settings: mergeSettingsFromRow(defaults, row),
        hasStoredRecord: !!row,
      },
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error al cargar configuración API.";
    console.warn("[client-api] getClientApiSettings", error);
    return { ok: false, error: msg };
  }
}

export async function upsertClientApiSettings(
  input: ClientApiSettingsInput,
): Promise<ClientApiServiceResult<ClientApiSettings>> {
  try {
    const payload = settingsToRowPayload(input.settings, input.userId);
    const { data, error } = await getSupabase()
      .from("client_api_settings")
      .upsert(
        {
          company_id: input.companyId,
          ...payload,
        },
        { onConflict: "company_id" },
      )
      .select("*")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de configuración API no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "upsertClientApiSettings");
    }

    return {
      ok: true,
      data: mergeSettingsFromRow(input.settings, data as ClientApiSettingsRow),
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: error.message };
    }
    const msg =
      error instanceof Error ? error.message : "No se pudo guardar la configuración API.";
    console.warn("[client-api] upsertClientApiSettings", error);
    return { ok: false, error: msg };
  }
}

export async function regenerateDemoApiKey(
  companyId: string,
  defaults: ClientApiSettings,
  userId?: string | null,
): Promise<ClientApiServiceResult<ClientApiSettings>> {
  const current = await getClientApiSettings(companyId, defaults);
  const base = current.ok ? current.data.settings : defaults;

  const key = generateDemoApiKey();
  const next: ClientApiSettings = {
    ...base,
    apiKeyDemo: key,
    apiKeyMasked: maskDemoApiKey(key),
    apiKeyLabel: "Demo",
    createdAt: new Date().toISOString(),
    lastUsedLabel: "Recién generada",
  };

  return upsertClientApiSettings({
    companyId,
    userId,
    settings: next,
  });
}

export async function updateClientWebhookSettings(
  companyId: string,
  defaults: ClientApiSettings,
  input: ClientApiWebhookInput,
  userId?: string | null,
): Promise<ClientApiServiceResult<ClientApiSettings>> {
  validateWebhookUrl(input.webhookUrl);
  const eventsList = validateWebhookEvents(input.webhookEvents);

  const current = await getClientApiSettings(companyId, defaults);
  const base = current.ok ? current.data.settings : defaults;

  const events: Record<WebhookEvent, boolean> = {
    delivered: false,
    failed: false,
    expired: false,
    rejected: false,
  };
  for (const e of WEBHOOK_EVENTS) {
    events[e] = eventsList.includes(e);
  }

  const url = input.webhookUrl.trim();
  const next: ClientApiSettings = {
    ...base,
    webhookUrl: url,
    webhookStatus: url ? "Activo" : "No configurado",
    webhookEvents: events,
  };

  return upsertClientApiSettings({
    companyId,
    userId,
    settings: next,
  });
}

export async function recordWebhookTest(
  companyId: string,
  defaults: ClientApiSettings,
  userId?: string | null,
): Promise<ClientApiServiceResult<ClientApiSettings>> {
  const current = await getClientApiSettings(companyId, defaults);
  const base = current.ok ? current.data.settings : defaults;

  validateWebhookUrl(base.webhookUrl);
  if (!base.webhookUrl.trim()) {
    throw new AppError("Debes configurar una URL de webhook válida.", 400);
  }

  const next: ClientApiSettings = {
    ...base,
    webhookStatus: "Activo",
  };

  return upsertClientApiSettings({
    companyId,
    userId,
    settings: next,
  });
}

export async function requestSmppAccess(
  companyId: string,
  defaults: ClientApiSettings,
  userId?: string | null,
): Promise<ClientApiServiceResult<ClientApiSettings>> {
  const current = await getClientApiSettings(companyId, defaults);
  const base = current.ok ? current.data.settings : defaults;

  const next: ClientApiSettings = {
    ...base,
    smppRequested: true,
    smppRequestedAt: new Date().toISOString(),
  };

  return upsertClientApiSettings({
    companyId,
    userId,
    settings: next,
  });
}
