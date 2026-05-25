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

function renderDashQuickActionsHead(): string {
  return `<header class="tv-dash-quick-actions__head">
    <h2 class="tv-dash-quick-actions__title">Acciones rápidas</h2>
    <p class="tv-dash-quick-actions__sub">Accede rápidamente a las funciones más utilizadas de tu cuenta.</p>
  </header>`;
}

function renderDashQuickCard(options: {
  href: string;
  label: string;
  description: string;
  icon: string;
  variant?: "featured" | "default";
}): string {
  const variant = options.variant ?? "default";
  return `<a href="${escapeHtml(options.href)}" class="tv-dash-quick-card tv-dash-quick-card--${variant}">
    <span class="tv-dash-quick-card__icon" aria-hidden="true">
      <span class="material-symbols-outlined">${escapeHtml(options.icon)}</span>
    </span>
    <span class="tv-dash-quick-card__body">
      <span class="tv-dash-quick-card__label">${escapeHtml(options.label)}</span>
      <span class="tv-dash-quick-card__desc">${escapeHtml(options.description)}</span>
    </span>
    <span class="tv-dash-quick-card__arrow material-symbols-outlined" aria-hidden="true">chevron_right</span>
  </a>`;
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
    <section class="tv-dash-quick-actions">
      ${renderDashQuickActionsHead()}
      <div class="tv-panel tv-dash-quick-actions__panel">
        <div class="tv-dash-quick-actions__grid">
          ${renderDashQuickCard({
            href: "/app/buy-sms",
            label: "Comprar SMS",
            description: "Recarga saldo o adquiere nuevas bolsas",
            icon: "shopping_cart",
            variant: "featured",
          })}
          ${renderDashQuickCard({
            href: "/app/send-sms",
            label: "Enviar SMS",
            description: "Envía mensajes individuales o campañas",
            icon: "send",
            variant: "featured",
          })}
          ${renderDashQuickCard({
            href: "/app/reports",
            label: "Reportes",
            description: "Revisa métricas y rendimiento",
            icon: "monitoring",
          })}
          ${renderDashQuickCard({
            href: "/app/wallet",
            label: "Mi saldo",
            description: "Consulta movimientos y balance",
            icon: "account_balance_wallet",
          })}
          ${renderDashQuickCard({
            href: "/app/support",
            label: "Soporte",
            description: "Solicita ayuda y seguimiento",
            icon: "support_agent",
          })}
          ${renderDashQuickCard({
            href: "/app/api",
            label: "API",
            description: "Gestiona integración REST",
            icon: "api",
          })}
        </div>
      </div>
    </section>
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
