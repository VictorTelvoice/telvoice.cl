import type {
  DlrReportFilters,
  DlrReportResult,
} from "../../services/smsDlrReportService.js";
import { formatDisplayDate } from "../../services/smsDlrReportService.js";
import { escapeHtml } from "../../utils/html.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  renderClientDataTablePanel,
  renderClientTableCountText,
} from "./client-table-kit.js";

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
  if (filters.pageSize && filters.pageSize !== 20) {
    p.set("page_size", String(filters.pageSize));
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      p.set(k, v);
    }
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function renderStatusSelect(selected: string[]): string {
  const current = selected[0] ?? "";
  const opts = [
    `<option value="">Todos</option>`,
    ...DLR_STATUS_OPTIONS.map((s) => {
      const on = current.toLowerCase() === s.toLowerCase();
      return `<option value="${escapeHtml(s)}"${on ? " selected" : ""}>${escapeHtml(s)}</option>`;
    }),
  ].join("");
  return `<select name="status" class="tv-filter-input">${opts}</select>`;
}

const DLR_TABLE_COL_COUNT = 15;

function formatErrorDisplay(code: string, description: string): string {
  const c = (code || "0").trim();
  const d = description.trim();
  if (!d || d === c) {
    return c || "0";
  }
  if (c === "0" || c === "") {
    return d;
  }
  return `${c} — ${d}`;
}

function renderErrorDescCell(code: string, description: string): string {
  const full = formatErrorDisplay(code, description);
  const show = full === "0" ? "—" : full;
  return `<td class="tv-dlr-report__error-desc" title="${escapeHtml(show)}">${escapeHtml(show)}</td>`;
}

function renderDlrTableRows(result: DlrReportResult): string {
  if (!result.rows.length) {
    return `<tr><td colspan="${DLR_TABLE_COL_COUNT}" class="tv-table-empty">No hay registros con los filtros aplicados.</td></tr>`;
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
        <td class="tv-dlr-report__date">${escapeHtml(formatDisplayDate(r.sentAtIso || r.sentDateUtc))}</td>
        <td class="tv-dlr-report__msg" title="${escapeHtml(r.smsMessage)}">${escapeHtml(r.smsMessage)}</td>
        <td><code>${escapeHtml(r.phoneNumber)}</code></td>
        <td>${escapeHtml(r.mcc)}</td>
        <td>${escapeHtml(r.mnc)}</td>
        <td>${escapeHtml(r.countryRealName)}</td>
        <td>${escapeHtml(r.messageType)}</td>
        <td>${escapeHtml(r.smsType)}</td>
        <td class="tv-dlr-report__num">${r.messageParts}</td>
        <td class="tv-dlr-report__date">${escapeHtml(formatDisplayDate(r.dlrAtIso || r.dlrDateUtc))}</td>
        <td class="tv-dlr-report__mono tv-dlr-report__error-code">${escapeHtml(r.errorCode || "0")}</td>
        ${renderErrorDescCell(r.errorCode, r.errorDescription)}
      </tr>`;
    })
    .join("");
}

function renderPaginationControls(
  result: DlrReportResult,
  filters: DlrReportFilters,
): string {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const page = result.page;

  const prev =
    page > 1
      ? `<a class="btn btn-ghost btn-sm" href="/app/reports${queryStringFromFilters({ ...filters, page: page - 1 })}">Anterior</a>`
      : `<span class="btn btn-ghost btn-sm" aria-disabled="true">Anterior</span>`;
  const next =
    page < totalPages
      ? `<a class="btn btn-ghost btn-sm" href="/app/reports${queryStringFromFilters({ ...filters, page: page + 1 })}">Siguiente</a>`
      : `<span class="btn btn-ghost btn-sm" aria-disabled="true">Siguiente</span>`;

  return `<div class="tv-client-data-table__pager">${prev}<span class="tv-client-data-table__pager-page">${page} / ${totalPages}</span>${next}</div>`;
}

function renderDlrTableFooter(
  result: DlrReportResult,
  filters: DlrReportFilters,
): string {
  const page = result.page;
  const from = result.total === 0 ? 0 : (page - 1) * result.pageSize + 1;
  const to = Math.min(page * result.pageSize, result.total);
  const countText =
    result.total === 0
      ? "Mostrando 0 registros con filtros aplicados"
      : result.total === result.rows.length && page === 1
        ? renderClientTableCountText(result.rows.length, {
            hint: "con filtros aplicados",
          })
        : `Mostrando ${from}–${to} de ${result.total} registros con filtros aplicados`;

  return `<footer class="tv-client-data-table__footer">
    <p class="tv-client-data-table__footer-meta">${escapeHtml(countText)}</p>
    <div class="tv-client-data-table__footer-actions">
      ${renderPaginationControls(result, filters)}
      <form method="get" action="/app/reports" class="tv-client-data-table__footer-limit">
        ${[
          filters.startDate ? `<input type="hidden" name="start_date" value="${escapeHtml(filters.startDate)}" />` : "",
          filters.endDate ? `<input type="hidden" name="end_date" value="${escapeHtml(filters.endDate)}" />` : "",
          filters.senderId ? `<input type="hidden" name="sender_id" value="${escapeHtml(filters.senderId)}" />` : "",
          filters.phoneNumber ? `<input type="hidden" name="phone" value="${escapeHtml(filters.phoneNumber)}" />` : "",
          filters.jobId ? `<input type="hidden" name="job_id" value="${escapeHtml(filters.jobId)}" />` : "",
          filters.dlrStatuses?.length
            ? `<input type="hidden" name="status" value="${escapeHtml(filters.dlrStatuses.join(","))}" />`
            : "",
          filters.country && filters.country !== "all"
            ? `<input type="hidden" name="country" value="${escapeHtml(filters.country)}" />`
            : "",
          filters.mcc ? `<input type="hidden" name="mcc" value="${escapeHtml(filters.mcc)}" />` : "",
          filters.mnc ? `<input type="hidden" name="mnc" value="${escapeHtml(filters.mnc)}" />` : "",
        ].join("")}
        <label class="tv-client-data-table__footer-limit-label">
          <span class="tv-client-data-table__footer-limit-text">Ver</span>
          <select name="page_size" class="tv-filter-input tv-client-data-table__limit-select" data-tv-table-limit-select data-storage-key="telvoice_table_limit_app_dlr_report" aria-label="Cantidad de filas por página">
            ${([20, 50, 100] as const)
              .map((n) => {
                const on = n === (filters.pageSize ?? 20);
                return `<option value="${n}"${on ? " selected" : ""}>Últimos ${n}</option>`;
              })
              .join("")}
          </select>
        </label>
      </form>
    </div>
  </footer>`;
}

function deliveryRatePercent(summary: DlrReportResult["summary"]): string {
  if (summary.total === 0) {
    return "—";
  }
  return `${Math.round((summary.delivered / summary.total) * 100)}%`;
}

function renderReportKpis(summary: DlrReportResult["summary"]): string {
  return `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
      ${renderKpiCard({
        label: "Registros",
        value: fmtSms(summary.total),
        hint: "Con filtros aplicados",
        icon: "summarize",
        variant: "primary",
      })}
      ${renderKpiCard({
        label: "Entregados",
        value: fmtSms(summary.delivered),
        hint: "DLR confirmado",
        icon: "check_circle",
        variant: "success",
      })}
      ${renderKpiCard({
        label: "Tasa de entrega",
        value: deliveryRatePercent(summary),
        hint: "Entregados vs registros",
        icon: "percent",
        variant: "success",
      })}
      ${renderKpiCard({
        label: "Enviados (sin DLR)",
        value: fmtSms(summary.sent),
        hint: "Aún en tránsito o pendiente",
        icon: "schedule",
        variant: "warn",
      })}
      ${renderKpiCard({
        label: "Fallidos",
        value: fmtSms(summary.failed),
        hint: "Rechazados o error",
        icon: "error",
        variant: "danger",
      })}
      ${renderKpiCard({
        label: "Pendientes",
        value: fmtSms(summary.pending),
        hint: "En cola o sin confirmar",
        icon: "hourglass_empty",
        variant: "default",
      })}
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
    `<option value="">Todos</option>`,
    ...result.filterOptions.mccs.map(
      (m) =>
        `<option value="${escapeHtml(m)}"${filters.mcc === m ? " selected" : ""}>${escapeHtml(m)}</option>`,
    ),
  ].join("");

  const mncOpts = [
    `<option value="">Todos</option>`,
    ...result.filterOptions.mncs.map(
      (m) =>
        `<option value="${escapeHtml(m)}"${filters.mnc === m ? " selected" : ""}>${escapeHtml(m)}</option>`,
    ),
  ].join("");

  const filtersPanel = `
    <section class="tv-panel tv-dlr-report__filters-panel">
      <header class="tv-section-head tv-dlr-report__filters-head">
        <h2 class="tv-section-head__title">Filtros de búsqueda</h2>
        <p class="tv-section-head__sub">Ajusta el período y criterios del reporte DLR</p>
      </header>
      <div class="tv-panel__body tv-dlr-report__filters-body">
        <form method="get" action="/app/reports" class="tv-dlr-report__filters-form">
          <div class="tv-dlr-report__filters-grid">
            ${renderFilterField("Start Date", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(filters.startDate ?? "")}" />`)}
            ${renderFilterField("End Date", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(filters.endDate ?? "")}" />`)}
            ${renderFilterField("Sender ID", `<input type="text" name="sender_id" class="tv-filter-input" placeholder="Sender ID (opcional)" value="${escapeHtml(filters.senderId ?? "")}" />`)}
            ${renderFilterField("Phone Number", `<input type="text" name="phone" class="tv-filter-input" placeholder="Número de teléfono" value="${escapeHtml(filters.phoneNumber ?? "")}" />`)}
            ${renderFilterField("Job ID", `<input type="text" name="job_id" class="tv-filter-input" placeholder="Job ID (opcional)" value="${escapeHtml(filters.jobId ?? "")}" />`)}
            ${renderFilterField("DLR Status", renderStatusSelect(selectedStatus))}
            ${renderFilterField("Country", `<select name="country" class="tv-filter-input">${countryOpts}</select>`)}
            ${renderFilterField("MCC", `<select name="mcc" class="tv-filter-input">${mccOpts}</select>`)}
            ${renderFilterField("MNC", `<select name="mnc" class="tv-filter-input">${mncOpts}</select>`)}
            <div class="tv-dlr-report__filter-actions">
              <button type="submit" class="btn btn-primary btn-sm">Ver reporte DLR</button>
              <a class="btn btn-secondary btn-sm" href="/app/reports/export.csv${exportQs}">Descargar CSV</a>
              <a class="btn btn-ghost btn-sm" href="/app/reports">Limpiar</a>
            </div>
          </div>
        </form>
      </div>
    </section>`;

  const body = `
    <div class="tv-dlr-report tv-client-dashboard">
    ${renderPageHeader({
      title: "Reportes",
      subtitle: `Resumen de ${escapeHtml(ctx.company.name)}`,
    })}
    ${renderReportKpis(result.summary)}
    ${filtersPanel}
    <div class="tv-dash-block tv-dlr-report__table-block">
      <div class="tv-dash-block__head">
        <h2 class="tv-dash-block__title">DLR Report</h2>
      </div>
      ${renderClientDataTablePanel(
        `<table class="tv-table tv-table--dash tv-dlr-report__table tv-table--col-resize" data-table-id="app-dlr-report">
              <colgroup>
                <col><col><col><col><col><col><col><col><col><col><col><col><col><col><col>
              </colgroup>
              <thead><tr>
                <th>SMS ID</th><th>Sender ID</th><th>DLR Status</th><th>Sent Date</th><th>Message</th><th>Number</th>
                <th>MCC</th><th>MNC</th><th>País</th><th>Type</th><th>SMS Type</th><th>Parts</th><th>DLR Date</th>
                <th class="tv-dlr-report__th-nowrap">Error Code</th><th class="tv-dlr-report__th-nowrap">Error / Motivo</th>
              </tr></thead>
              <tbody>${renderDlrTableRows(result)}</tbody>
            </table>`,
        renderDlrTableFooter(result, filters),
      )}
    </div>
    </div>`;

  return wrapAppPage(ctx, "reports", "Reportes", body);
}
