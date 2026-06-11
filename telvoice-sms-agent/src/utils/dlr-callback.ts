import { buildDlrCallbackUrl, env } from "../config/env.js";
import { AppError } from "./errors.js";

export function getConfiguredDlrWebhookUrl(): string {
  return buildDlrCallbackUrl() ?? "(no configurada — define PUBLIC_WEBHOOK_BASE_URL)";
}

function dlrWebhookHostname(): string {
  const base = env.publicWebhookBaseUrl;
  if (!base) {
    return "";
  }
  try {
    return new URL(base).hostname.toLowerCase();
  } catch {
    return base.toLowerCase();
  }
}

/** Host QA/staging: no debe procesar cola live compartida con producción. */
export function isNonProductionDlrWebhookHost(): boolean {
  const host = dlrWebhookHostname();
  if (!host) {
    return true;
  }
  return host.includes("-qa") || host.includes(".qa.");
}

export type LiveSmsQueueGate = {
  allowed: boolean;
  reason: string;
};

/** Cola de campañas live: solo instancias con webhook productivo. */
export function canProcessLiveSmsQueue(): LiveSmsQueueGate {
  if (!env.publicWebhookBaseUrl) {
    return {
      allowed: false,
      reason: "PUBLIC_WEBHOOK_BASE_URL no configurada",
    };
  }
  if (isWebhookUrlLocalhost(env.publicWebhookBaseUrl)) {
    return {
      allowed: false,
      reason: "PUBLIC_WEBHOOK_BASE_URL apunta a localhost",
    };
  }
  if (isNonProductionDlrWebhookHost()) {
    return {
      allowed: false,
      reason: `DLR webhook en host no productivo (${env.publicWebhookBaseUrl})`,
    };
  }
  return { allowed: true, reason: "" };
}

/** Envío live directo (panel/API): bloquea localhost y QA salvo override explícito. */
export function assertDlrWebhookSafeForLiveTraffic(): void {
  if (!env.publicWebhookBaseUrl) {
    throw new AppError(
      "PUBLIC_WEBHOOK_BASE_URL requerida para envíos SMS live.",
      503,
    );
  }
  if (isWebhookUrlLocalhost(env.publicWebhookBaseUrl)) {
    throw new AppError(
      "PUBLIC_WEBHOOK_BASE_URL no puede ser localhost en envíos SMS live.",
      503,
    );
  }
  const allowQaWebhook =
    optionalEnvFlag("SMS_ALLOW_QA_DLR_WEBHOOK") ||
    optionalEnvFlag("SMS_ALLOW_NON_PRODUCTION_DLR_WEBHOOK");
  if (isNonProductionDlrWebhookHost() && !allowQaWebhook) {
    throw new AppError(
      `Envío live bloqueado: DLR apunta a ${env.publicWebhookBaseUrl}. En producción use https://agent.telvoice.cl.`,
      503,
    );
  }
}

function optionalEnvFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function extractCallbackUrlFromSubmitResponse(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw) {
    return null;
  }

  const agent = raw._agent;
  if (agent && typeof agent === "object" && agent !== null) {
    const url = (agent as Record<string, unknown>).callback_url;
    if (typeof url === "string" && url.trim()) {
      return url.trim();
    }
  }

  const direct = raw.callback_url;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  return null;
}

export function isWebhookUrlLocalhost(webhookBase: string): boolean {
  const lower = webhookBase.toLowerCase();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("0.0.0.0")
  );
}

export function isAwaitingDlr(status: string, deliveredAt: string | null): boolean {
  if (deliveredAt) {
    return false;
  }
  const awaiting = ["submitted", "pending", "unknown"];
  return awaiting.includes(status);
}
