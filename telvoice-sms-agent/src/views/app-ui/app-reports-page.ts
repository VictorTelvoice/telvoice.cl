import type {
  DlrReportFilters,
  DlrReportResult,
} from "../../services/smsDlrReportService.js";
import { formatDisplayDate } from "../../services/smsDlrReportService.js";
import { escapeHtml } from "../../utils/html.js";
import {
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
} from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

const DLR_STATUS_OPTIONS = [
  "Delivered",
  "Sent",
  "Pending",
  "Failed",
  "Queued",
  "Rejected",
];

function queryStringFromFilters(
  filters: DlrReportFilters,
  extra?: Record<string, string>,
): string {
  const p = new URLSearchParams();
  if (filters.startDate) {
    p.set("start_date", filters.startDate);
  }
  if (filters.endDate) {
    p.set("end_date", filters.endDate);
  }
  if (filters.senderId) {
    p.set("sender_id", filters.senderId);
  }
  if (filters.phoneNumber) {
    p.set("phone", filters.phoneNumber);
  }
  if (filters.jobId) {
    p.set("job_id", filters.jobId);
  }
  if (filters.dlrStatuses?.length) {
    p.set("status", filters.dlrStatuses.join(","));
  }
  if (filters.country && filters.country !== "all") {
    p.set("country", filters.country);
  }
  if (filters.mcc) {
    p.set("mcc", filters.mcc);
  }
  if (filters.mnc) {
    p.set("mnc", filters.mnc);
  }
  if (filters.page && filters.page > 1) {
    p.set("page", String(filters.page));
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      p.set(k, v);
    }
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function renderStatusFilters(selected: string[]): string {
  const chips = DLR_STATUS_OPTIONS.map((s) => {
    const on = selected.some((x) => x.toLowerCase() === s.toLowerCase());
    return `<label class="tv-dlr-report__status-chip">
      <input type="checkbox" name="status" value="${escapeHtml(s)}"${on ? " checked" : ""} />
      <span>${escapeHtml(s)}</span>
    </label>`;
  }).join("");
  return `<div class="tv-dlr-report__status-chips">${chips}</div>`;
}

function renderDlrTableRows(result: DlrReportResult): string {
  if (!result.rows.length) {
    return `<tr><td colspan="12" class="tv-table-empty">No hay registros con los filtros aplicados.</td></tr>`;
  }
  return result.rows
    .map((r) => {
      const statusCls =
        r.dlrStatus.toLowerCase() === "delivered"
          ? "ok"
          : r.dlrStatus.toLowerCase() === "sent"
            ? "warn"
            : "muted";
      return `<tr>
        <td class="tv-dlr-report__mono" title="${escapeHtml(r.smsId)}">${escapeHtml(r.smsId.length > 28 ? `${r.smsId.slice(0, 28)}…` : r.smsId)}</td>
        <td>${escapeHtml(r.senderId)}</td>
        <td><span class="badge badge-${statusCls}">${escapeHtml(r.dlrStatus)}</span></td>
        <td class="tv-dlr-report__msg">${escapeHtml(r.smsMessage.length > 48 ? `${r.smsMessage.slice(0, 48)}…` : r.smsMessage)}</td>
        <td><code>${escapeHtml(r.phoneNumber)}</code></td>
        <td>${escapeHtml(r.mcc)}</td>
        <td>${escapeHtml(r.mnc)}</td>
        <td>${escapeHtml(r.messageType)}</td>
        <td>${escapeHtml(r.smsType)}</td>
        <td class="tv-dlr-report__num">${r.messageParts}</td>
        <td>${escapeHtml(r.clientCost)}</td>
        <td class="tv-dlr-report__date">${escapeHtml(formatDisplayDate(r.dlrDateUtc || r.sentDateUtc || r.submitDateUtc))}</td>
      </tr>`;
    })
    .join("");
}

function renderPagination(
  result: DlrReportResult,
  filters: DlrReportFilters,
): string {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const page = result.page;
  const from = result.total === 0 ? 0 : (page - 1) * result.pageSize + 1;
  const to = Math.min(page * result.pageSize, result.total);

  const prev =
    page > 1
      ? `<a class="btn btn-ghost btn-sm" href="/app/reports${queryStringFromFilters({ ...filters, page: page - 1 })}">Anterior</a>`
      : `<span class="btn btn-ghost btn-sm" aria-disabled="true">Anterior</span>`;
  const next =
    page < totalPages
      ? `<a class="btn btn-ghost btn-sm" href="/app/reports${queryStringFromFilters({ ...filters, page: page + 1 })}">Siguiente</a>`
      : `<span class="btn btn-ghost btn-sm" aria-disabled="true">Siguiente</span>`;

  return `<div class="tv-dlr-report__pager">
    <div class="tv-dlr-report__pager-actions">${prev} <span class="tv-dlr-report__pager-page">${page} / ${totalPages}</span> ${next}</div>
    <span class="field-hint">${from} – ${to} de ${result.total} registros</span>
  </div>`;
}

export function renderAppReportsPage(
  ctx: AppPageContext,
  result: DlrReportResult,
  filters: DlrReportFilters,
): string {
  const selectedStatus = filters.dlrStatuses ?? [];
  const exportQs = queryStringFromFilters(filters);
  const countryOpts = [
    `<option value="all"${!filters.country || filters.country === "all" ? " selected" : ""}>Todos</option>`,
    ...result.filterOptions.countries.map(
      (c) =>
        `<option value="${escapeHtml(c)}"${filters.country === c ? " selected" : ""}>${escapeHtml(c)}</option>`,
    ),
  ].join("");

  const mccOpts = [
    `<option value="">${escapeHtml("Todos")}</option>`,
    ...result.filterOptions.mccs.map(
      (m) =>
        `<option value="${escapeHtml(m)}"${filters.mcc === m ? " selected" : ""}>${escapeHtml(m)}</option>`,
    ),
  ].join("");

  const mncOpts = [
    `<option value="">${escapeHtml("Todos")}</option>`,
    ...result.filterOptions.mncs.map(
      (m) =>
        `<option value="${escapeHtml(m)}"${filters.mnc === m ? " selected" : ""}>${escapeHtml(m)}</option>`,
    ),
  ].join("");

  const filtersForm = `
    <form method="get" action="/app/reports" class="tv-dlr-report__filters-form">
      ${renderFilterBar(`
        ${renderFilterField("Desde", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(filters.startDate ?? "")}" />`)}
        ${renderFilterField("Hasta", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(filters.endDate ?? "")}" />`)}
        ${renderFilterField("Sender ID", `<input type="text" name="sender_id" class="tv-filter-input" placeholder="Ej. TELVOICE" value="${escapeHtml(filters.senderId ?? "")}" />`)}
        ${renderFilterField("Teléfono", `<input type="text" name="phone" class="tv-filter-input" placeholder="569…" value="${escapeHtml(filters.phoneNumber ?? "")}" />`)}
        ${renderFilterField("Job / Campaña", `<input type="text" name="job_id" class="tv-filter-input" placeholder="ID campaña (opcional)" value="${escapeHtml(filters.jobId ?? "")}" />`)}
        ${renderFilterField("Estado DLR", renderStatusFilters(selectedStatus))}
        ${renderFilterField("País", `<select name="country" class="tv-filter-input">${countryOpts}</select>`)}
        ${renderFilterField("MCC", `<select name="mcc" class="tv-filter-input">${mccOpts}</select>`)}
        ${renderFilterField("MNC", `<select name="mnc" class="tv-filter-input">${mncOpts}</select>`)}
        <div class="tv-filter-actions tv-dlr-report__filter-actions">
          <button type="submit" class="btn btn-primary btn-sm">Ver reporte DLR</button>
          <a class="btn btn-secondary btn-sm" href="/app/reports/export.csv${exportQs}">Descargar CSV</a>
          <a class="btn btn-ghost btn-sm" href="/app/reports">Limpiar</a>
        </div>
      `)}
    </form>`;

  const summary = result.summary;
  const body = `
    <div class="tv-dlr-report">
    ${renderPageHeader({
      title: "Reporte DLR",
      subtitle: "Detalle de envíos y confirmaciones de entrega (estilo operador).",
    })}
    ${filtersForm}
    <div class="tv-kpi-grid tv-kpi-grid--client" style="margin-bottom:1rem">
      <article class="tv-kpi"><span class="tv-kpi__label">Registros</span><span class="tv-kpi__value">${summary.total}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Entregados</span><span class="tv-kpi__value">${summary.delivered}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Enviados (sin DLR)</span><span class="tv-kpi__value">${summary.sent}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Fallidos</span><span class="tv-kpi__value">${summary.failed}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Pendientes</span><span class="tv-kpi__value">${summary.pending}</span></article>
    </div>
    <section class="tv-panel tv-dlr-report__table-panel">
      <header class="tv-section-head">
        <h2 class="tv-section-head__title">DLR Report</h2>
        <p class="tv-section-head__sub">Campos alineados con exportación aSMSC / Amuqeet</p>
      </header>
      <div class="table-wrap tv-panel__body tv-dlr-report__table-wrap">
        <table class="tv-table tv-table--dense tv-dlr-report__table">
          <thead><tr>
            <th>SMS ID</th><th>Sender ID</th><th>DLR Status</th><th>Message</th><th>Number</th>
            <th>MCC</th><th>MNC</th><th>Type</th><th>SMS Type</th><th>Parts</th><th>Cost</th><th>DLR Date</th>
          </tr></thead>
          <tbody>${renderDlrTableRows(result)}</tbody>
        </table>
      </div>
      ${renderPagination(result, filters)}
      <details class="tv-dlr-report__columns">
        <summary>Ver todas las columnas del CSV (${CSV_COLUMN_HINT})</summary>
        <p class="field-hint">La descarga CSV incluye: JobID, SMSID, CustomerName, SenderID, DLRStatus, PhoneNumber, MCC, MNC, CountryRealName, OperatorName, SMSSource, MessageType, MessageLength, MessageParts, ClientRate, ClientCost, SubmitDateUTC, SentDateUTC, DLRDateUTC, ErrorCode, CharactersAdded, SMSMessage, SMSType.</p>
      </details>
    </section>
    </div>`;

  return wrapAppPage(ctx, "reports", "Reportes", body);
}

const CSV_COLUMN_HINT = "22 columnas";
