import { createHash, randomUUID } from "node:crypto";
import { PANEL_PRODUCTION_MODE } from "../constants/panel-sms-mode.js";
import { getSupabase } from "../database/supabaseClient.js";
import type {
  MockSmsSendResult,
  PanelCampaignSendResult,
  SmsCampaignRow,
} from "../types/sms-panel.js";
import { getCompanyBalance } from "./smsWalletService.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { validateUuidParam } from "../utils/validation.js";
import { listPanelMessagesByCampaign } from "./panelSmsMessageService.js";

const IDEMPOTENCY_TTL_HOURS = 24;
const PROCESSING_STALE_MS = 15 * 60 * 1000;
/** Evita reenvío si el usuario recarga la página y obtiene otra clave. */
const MASS_CAMPAIGN_DEDUP_MINUTES = 30;

export type MassFingerprintRow = { phone: string; message: string };

export type SendSmsRedirectParams = {
  ok: string;
  mode?: string;
  campaign_id?: string;
  message_id?: string;
};

type IdempotencyRow = {
  id: string;
  company_id: string;
  status: string;
  campaign_id: string | null;
  message_id: string | null;
  send_mode: string | null;
  flash_text: string | null;
  error_text: string | null;
  updated_at: string;
};

export type BeginIdempotencyResult =
  | { action: "proceed" }
  | { action: "replay"; redirect: SendSmsRedirectParams }
  | { action: "busy" };

function rowToRedirect(row: IdempotencyRow): SendSmsRedirectParams | null {
  if (!row.flash_text) return null;
  return {
    ok: row.flash_text,
    mode: row.send_mode ?? undefined,
    campaign_id: row.campaign_id ?? undefined,
    message_id: row.message_id ?? undefined,
  };
}

export async function issueSendSmsIdempotencyKey(
  companyId: string,
  createdBy?: string | null,
): Promise<string> {
  const id = randomUUID();
  await ensureSendSmsIdempotencyRow(companyId, id, createdBy);
  return id;
}

/** Crea la fila de idempotencia si no existe (p. ej. primera vez que se envía el formulario). */
export async function ensureSendSmsIdempotencyRow(
  companyId: string,
  key: string,
  createdBy?: string | null,
): Promise<void> {
  const id = validateUuidParam(key.trim(), "idempotency_key");
  const existing = await fetchIdempotencyRow(companyId, id);
  if (existing) {
    return;
  }

  const expiresAt = new Date(
    Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await getSupabase().from("sms_send_idempotency").insert({
    id,
    company_id: companyId,
    created_by: createdBy ?? null,
    status: "pending",
    expires_at: expiresAt,
  });

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Idempotencia de envíos no disponible. Aplica la migración 020.",
        503,
      );
    }
    if (error.code === "23505") {
      return;
    }
    wrapSupabaseError(error, "ensureSendSmsIdempotencyRow");
  }
}

async function fetchIdempotencyRow(
  companyId: string,
  key: string,
): Promise<IdempotencyRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_send_idempotency")
    .select(
      "id, company_id, status, campaign_id, message_id, send_mode, flash_text, error_text, updated_at",
    )
    .eq("id", key)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    wrapSupabaseError(error, "fetchIdempotencyRow");
  }

  return (data as IdempotencyRow | null) ?? null;
}

function isProcessingStale(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > PROCESSING_STALE_MS;
}

export async function beginSendSmsIdempotency(
  companyId: string,
  rawKey: string,
  createdBy?: string | null,
): Promise<BeginIdempotencyResult> {
  const key = validateUuidParam(rawKey.trim(), "idempotency_key");
  await ensureSendSmsIdempotencyRow(companyId, key, createdBy);
  const row = await fetchIdempotencyRow(companyId, key);
  if (!row) {
    throw new AppError(
      "Clave de envío inválida o expirada. Recarga la página Enviar SMS e intenta de nuevo.",
      400,
    );
  }

  if (row.status === "completed") {
    const redirect = rowToRedirect(row);
    if (redirect) return { action: "replay", redirect };
  }

  if (row.status === "failed") {
    throw new AppError(
      "Este envío ya falló con esta sesión. Recarga la página para obtener una nueva clave.",
      400,
    );
  }

  if (row.status === "processing") {
    if (!isProcessingStale(row.updated_at)) {
      const redirect = rowToRedirect(row);
      if (redirect) return { action: "replay", redirect };
      if (row.campaign_id) {
        return {
          action: "replay",
          redirect: {
            ok: "Este envío ya está en curso o finalizó. Revisa el resultado abajo.",
            campaign_id: row.campaign_id,
            mode: row.send_mode ?? undefined,
          },
        };
      }
      return { action: "busy" };
    }
    throw new AppError(
      "El envío anterior quedó en proceso demasiado tiempo. Recarga Enviar SMS y, si hace falta, revisa Campañas antes de reintentar.",
      409,
    );
  }

  const { data: claimed, error } = await getSupabase()
    .from("sms_send_idempotency")
    .update({ status: "processing" })
    .eq("id", key)
    .eq("company_id", companyId)
    .eq("status", "pending")
    .select(
      "id, company_id, status, campaign_id, message_id, send_mode, flash_text, error_text, updated_at",
    )
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Idempotencia de envíos no disponible. Aplica la migración 020 en Supabase.",
        503,
      );
    }
    wrapSupabaseError(error, "beginSendSmsIdempotency");
  }

  if (claimed) {
    return { action: "proceed" };
  }

  const latest = await fetchIdempotencyRow(companyId, key);
  if (latest?.status === "completed") {
    const redirect = rowToRedirect(latest);
    if (redirect) return { action: "replay", redirect };
  }
  if (latest?.status === "processing" && !isProcessingStale(latest.updated_at)) {
    return { action: "busy" };
  }

  throw new AppError(
    "No se pudo iniciar el envío (conflicto de idempotencia). Recarga la página.",
    409,
  );
}

export async function completeSendSmsIdempotency(input: {
  companyId: string;
  key: string;
  redirect: SendSmsRedirectParams;
}): Promise<void> {
  const key = validateUuidParam(input.key.trim(), "idempotency_key");
  const { error } = await getSupabase()
    .from("sms_send_idempotency")
    .update({
      status: "completed",
      campaign_id: input.redirect.campaign_id ?? null,
      message_id: input.redirect.message_id ?? null,
      send_mode: input.redirect.mode ?? null,
      flash_text: input.redirect.ok,
      error_text: null,
    })
    .eq("id", key)
    .eq("company_id", input.companyId);

  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "completeSendSmsIdempotency");
  }
}

export async function failSendSmsIdempotency(input: {
  companyId: string;
  key: string;
  errorText: string;
}): Promise<void> {
  const key = validateUuidParam(input.key.trim(), "idempotency_key");
  const { error } = await getSupabase()
    .from("sms_send_idempotency")
    .update({
      status: "failed",
      error_text: input.errorText.slice(0, 500),
    })
    .eq("id", key)
    .eq("company_id", input.companyId);

  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "failSendSmsIdempotency");
  }
}

export function buildMassCampaignFingerprint(
  companyId: string,
  rows: MassFingerprintRow[],
  defaultMessage: string,
  mode: string,
  scheduledAt?: string | null,
): string {
  const lines = rows
    .map((r) => {
      const phone = r.phone.replace(/\s+/g, "").trim();
      const msg = (r.message || defaultMessage).trim();
      return `${phone}|${msg}`;
    })
    .sort()
    .join("\n");
  const schedule = scheduledAt?.trim() ?? "";
  return createHash("sha256")
    .update(`${companyId}\n${mode}\n${schedule}\n${lines}`)
    .digest("hex")
    .slice(0, 40);
}

export async function findRecentCampaignByMassFingerprint(
  companyId: string,
  fingerprint: string,
): Promise<SmsCampaignRow | null> {
  const since = new Date(
    Date.now() - MASS_CAMPAIGN_DEDUP_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await getSupabase()
    .from("sms_campaigns")
    .select("*")
    .eq("company_id", companyId)
    .filter("metadata->>mass_fingerprint", "eq", fingerprint)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    wrapSupabaseError(error, "findRecentCampaignByMassFingerprint");
  }

  return (data as SmsCampaignRow | null) ?? null;
}

export async function pinIdempotencyCampaignId(input: {
  companyId: string;
  key: string;
  campaignId: string;
  sendMode?: string;
}): Promise<void> {
  const key = validateUuidParam(input.key.trim(), "idempotency_key");
  const { error } = await getSupabase()
    .from("sms_send_idempotency")
    .update({
      campaign_id: input.campaignId,
      send_mode: input.sendMode ?? null,
    })
    .eq("id", key)
    .eq("company_id", input.companyId);

  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "pinIdempotencyCampaignId");
  }
}

export async function findCampaignByIdempotencyKey(
  companyId: string,
  idempotencyKey: string,
): Promise<SmsCampaignRow | null> {
  const key = idempotencyKey.trim();
  if (!key) return null;

  const { data, error } = await getSupabase()
    .from("sms_campaigns")
    .select("*")
    .eq("company_id", companyId)
    .filter("metadata->>idempotency_key", "eq", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    wrapSupabaseError(error, "findCampaignByIdempotencyKey");
  }

  return (data as SmsCampaignRow | null) ?? null;
}

export async function panelCampaignSendResultFromRow(
  campaign: SmsCampaignRow,
  companyId: string,
): Promise<PanelCampaignSendResult> {
  const meta = (campaign.metadata ?? {}) as Record<string, unknown>;
  const queued = typeof meta.queued === "number" ? meta.queued : 0;
  const sendMode =
    meta.send_mode === "scheduled" ? "scheduled" : ("mass" as const);
  const bal = await getCompanyBalance(companyId);
  const sentCount =
    campaign.status === "sent"
      ? campaign.valid_recipients
      : Math.max(0, campaign.valid_recipients - queued);

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    mode: sendMode,
    totalRecipients: campaign.valid_recipients,
    sent: sentCount,
    failed: Math.max(0, campaign.total_recipients - campaign.valid_recipients),
    queued,
    balanceBefore: bal.availableSms + campaign.real_sms_cost,
    balanceAfter: bal.availableSms,
    scheduledAt: campaign.scheduled_at,
    smsConsumed: campaign.real_sms_cost,
  };
}

export async function mockSmsSendResultFromIdempotentCampaign(
  campaign: SmsCampaignRow,
  companyId: string,
): Promise<MockSmsSendResult> {
  const messages = await listPanelMessagesByCampaign(campaign.id, 1);
  const m = messages[0];
  const bal = await getCompanyBalance(companyId);
  const cost = m?.cost_sms ?? campaign.estimated_sms_cost;

  return {
    messageId: m?.id ?? "",
    campaignId: campaign.id,
    recipientNumber: m?.recipient_number ?? "",
    segments: m?.segments ?? 1,
    balanceBefore: bal.availableSms + cost,
    balanceAfter: bal.availableSms,
    status: m?.status ?? "sent",
    providerMessageId: m?.provider_message_id ?? "",
    sendMode: PANEL_PRODUCTION_MODE,
  };
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const direct = (error as { code?: string }).code;
  if (direct === "23505") return true;
  const details = (error as { details?: { code?: string } }).details;
  if (details?.code === "23505") return true;
  const message = String((error as { message?: string }).message ?? "");
  return (
    message.includes("duplicate key") ||
    message.includes("idx_sms_campaigns_company_idempotency_key")
  );
}
