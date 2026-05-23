import type { PanelSmsMessageRow, SmsCampaignRow } from "../../types/sms-panel.js";
import { escapeHtml, formatDate } from "../../utils/html.js";

function badge(cls: string, label: string): string {
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

export function renderPanelMessageStatusBadge(
  status: string | null | undefined,
): string {
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
    return badge("muted", "mock");
  }
  return badge("ok", mode ?? "live");
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

export function renderInboxTableRows(messages: PanelSmsMessageRow[]): string {
  if (!messages.length) {
    return `<tr><td colspan="8">Aún no hay mensajes enviados.</td></tr>`;
  }
  return messages
    .map(
      (m) => `<tr>
      <td>${formatDate(m.created_at)}</td>
      <td><code>${escapeHtml(m.recipient_number)}</code></td>
      <td>${escapeHtml(m.sender_id ?? "—")}</td>
      <td class="tv-cell-truncate" title="${escapeHtml(m.message)}">${escapeHtml(m.message.slice(0, 60))}${m.message.length > 60 ? "…" : ""}</td>
      <td>${m.segments}</td>
      <td>${renderPanelMessageStatusBadge(m.status)}</td>
      <td>${renderSmsModeBadge(m.mode)}</td>
      <td><code class="tv-code-sm">${escapeHtml(m.id.slice(0, 8))}</code></td>
    </tr>`,
    )
    .join("");
}

export function renderCampaignsTableRows(campaigns: SmsCampaignRow[]): string {
  if (!campaigns.length) {
    return `<tr><td colspan="9">Aún no hay campañas.</td></tr>`;
  }
  return campaigns
    .map(
      (c) => `<tr>
      <td>${formatDate(c.created_at)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.sender_id ?? "—")}</td>
      <td>${c.total_recipients}</td>
      <td>${c.valid_recipients}</td>
      <td>${c.real_sms_cost}</td>
      <td>${renderCampaignStatusBadge(c.status)}</td>
      <td>${renderSmsModeBadge(c.mode)}</td>
      <td><code class="tv-code-sm">${escapeHtml(c.id.slice(0, 8))}</code></td>
    </tr>`,
    )
    .join("");
}
