import type {
  ClientDashboardCharts,
  ClientDashboardData,
  ClientDashboardDayVolume,
  ClientDashboardDlrBreakdown,
} from "../../services/clientDashboardService.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { APP_SCHEDULE_TIMEZONE } from "../../utils/scheduleTime.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import { renderKpiCard } from "../admin-ui/components.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  renderClientCreditBadge,
  renderClientPaymentBadge,
  renderOrderQaBadgeIfNeeded,
  renderTxQaBadgeIfNeeded,
  renderWalletTxTypeBadge,
} from "./app-order-ui.js";

function dashboardMonthLabel(): string {
  const label = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: APP_SCHEDULE_TIMEZONE,
  }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dashboardTodayLabel(): string {
  const label = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: APP_SCHEDULE_TIMEZONE,
  }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderDashBlockHead(
  title: string,
  link?: { href: string; label: string },
): string {
  return `<div class="tv-dash-block__head">
    <h2 class="tv-dash-block__title">${escapeHtml(title)}</h2>
    ${
      link
        ? `<a href="${escapeHtml(link.href)}" class="tv-dash-block__link">${escapeHtml(link.label)}</a>`
        : ""
    }
  </div>`;
}

function renderDlrPieChart(
  breakdown: ClientDashboardDlrBreakdown,
  todayLabel: string,
): string {
  const slices = [
    {
      label: "Entregados",
      value: breakdown.delivered,
      color: "#22c55e",
    },
    {
      label: "Enviados",
      value: breakdown.sent,
      color: "#0052cc",
    },
    {
      label: "Fallidos",
      value: breakdown.failed,
      color: "#ef4444",
    },
  ];
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return `<div class="tv-dash-chart-empty">Sin SMS enviados hoy (${escapeHtml(todayLabel)}).</div>`;
  }

  let acc = 0;
  const gradientStops = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const pct = (s.value / total) * 100;
      const start = acc;
      acc += pct;
      return `${s.color} ${start}% ${acc}%`;
    })
    .join(", ");

  const legend = slices
    .map((s) => {
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
      return `<li class="tv-dash-pie__legend-item">
        <span class="tv-dash-pie__swatch" style="background:${s.color}"></span>
        <span class="tv-dash-pie__legend-label">${escapeHtml(s.label)}</span>
        <span class="tv-dash-pie__legend-val">${fmtSms(s.value)} <span class="tv-dash-pie__legend-pct">(${pct}%)</span></span>
      </li>`;
    })
    .join("");

  const ariaLabel = slices
    .map((s) => `${s.label}: ${s.value}`)
    .join(", ");

  return `<div class="tv-dash-pie">
    <div class="tv-dash-pie__chart-wrap">
      <div class="tv-dash-pie__chart" style="background:conic-gradient(${gradientStops})" role="img" aria-label="${escapeHtml(ariaLabel)}">
        <div class="tv-dash-pie__center">
          <span class="tv-dash-pie__center-val">${fmtSms(total)}</span>
          <span class="tv-dash-pie__center-label">Hoy</span>
        </div>
      </div>
    </div>
    <ul class="tv-dash-pie__legend">${legend}</ul>
  </div>`;
}

/** Barras con altura mínima para que valores bajos sigan siendo visibles. */
function renderDashboardBarChart(days: ClientDashboardDayVolume[]): string {
  const values = days.map((d) => d.count);
  const max = Math.max(...values, 1);
  const minBarPct = 18;

  const bars = days
    .map((day, i) => {
      const v = values[i] ?? 0;
      let pct = Math.round((v / max) * 100);
      if (v > 0 && pct < minBarPct) {
        pct = minBarPct;
      }
      const colClass =
        v > 0 ? "tv-chart__col tv-chart__col--has-value" : "tv-chart__col";
      return `<div class="${colClass}">
        <div class="tv-chart__bar-wrap">
          <div class="tv-chart__bar" style="height:${pct}%"></div>
        </div>
        <span class="tv-chart__label">${escapeHtml(day.label)}</span>
        <span class="tv-chart__val">${escapeHtml(String(v))}</span>
      </div>`;
    })
    .join("");

  const peak = Math.max(...values);
  return `<div class="tv-chart tv-chart--dashboard" role="img" aria-label="Envíos por día últimos 7 días">
    ${bars}
    <p class="tv-chart--dashboard__scale field-hint">Escala relativa al día pico (${fmtSms(peak)} SMS)</p>
  </div>`;
}

function renderDashboardCharts(
  charts: ClientDashboardCharts,
  todayLabel: string,
): string {
  const barTotal = charts.last7Days.reduce((sum, d) => sum + d.count, 0);
  const pieTotal =
    charts.dlrBreakdown.sent +
    charts.dlrBreakdown.delivered +
    charts.dlrBreakdown.failed;

  return `<section class="tv-dash-charts">
    <div class="tv-dash-charts__grid">
      <div class="tv-dash-charts__card tv-panel">
        <header class="tv-dash-charts__head">
          <h2 class="tv-dash-charts__title">Estado de envíos de hoy</h2>
          <p class="tv-dash-charts__sub">SMS enviados hoy · ${escapeHtml(todayLabel)}${pieTotal > 0 ? ` · ${fmtSms(pieTotal)} en total` : ""}</p>
        </header>
        <div class="tv-dash-charts__body">
          ${renderDlrPieChart(charts.dlrBreakdown, todayLabel)}
        </div>
      </div>
      <div class="tv-dash-charts__card tv-panel">
        <header class="tv-dash-charts__head">
          <h2 class="tv-dash-charts__title">Envíos últimos 7 días</h2>
          <p class="tv-dash-charts__sub">${barTotal > 0 ? `${fmtSms(barTotal)} SMS en el período` : "Sin envíos en los últimos 7 días"}</p>
        </header>
        <div class="tv-dash-charts__body tv-dash-charts__body--bars">
          ${renderDashboardBarChart(charts.last7Days)}
        </div>
      </div>
    </div>
  </section>`;
}

export function renderAppDashboardPage(
  ctx: AppPageContext,
  data: ClientDashboardData,
): string {
  const monthLabel = dashboardMonthLabel();
  const stats = data.stats;

  const orderRows = data.recentOrders.length
    ? data.recentOrders
        .map(
          (o) => `<tr>
        <td>${formatDate(o.created_at)}</td>
        <td>${escapeHtml(o.package_name ?? "—")}${renderOrderQaBadgeIfNeeded(o)}</td>
        <td>${fmtSms(o.sms_quantity)}</td>
        <td>${renderClientPaymentBadge(o.payment_status)}</td>
        <td>${renderClientCreditBadge(o.credit_status)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="tv-table-empty">Sin órdenes recientes.</td></tr>`;

  const txRows = data.recentTransactions.length
    ? data.recentTransactions
        .map(
          (t) => `<tr>
        <td>${formatDate(t.created_at)}</td>
        <td>${renderWalletTxTypeBadge(t.type)}${renderTxQaBadgeIfNeeded(t)}</td>
        <td>${fmtSms(t.sms_amount)}</td>
        <td>${escapeHtml(t.description ?? "—")}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="tv-table-empty">Sin movimientos recientes.</td></tr>`;

  const body = `
    <div class="tv-client-dashboard">
    ${renderPageHeader({
      title: "Dashboard",
      subtitle: `Resumen de ${escapeHtml(ctx.company.name)}`,
      actions: renderBtn("Comprar SMS", {
        href: "/app/buy-sms",
        variant: "primary",
        icon: "shopping_cart",
      }),
    })}
    <div class="tv-kpi-grid tv-kpi-grid--client">
      ${renderKpiCard({
        label: "SMS enviados",
        value: fmtSms(stats.smsSentMonth),
        hint: `Este mes · ${monthLabel}`,
        icon: "send",
        variant: "primary",
      })}
      ${renderKpiCard({
        label: "Costo",
        value: fmtSms(stats.smsCostMonth),
        hint: "SMS consumidos este mes",
        icon: "payments",
        variant: "warn",
      })}
      ${renderKpiCard({
        label: "Balance",
        value: fmtSms(data.balance.availableSms),
        hint: "SMS disponibles para enviar",
        icon: "account_balance_wallet",
        variant: "success",
      })}
      ${renderKpiCard({
        label: "Campañas del mes",
        value: fmtSms(stats.campaignsMonth),
        hint: `Total en ${monthLabel}`,
        icon: "campaign",
        variant: "default",
      })}
      ${renderKpiCard({
        label: "Tasa entrega global",
        value: stats.globalDeliveryRate,
        hint: "Entregados vs enviados (DLR)",
        icon: "check_circle",
        variant: "success",
      })}
      ${renderKpiCard({
        label: "DLR del día",
        value: stats.todayDlrRate,
        hint: stats.todayDlrDetail,
        icon: "mark_email_read",
        variant: "primary",
      })}
    </div>
    ${renderDashboardCharts(data.charts, dashboardTodayLabel())}
    <div class="tv-dash-grid tv-dash-grid--2 tv-client-dash-tables">
      <div class="tv-dash-block">
        ${renderDashBlockHead("Últimas órdenes", {
          href: "/app/orders",
          label: "Ver todas",
        })}
        <section class="tv-panel tv-client-dash-table-panel">
          <div class="tv-client-dash-table-inner">
            <table class="tv-table tv-table--dash">
              <thead><tr>
                <th>Fecha</th><th>Bolsa</th><th>SMS</th><th>Pago</th><th>Acreditación</th>
              </tr></thead>
              <tbody>${orderRows}</tbody>
            </table>
          </div>
        </section>
      </div>
      <div class="tv-dash-block">
        ${renderDashBlockHead("Últimos movimientos", {
          href: "/app/wallet",
          label: "Ver saldo",
        })}
        <section class="tv-panel tv-client-dash-table-panel">
          <div class="tv-client-dash-table-inner">
            <table class="tv-table tv-table--dash">
              <thead><tr>
                <th>Fecha</th><th>Tipo</th><th>SMS</th><th>Descripción</th>
              </tr></thead>
              <tbody>${txRows}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
    </div>`;
  return wrapAppPage(ctx, "dashboard", "Dashboard", body);
}

export { renderAppSendSmsPage } from "./app-sms-pages.js";
