import type { AdminSessionUser } from "../../../types/admin.js";
import { escapeHtml } from "../../../utils/html.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { MOCK_REPORT_ROWS } from "../mock-data-stage3.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderFilterBar,
  renderFilterField,
  renderInsightList,
  renderMiniChart,
  renderPageHeader,
  renderPanel,
  renderPerformanceBadge,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

export function renderReportsPage(options: {
  admin: AdminSessionUser;
  smsBalance?: string;
}): string {
  const filters = renderFilterBar(`
    ${renderFilterField("Desde", '<input type="date" class="tv-filter-input" />')}
    ${renderFilterField("Hasta", '<input type="date" class="tv-filter-input" />')}
    ${renderFilterField("Campaña", '<select class="tv-filter-input" disabled><option>Todas</option></select>')}
    ${renderFilterField("Operador", '<select class="tv-filter-input" disabled><option>Todos</option></select>')}
    ${renderFilterField("Estado", '<select class="tv-filter-input" disabled><option>Todos</option></select>')}
    <div class="tv-filter-actions">
      ${renderBtn("Aplicar filtros", { variant: "primary", disabled: true, title: "Próximamente" })}
      ${renderBtn("Limpiar", { variant: "ghost", disabled: true })}
    </div>
  `);

  const kpis = `<div class="tv-kpi-grid">
    ${renderKpiCard({ label: "Total enviados", value: "4.935", icon: "send", variant: "primary" })}
    ${renderKpiCard({ label: "Total entregados", value: "4.658", icon: "check_circle", variant: "success" })}
    ${renderKpiCard({ label: "Total fallidos", value: "223", icon: "error", variant: "danger" })}
    ${renderKpiCard({ label: "Tasa de entrega", value: "94,4%", icon: "percent", variant: "success" })}
    ${renderKpiCard({ label: "Costo total", value: "$345.800", icon: "payments", variant: "default" })}
    ${renderKpiCard({ label: "SMS consumidos", value: "4.935", icon: "sms", variant: "default" })}
    ${renderKpiCard({ label: "Saldo restante", value: options.smsBalance ?? "12.450", icon: "account_balance", variant: "primary" })}
    ${renderKpiCard({ label: "Promedio diario", value: "705", hint: "envíos / día", icon: "timeline", variant: "default" })}
  </div>`;

  const charts = `<div class="tv-charts-grid">
    ${renderMiniChart("Envíos por día", ["L", "M", "X", "J", "V", "S", "D"], [420, 680, 590, 705, 890, 320, 410])}
    ${renderMiniChart("Entregados vs fallidos", ["Entreg.", "Fallidos"], [4658, 223], "success")}
    ${renderMiniChart("Por operador", ["Entel", "Movi.", "Claro", "WOM"], [42, 28, 18, 12], "purple")}
    ${renderMiniChart("Por campaña", ["OTP", "Retail", "Cobr.", "Log."], [24, 35, 22, 19], "primary")}
    ${renderMiniChart("Estados DLR", ["Deliv.", "Pend.", "Fail."], [78, 12, 10], "success")}
    ${renderMiniChart("Tendencia costo", ["S1", "S2", "S3", "S4"], [80, 95, 88, 92], "warn")}
  </div>`;

  const rows = MOCK_REPORT_ROWS.map(
    (r) => `<tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.campaign)}</td>
      <td>${escapeHtml(String(r.recipients))}</td>
      <td>${escapeHtml(String(r.sent))}</td>
      <td>${escapeHtml(String(r.delivered))}</td>
      <td>${escapeHtml(String(r.failed))}</td>
      <td>${escapeHtml(String(r.pending))}</td>
      <td>${escapeHtml(r.operator)}</td>
      <td>${escapeHtml(r.cost)}</td>
      <td>${escapeHtml(String(r.rate))}%</td>
      <td>${renderPerformanceBadge(r.perf)}</td>
      <td><span class="row-link">Ver</span></td>
    </tr>`,
  ).join("");

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Reportes globales",
      subtitle:
        "Visión de negocio Telvoice: tráfico total, ingresos, costos, márgenes y consumo por cliente, proveedor y ruta.",
      actions: `
        ${renderBtn("Exportar CSV", { variant: "ghost", disabled: true, icon: "download" })}
        ${renderBtn("Exportar Excel", { variant: "ghost", disabled: true })}
        ${renderBtn("Descargar PDF", { variant: "ghost", disabled: true })}
        ${renderBtn("Enviar por email", { variant: "secondary", disabled: true, icon: "mail" })}
        <a href="/admin/clients/test/ledger" class="btn btn-ghost btn-sm">Vista ledger técnica →</a>
      `,
    })}
    ${filters}
    ${kpis}
    ${charts}
    ${renderPanel(
      "Detalle por campaña",
      `<div class="table-wrap" style="padding:0">
        <table class="tv-table">
          <thead><tr>
            <th>Fecha</th><th>Campaña</th><th>Destinatarios</th><th>Enviados</th><th>Entregados</th>
            <th>Fallidos</th><th>Pendientes</th><th>Operador</th><th>Costo</th><th>Tasa</th><th>Rendimiento</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="field-hint tv-mock-tag">Datos mock · conectar agregaciones reales desde Supabase y aSMSC.</p>`,
    )}
    ${renderPanel("Insights operativos", renderInsightList([
      "La campaña de recordatorio tuvo mejor tasa de entrega que las campañas promocionales.",
      "El operador WOM presentó mayor latencia en el último periodo.",
      "El costo promedio por campaña se mantiene estable.",
      "Revisa los mensajes fallidos por números inválidos antes de tu próximo envío.",
    ]))}
    ${renderAdminUiScript()}`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Reportes globales",
    activeNav: "reports",
    body,
    topbar: options.smsBalance ? { smsBalance: options.smsBalance } : undefined,
  });
}
