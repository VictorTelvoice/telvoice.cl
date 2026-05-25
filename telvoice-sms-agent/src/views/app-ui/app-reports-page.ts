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

const DLR_TABLE_COL_COUNT = 13;

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
        <td class="tv-dlr-report__msg">${escapeHtml(r.smsMessage.length > 48 ? `${r.smsMessage.slice(0, 48)}…` : r.smsMessage)}</td>
        <td><code>${escapeHtml(r.phoneNumber)}</code></td>
        <td>${escapeHtml(r.mcc)}</td>
        <td>${escapeHtml(r.mnc)}</td>
        <td>${escapeHtml(r.countryRealName)}</td>
        <td>${escapeHtml(r.messageType)}</td>
        <td>${escapeHtml(r.smsType)}</td>
        <td class="tv-dlr-report__num">${r.messageParts}</td>
        <td>${escapeHtml(r.clientCost)}</td>
        <td class="tv-dlr-report__date">${escapeHtml(formatDisplayDate(r.dlrDateUtc || r.sentDateUtc || r.submitDateUtc))}</td>
      </tr>`;
    })
    .join("");
}

const DLR_REPORT_RESIZE_SCRIPT = `<script>
(function () {
  var table = document.querySelector(".tv-dlr-report__table--resizable");
  if (!table) return;
  var storageKey = "telvoice:dlr-report-col-widths";
  var saved = {};
  try {
    var raw = localStorage.getItem(storageKey);
    if (raw) saved = JSON.parse(raw);
  } catch (e) {}
  var ths = table.querySelectorAll("thead th");
  ths.forEach(function (th, idx) {
    var key = th.getAttribute("data-col-key") || String(idx);
    if (saved[key]) th.style.width = saved[key];
    var grip = document.createElement("span");
    grip.className = "tv-col-resize-handle";
    grip.setAttribute("aria-hidden", "true");
    grip.title = "Arrastrar para cambiar ancho";
    th.appendChild(grip);
    var startX = 0;
    var startW = 0;
    function onMove(ev) {
      var w = Math.max(56, startW + ev.pageX - startX);
      th.style.width = w + "px";
      th.style.minWidth = w + "px";
      th.style.maxWidth = w + "px";
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("tv-col-resizing");
      saved[key] = th.style.width;
      try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch (e) {}
    }
    grip.addEventListener("mousedown", function (ev) {
      ev.preventDefault();
      startX = ev.pageX;
      startW = th.offsetWidth;
      document.body.classList.add("tv-col-resizing");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
})();
</script>`;

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
            <div class="tv-filter-field tv-dlr-report__status-field">
              <span class="tv-filter-field__label">DLR Status</span>
              ${renderStatusFilters(selectedStatus)}
            </div>
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
      <section class="tv-panel tv-client-dash-table-panel tv-dlr-report__table-panel">
        <div class="tv-client-dash-table-inner tv-dlr-report__table-inner">
          <div class="table-wrap tv-dlr-report__table-wrap">
            <table class="tv-table tv-table--dash tv-dlr-report__table tv-dlr-report__table--resizable">
              <thead><tr>
                <th data-col-key="smsId">SMS ID</th>
                <th data-col-key="senderId">Sender ID</th>
                <th data-col-key="dlrStatus">DLR Status</th>
                <th data-col-key="message">Message</th>
                <th data-col-key="number">Number</th>
                <th data-col-key="mcc">MCC</th>
                <th data-col-key="mnc">MNC</th>
                <th data-col-key="country">País</th>
                <th data-col-key="type">Type</th>
                <th data-col-key="smsType">SMS Type</th>
                <th data-col-key="parts">Parts</th>
                <th data-col-key="cost">Cost</th>
                <th data-col-key="dlrDate">DLR Date</th>
              </tr></thead>
              <tbody>${renderDlrTableRows(result)}</tbody>
            </table>
          </div>
          ${renderPagination(result, filters)}
        </div>
      </section>
    </div>
    </div>
    ${DLR_REPORT_RESIZE_SCRIPT}`;

  return wrapAppPage(ctx, "reports", "Reportes", body);
}
