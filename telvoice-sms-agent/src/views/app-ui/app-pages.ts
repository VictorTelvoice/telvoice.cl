import type { ClientDashboardData } from "../../services/clientDashboardService.js";
import type { WalletTransactionRow } from "../../types/wallet.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  renderClientCreditBadge,
  renderClientPaymentBadge,
  renderOrderQaBadgeIfNeeded,
  renderTxQaBadgeIfNeeded,
  renderWalletTxTypeBadge,
} from "./app-order-ui.js";

export function renderAppDashboardPage(
  ctx: AppPageContext,
  data: ClientDashboardData,
): string {
  const deliveryRate = "—";
  const campaignsMonth = "0";

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
    : `<tr><td colspan="5">Sin órdenes recientes.</td></tr>`;

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
    : `<tr><td colspan="4">Sin movimientos recientes.</td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Dashboard",
      subtitle: `Resumen de ${escapeHtml(ctx.company.name)}`,
      actions: renderBtn("Comprar SMS", { href: "/app/buy-sms", variant: "primary", icon: "shopping_cart" }),
    })}
    <div class="tv-kpi-grid">
      <article class="tv-kpi"><span class="tv-kpi__label">SMS disponibles</span><span class="tv-kpi__value">${fmtSms(data.balance.availableSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">SMS consumidos</span><span class="tv-kpi__value">${fmtSms(data.balance.consumedSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">SMS comprados</span><span class="tv-kpi__value">${fmtSms(data.balance.totalPurchasedSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">SMS reservados</span><span class="tv-kpi__value">${fmtSms(data.balance.reservedSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Órdenes pendientes</span><span class="tv-kpi__value">${data.pendingOrdersCount}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Campañas del mes</span><span class="tv-kpi__value">${campaignsMonth}</span><span class="field-hint">Próximamente</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Tasa de entrega</span><span class="tv-kpi__value">${deliveryRate}</span><span class="field-hint">Próximamente</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Última compra</span><span class="tv-kpi__value" style="font-size:0.95rem">${data.lastPurchaseAt ? escapeHtml(formatDate(data.lastPurchaseAt)) : "—"}</span></article>
    </div>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Acciones rápidas</h2>
      <div class="tv-panel__body tv-quick-actions">
        ${renderBtn("Comprar SMS", { href: "/app/buy-sms", variant: "primary" })}
        ${renderBtn("Enviar SMS", { href: "/app/send-sms", variant: "secondary" })}
        ${renderBtn("Ver reportes", { href: "/app/reports", variant: "ghost" })}
        ${renderBtn("Soporte", { href: "/app/support", variant: "ghost" })}
        ${renderBtn("Solicitar API", { href: "/app/api", variant: "ghost" })}
      </div>
    </section>
    <div class="tv-dash-grid tv-dash-grid--2" style="margin-top:1rem">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Últimas órdenes <a href="/app/orders" class="row-link" style="font-size:0.85rem;font-weight:500">Ver todas</a></h2>
        <div class="table-wrap tv-panel__body" style="padding:0">
          <table class="tv-table tv-table--compact"><thead><tr>
            <th>Fecha</th><th>Bolsa</th><th>SMS</th><th>Pago</th><th>Acreditación</th>
          </tr></thead><tbody>${orderRows}</tbody></table>
        </div>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Últimos movimientos <a href="/app/wallet" class="row-link" style="font-size:0.85rem;font-weight:500">Ver saldo</a></h2>
        <div class="table-wrap tv-panel__body" style="padding:0">
          <table class="tv-table tv-table--compact"><thead><tr>
            <th>Fecha</th><th>Tipo</th><th>SMS</th><th>Descripción</th>
          </tr></thead><tbody>${txRows}</tbody></table>
        </div>
      </section>
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

export function renderAppSendSmsPage(ctx: AppPageContext): string {
  const avail = ctx.balance.availableSms;
  const body = `
    ${renderPageHeader({
      title: "Enviar SMS",
      subtitle: "Preparado para envíos individuales y campañas (activación próxima).",
    })}
    <div class="tv-tabs" role="tablist" data-tv-tab-group="send">
      <button type="button" class="tv-tab tv-tab--active" data-tv-tab="single" data-tv-tab-group="send">SMS individual</button>
      <button type="button" class="tv-tab" data-tv-tab="bulk" data-tv-tab-group="send">Campaña masiva</button>
      <button type="button" class="tv-tab" data-tv-tab="template" data-tv-tab-group="send">Desde plantilla</button>
      <button type="button" class="tv-tab" data-tv-tab="scheduled" data-tv-tab-group="send">Programado</button>
    </div>
    <div class="tv-dash-grid tv-dash-grid--2" style="margin-top:1rem">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Mensaje</h2>
        <div class="tv-panel__body tv-form-grid">
          <label>Remitente <input class="tv-input-full" value="TELVOICE" disabled /></label>
          <label>Destinatario <input class="tv-input-full" placeholder="+56912345678" disabled /></label>
          <label>Lista <select class="tv-input-full" disabled><option>— Próximamente —</option></select></label>
          <label>Mensaje <textarea class="tv-input-full" rows="4" disabled placeholder="Escribe tu mensaje…"></textarea></label>
          <label>Variables <input class="tv-input-full" placeholder="{{nombre}}" disabled /></label>
          <p class="field-hint">Costo estimado: — · Saldo después del envío: ${fmtSms(avail)} SMS (sin descuento en esta etapa)</p>
          <button type="button" class="btn btn-primary" disabled>Enviar SMS</button>
        </div>
        <div class="tv-send-disabled-note">
          El envío real se activará cuando Telvoice habilite tu cuenta para campañas.
        </div>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Vista previa móvil</h2>
        <div class="tv-panel__body">
          <div class="tv-mobile-preview">TELVOICE<br/><br/>Hola, tu mensaje aparecerá aquí.</div>
        </div>
      </section>
    </div>`;
  return wrapAppPage(ctx, "send-sms", "Enviar SMS", body);
}
