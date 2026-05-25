import type { ClientDashboardData } from "../../services/clientDashboardService.js";
import type { WalletTransactionRow } from "../../types/wallet.js";
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

function renderDashPanelHead(
  title: string,
  link?: { href: string; label: string },
): string {
  return `<header class="tv-dash-panel-head">
    <h2 class="tv-dash-panel-head__title">${escapeHtml(title)}</h2>
    ${
      link
        ? `<a href="${escapeHtml(link.href)}" class="tv-dash-panel-head__link">${escapeHtml(link.label)}</a>`
        : ""
    }
  </header>`;
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
    </div>
    <div class="tv-client-dash-actions">
      ${renderBtn("Comprar SMS", { href: "/app/buy-sms", variant: "primary", icon: "shopping_cart" })}
      ${renderBtn("Enviar SMS", { href: "/app/send-sms", variant: "secondary", icon: "send" })}
      ${renderBtn("Ver reportes", { href: "/app/reports", variant: "ghost", icon: "monitoring" })}
      ${renderBtn("Soporte", { href: "/app/support", variant: "ghost", icon: "support_agent" })}
      ${renderBtn("Solicitar API", { href: "/app/api", variant: "ghost", icon: "api" })}
    </div>
    <div class="tv-dash-grid tv-dash-grid--2 tv-client-dash-tables">
      <section class="tv-panel">
        ${renderDashPanelHead("Últimas órdenes", {
          href: "/app/orders",
          label: "Ver todas",
        })}
        <div class="table-wrap tv-panel__body tv-panel__body--flush">
          <table class="tv-table tv-table--compact">
            <thead><tr>
              <th>Fecha</th><th>Bolsa</th><th>SMS</th><th>Pago</th><th>Acreditación</th>
            </tr></thead>
            <tbody>${orderRows}</tbody>
          </table>
        </div>
      </section>
      <section class="tv-panel">
        ${renderDashPanelHead("Últimos movimientos", {
          href: "/app/wallet",
          label: "Ver saldo",
        })}
        <div class="table-wrap tv-panel__body tv-panel__body--flush">
          <table class="tv-table tv-table--compact">
            <thead><tr>
              <th>Fecha</th><th>Tipo</th><th>SMS</th><th>Descripción</th>
            </tr></thead>
            <tbody>${txRows}</tbody>
          </table>
        </div>
      </section>
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
