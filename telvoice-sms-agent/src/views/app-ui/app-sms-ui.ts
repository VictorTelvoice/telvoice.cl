import { isPanelLiveMode, isPanelMockMode, PANEL_PRODUCTION_MODE } from "../../constants/panel-sms-mode.js";
import type { PanelSmsMessageRow, SmsCampaignRow } from "../../types/sms-panel.js";
import { escapeHtml, formatDate } from "../../utils/html.js";

function badge(cls: string, label: string): string {
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

export function renderPanelMessageStatusBadge(
  status: string | null | undefined,
  mode?: string | null,
): string {
  if (mode === "mock" && (status === "sent" || status === "delivered")) {
    return badge("muted", "simulado");
  }
  const map: Record<string, string> = {
    delivered: "ok",
    sent: "ok",
    queued: "warn",
    pending: "warn",
    failed: "err",
    rejected: "err",
    expired: "muted",
  };
  return badge(map[status ?? ""] ?? "muted", status ?? "—");
}

export function renderSmsModeBadge(mode: string | null | undefined): string {
  if (mode === "mock") {
    return badge("muted", "MOCK");
  }
  if (mode === "live_test" || mode === "live") {
    return badge("ok", "LIVE SEND");
  }
  return badge("ok", (mode ?? "live").toUpperCase());
}

/** Etiqueta comercial en panel cliente (campañas y bandeja reales). */
export function renderClientLiveModeBadge(
  mode: string | null | undefined,
): string {
  if (mode === "mock") {
    return badge("muted", "MOCK");
  }
  if (mode === "live_test" || mode === "live") {
    return badge("ok", "LIVE SEND");
  }
  return badge("ok", (mode ?? "live").toUpperCase());
}

export function renderPanelMessageSourceBadge(
  metadata: Record<string, unknown> | null | undefined,
  mode?: string | null,
): string {
  const source =
    metadata && typeof metadata.source === "string" ? metadata.source : null;
  if (source === "app_send_sms_mock") {
    return badge("muted", "app_send_sms_mock");
  }
  if (source === "app_send_sms_verify_test") {
    return badge("ok", "VERIFY TEST");
  }
  if (source === "app_send_sms_live" || source === "app_send_sms_live_test") {
    return badge("ok", "envío real");
  }
  if (source === "superadmin_provider_test") {
    return badge("ok", "superadmin_provider_test");
  }
  if (mode === "mock") {
    return badge("muted", "mock");
  }
  if (mode === "live_test" || mode === "live") {
    return badge("ok", "LIVE SEND");
  }
  return badge("muted", "—");
}

export function renderAdminPanelModeBadge(
  mode: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string {
  const source =
    metadata && typeof metadata.source === "string" ? metadata.source : "";
  if (source === "superadmin_provider_test") {
    return badge("ok", "SUPERADMIN TEST");
  }
  if (mode === "live_test") {
    return badge("warn", "LIVE TEST");
  }
  if (mode === "mock") {
    return badge("muted", "MOCK");
  }
  return renderSmsModeBadge(mode);
}

export function renderCampaignModeLabel(campaign: SmsCampaignRow): string {
  const meta = campaign.metadata as Record<string, unknown> | undefined;
  const sendMode =
    meta && typeof meta.send_mode === "string" ? meta.send_mode : null;
  if (sendMode === "scheduled") {
    return badge("warn", "PROGRAMADO");
  }
  if (sendMode === "mass") {
    return badge("ok", "MASIVA");
  }
  if (isPanelLiveMode(campaign.mode)) {
    return renderClientLiveModeBadge(campaign.mode);
  }
  if (campaign.status === "draft") {
    return badge("muted", "BORRADOR");
  }
  return renderClientLiveModeBadge(PANEL_PRODUCTION_MODE);
}

export function renderCampaignStatusBadge(status: string): string {
  const map: Record<string, string> = {
    completed: "ok",
    sent: "ok",
    processing: "warn",
    draft: "muted",
    failed: "err",
    cancelled: "muted",
  };
  return badge(map[status] ?? "muted", status);
}

/** Etiqueta operativa para el panel cliente (listado y detalle). */
export function renderCampaignClientStatusBadge(campaign: SmsCampaignRow): string {
  const meta = campaign.metadata ?? {};
  if (campaign.status === "draft") {
    return badge("muted", "Borrador");
  }
  if (campaign.status === "failed") {
    return badge("err", "Fallida");
  }
  if (campaign.status === "processing") {
    return badge("warn", "En curso");
  }
  if (
    campaign.status === "completed" &&
    isPanelMockMode(campaign.mode) &&
    (meta.mock_executed_at || meta.simulated)
  ) {
    return badge("ok", "Completada");
  }
  if (campaign.status === "completed" || campaign.status === "sent") {
    return badge("ok", "Completada");
  }
  if (campaign.status === "cancelled") {
    return badge("muted", "Cancelada");
  }
  return renderCampaignStatusBadge(campaign.status);
}

export function renderInboxTableRows(messages: PanelSmsMessageRow[]): string {
  if (!messages.length) {
    return `<tr><td colspan="9">Aún no hay mensajes enviados.</td></tr>`;
  }
  return messages
    .map(
      (m) => `<tr>
      <td>${formatDate(m.created_at)}</td>
      <td><code>${escapeHtml(m.recipient_number)}</code></td>
      <td>${escapeHtml(m.sender_id ?? "—")}</td>
      <td class="tv-cell-truncate" title="${escapeHtml(m.message)}">${escapeHtml(m.message.slice(0, 50))}${m.message.length > 50 ? "…" : ""}</td>
      <td>${m.segments}</td>
      <td>${renderPanelMessageStatusBadge(m.status, m.mode)}</td>
      <td class="tv-inbox-mode">${renderClientLiveModeBadge(m.mode)}</td>
      <td><code class="tv-code-sm" title="${escapeHtml(m.provider_message_id ?? "")}">${escapeHtml((m.provider_message_id ?? "—").slice(0, 12))}</code></td>
      <td class="tv-cell-truncate" title="${escapeHtml(m.error_message ?? "")}">${escapeHtml(m.error_message ?? "—")}</td>
    </tr>`,
    )
    .join("");
}


export function renderCampaignsTableRows(campaigns: SmsCampaignRow[]): string {
  if (!campaigns.length) {
    return `<tr><td colspan="10">Aún no hay campañas.</td></tr>`;
  }
  return campaigns
    .map(
      (c) => `<tr>
      <td>${formatDate(c.created_at)}</td>
      <td><a href="/app/campaigns/${escapeHtml(c.id)}">${escapeHtml(c.name)}</a></td>
      <td>${escapeHtml(c.sender_id ?? "—")}</td>
      <td>${c.valid_recipients}</td>
      <td>${fmtSmsCost(c)}</td>
      <td>${renderCampaignClientStatusBadge(c)}</td>
      <td>${renderCampaignModeLabel(c)}</td>
      <td>
        <a class="btn btn-ghost btn-sm" href="/app/campaigns/${escapeHtml(c.id)}">Ver detalle</a>
      </td>
    </tr>`,
    )
    .join("");
}

function fmtSmsCost(c: SmsCampaignRow): string {
  const n = c.status === "draft" ? c.estimated_sms_cost : c.real_sms_cost;
  return String(n);
}
