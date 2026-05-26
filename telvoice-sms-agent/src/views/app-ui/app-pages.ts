import type {
  ClientDashboardCharts,
  ClientDashboardData,
  ClientDashboardDlrBreakdown,
} from "../../services/clientDashboardService.js";
import type { WalletTransactionRow } from "../../types/wallet.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { APP_SCHEDULE_TIMEZONE } from "../../utils/scheduleTime.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import { renderChartBars, renderKpiCard } from "../admin-ui/components.js";
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
  monthLabel: string,
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
    return `<div class="tv-dash-chart-empty">Sin envíos registrados en ${escapeHtml(monthLabel)}.</div>`;
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
          <span class="tv-dash-pie__center-label">SMS</span>
        </div>
      </div>
    </div>
    <ul class="tv-dash-pie__legend">${legend}</ul>
  </div>`;
}

function renderDashboardCharts(
  charts: ClientDashboardCharts,
  monthLabel: string,
): string {
  const barLabels = charts.last7Days.map((d) => d.label);
  const barValues = charts.last7Days.map((d) => d.count);
  const barTotal = barValues.reduce((a, b) => a + b, 0);

  return `<section class="tv-dash-charts">
    <div class="tv-dash-charts__grid">
      <div class="tv-dash-charts__card tv-panel">
        <header class="tv-dash-charts__head">
          <h2 class="tv-dash-charts__title">Estado de envíos</h2>
          <p class="tv-dash-charts__sub">Distribución del mes · ${escapeHtml(monthLabel)}</p>
        </header>
        <div class="tv-dash-charts__body">
          ${renderDlrPieChart(charts.dlrBreakdown, monthLabel)}
        </div>
      </div>
      <div class="tv-dash-charts__card tv-panel">
        <header class="tv-dash-charts__head">
          <h2 class="tv-dash-charts__title">Envíos últimos 7 días</h2>
          <p class="tv-dash-charts__sub">${barTotal > 0 ? `${fmtSms(barTotal)} SMS en el período` : "Sin envíos en los últimos 7 días"}</p>
        </header>
        <div class="tv-dash-charts__body tv-dash-charts__body--bars">
          ${
            barTotal > 0
              ? renderChartBars(barLabels, barValues)
              : `<div class="tv-dash-chart-empty">No hay envíos en los últimos 7 días.</div>`
          }
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
    ${renderDashboardCharts(data.charts, monthLabel)}
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

export function renderAppWalletPage(
  ctx: AppPageContext,
  transactions: WalletTransactionRow[],
): string {
  const b = ctx.balance;
  const txRows = transactions.length
    ? transactions
        .map(
          (t) => `<tr>
        <td>${formatDate(t.created_at)}</td>
        <td>${renderWalletTxTypeBadge(t.type)}${renderTxQaBadgeIfNeeded(t)}</td>
        <td>${fmtSms(t.sms_amount)}</td>
        <td>${fmtSms(t.balance_before)}</td>
        <td>${fmtSms(t.balance_after)}</td>
        <td>${escapeHtml(t.description ?? "—")}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6">Sin movimientos registrados.</td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Mi saldo",
      subtitle: "Saldo SMS de tu empresa (solo lectura).",
      actions: renderBtn("Comprar SMS", { href: "/app/buy-sms", variant: "primary" }),
    })}
    <div class="tv-kpi-grid">
      <article class="tv-kpi"><span class="tv-kpi__label">Disponible</span><span class="tv-kpi__value">${fmtSms(b.availableSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Reservado</span><span class="tv-kpi__value">${fmtSms(b.reservedSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Consumido</span><span class="tv-kpi__value">${fmtSms(b.consumedSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Total comprado</span><span class="tv-kpi__value">${fmtSms(b.totalPurchasedSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Estado wallet</span><span class="tv-kpi__value" style="font-size:1rem">${escapeHtml(b.status)}</span></article>
    </div>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Movimientos de saldo</h2>
      <div class="table-wrap tv-panel__body" style="padding:0">
        <table class="tv-table"><thead><tr>
          <th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Antes</th><th>Después</th><th>Descripción</th>
        </tr></thead><tbody>${txRows}</tbody></table>
      </div>
    </section>`;
  return wrapAppPage(ctx, "wallet", "Mi saldo", body);
}

export { renderAppSendSmsPage } from "./app-sms-pages.js";
