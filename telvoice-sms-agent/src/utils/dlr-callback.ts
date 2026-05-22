import { buildDlrCallbackUrl } from "../config/env.js";

export function getConfiguredDlrWebhookUrl(): string {
  return buildDlrCallbackUrl() ?? "(no configurada — define PUBLIC_WEBHOOK_BASE_URL)";
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
