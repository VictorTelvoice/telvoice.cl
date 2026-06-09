import type { AdminSessionUser } from "../../../types/admin.js";
import type { AdminInboundSmsItem } from "../../../services/adminInboundSmsService.js";
import type { AdminSmsInboxFilters } from "../../../services/adminInboundSmsService.js";
import type { CompanyRow } from "../../../types/tenant.js";
import type { InboundSmsStatus } from "../../../types/client-numbers.js";
import { inboundSmsStatusLabel } from "../../../services/inboundSmsService.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { renderAgentModuleStyles } from "../../shared/agent-module-styles.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderBtn,
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

export type AdminSmsInboxPageOpts = {
  admin: AdminSessionUser;
  flash?: string;
  error?: string;
};

export type AdminSmsInboxPageContext = {
  filters: AdminSmsInboxFilters;
  messages: AdminInboundSmsItem[];
  companies: CompanyRow[];
  selectedMessage: AdminInboundSmsItem | null;
};

function pickQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = query[key];
  return typeof v === "string" ? v.trim() : "";
}

export function parseAdminSmsInboxFilters(
  query: Record<string, string | string[] | undefined>,
): AdminSmsInboxFilters {
  return {
    company_id: pickQuery(query, "company_id") || undefined,
    number_id: pickQuery(query, "number_id") || undefined,
    q: pickQuery(query, "q") || undefined,
    from: pickQuery(query, "from") || undefined,
    start_date: pickQuery(query, "start_date") || undefined,
    end_date: pickQuery(query, "end_date") || undefined,
  };
}

function wrap(opts: AdminSmsInboxPageOpts, body: string): string {
  const alert = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : opts.flash
      ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>`
      : "";
  return wrapAdminPage({
    admin: opts.admin,
    title: "SMS entrantes",
    activeNav: "sms-inbound",
    body: alert + body,
  });
}

function smsStatusBadge(status: InboundSmsStatus): string {
  const clsMap: Record<InboundSmsStatus, string> = {
    received: "warn",
    read: "ok",
    archived: "muted",
    forwarded: "ok",
    failed: "err",
  };
  const cls = clsMap[status] ?? "muted";
  return `<span class="badge badge-${cls}">${escapeHtml(inboundSmsStatusLabel(status))}</span>`;
}

function renderFilters(
  filters: AdminSmsInboxFilters,
  companies: CompanyRow[],
): string {
  const companyOpts = [
    `<option value="">Todas las empresas</option>`,
    ...companies.map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${filters.company_id === c.id ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
    ),
  ].join("");

  return renderPanel(
    "Filtros",
    `<form method="get" action="/admin/sms-inbox">
      ${renderFilterBar(`
        ${renderFilterField("Empresa", `<select name="company_id" class="tv-filter-input">${companyOpts}</select>`)}
        ${renderFilterField("Remitente", `<input name="from" class="tv-filter-input" value="${escapeHtml(filters.from ?? "")}" placeholder="Ej. Banco QA" />`)}
        ${renderFilterField("Buscar", `<input name="q" class="tv-filter-input" value="${escapeHtml(filters.q ?? "")}" placeholder="Contenido, OTP, número…" />`)}
        ${renderFilterField("Desde", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(filters.start_date ?? "")}" />`)}
        ${renderFilterField("Hasta", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(filters.end_date ?? "")}" />`)}
        <button type="submit" class="btn btn-primary btn-sm">Filtrar</button>
        <a href="/admin/sms-inbox" class="btn btn-ghost btn-sm">Limpiar</a>
      `)}
    </form>`,
  );
}

function renderTable(messages: AdminInboundSmsItem[]): string {
  if (!messages.length) {
    return `<p class="field-hint">No hay SMS entrantes registrados con los filtros aplicados.</p>`;
  }
  const rows = messages
    .map((m) => {
      const otpCell = m.detected_otp
        ? `<span class="tv-otp-pill">OTP <code>${escapeHtml(m.detected_otp)}</code></span>`
        : "—";
      return `<tr>
        <td>${formatDate(m.received_at)}</td>
        <td><strong>${escapeHtml(m.company_name)}</strong></td>
        <td>${escapeHtml(m.client_number_label)}</td>
        <td>${escapeHtml(m.from_number ?? "—")}</td>
        <td class="tv-sms-snippet">${escapeHtml(m.body.slice(0, 72))}${m.body.length > 72 ? "…" : ""}</td>
        <td>${otpCell}</td>
        <td>${smsStatusBadge(m.status)}</td>
        <td><code>${escapeHtml(m.source ?? "—")}</code></td>
        <td><a href="/admin/sms-inbox?msg=${encodeURIComponent(m.id)}" class="btn btn-ghost btn-sm">Ver</a></td>
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
    <th>Fecha</th><th>Empresa</th><th>Número receptor</th><th>Remitente</th><th>Mensaje</th><th>OTP</th><th>Estado</th><th>Origen</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderDetail(msg: AdminInboundSmsItem): string {
  const otpBlock = msg.detected_otp
    ? `<div class="tv-sms-inbox-detail__otp" style="margin:1rem 0">
        <span class="tv-sms-inbox-detail__otp-label">OTP detectado</span>
        <code class="tv-sms-inbox-detail__otp-code">${escapeHtml(msg.detected_otp)}</code>
        <span class="tv-otp-pill">Código detectado</span>
      </div>`
    : "";

  const meta =
    msg.metadata && Object.keys(msg.metadata).length
      ? `<details style="margin-top:1rem"><summary class="field-hint">Metadata técnica</summary>
         <pre class="tv-code-block">${escapeHtml(JSON.stringify(msg.metadata, null, 2))}</pre></details>`
      : "";

  return renderPanel(
    "Detalle del SMS",
    `<dl class="tv-dl-grid">
      <dt>ID</dt><dd><code>${escapeHtml(msg.id)}</code></dd>
      <dt>Empresa</dt><dd><strong>${escapeHtml(msg.company_name)}</strong></dd>
      <dt>Receptor</dt><dd>${escapeHtml(msg.to_number)}</dd>
      <dt>Remitente</dt><dd>${escapeHtml(msg.from_number ?? "—")}</dd>
      <dt>Estado</dt><dd>${smsStatusBadge(msg.status)}</dd>
      <dt>Origen</dt><dd><code>${escapeHtml(msg.source ?? "—")}</code></dd>
      <dt>Fecha</dt><dd>${formatDate(msg.received_at)}</dd>
    </dl>
    ${otpBlock}
    <div class="tv-sms-inbox-detail__body" style="margin-top:0.5rem">${escapeHtml(msg.body)}</div>
    ${meta}
    <p class="field-hint" style="margin-top:1rem">Errores de webhook o Telegram se mostrarán en integraciones cuando existan reenvíos configurados.</p>`,
  );
}

export function renderAdminSmsInboxPage(
  opts: AdminSmsInboxPageOpts,
  ctx: AdminSmsInboxPageContext,
): string {
  const detail = ctx.selectedMessage ? renderDetail(ctx.selectedMessage) : "";
  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "SMS entrantes",
      subtitle: "Vista global NOC — mensajes MO recibidos en numeraciones Telvoice.",
      actions: renderBtn("Numeraciones", { href: "/admin/numeraciones", variant: "secondary", size: "sm", icon: "sim_card" }),
    })}
    ${renderFilters(ctx.filters, ctx.companies)}
    ${detail}
    ${renderPanel("Mensajes entrantes", renderTable(ctx.messages))}
    <style>
      .tv-code-block { font-size: 0.75rem; overflow: auto; max-height: 12rem; padding: 0.75rem; border-radius: 6px; background: rgba(15,23,42,0.04); }
    </style>
    ${renderAgentModuleStyles()}`;
  return wrap(opts, body);
}
