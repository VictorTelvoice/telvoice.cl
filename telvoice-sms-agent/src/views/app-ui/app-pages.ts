import { canOperateClientPanel } from "../../types/roles.js";
import type { ClientDashboardData } from "../../services/clientDashboardService.js";
import type { SmsOrderWithDetails } from "../../types/wallet.js";
import type { SmsPackageRow } from "../../types/wallet.js";
import type { WalletTransactionRow } from "../../types/wallet.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import { statusBadgeSa } from "../admin-ui/superadmin-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import {
  fmtMoney,
  fmtSms,
  wrapAppPage,
} from "./app-page-wrap.js";

function orderPaymentBadge(status: string): string {
  const map: Record<string, string> = {
    pending: "pendiente",
    paid: "pagada",
    rejected: "rechazada",
    cancelled: "cancelada",
    refunded: "reembolsada",
  };
  return statusBadgeSa(map[status] ?? status);
}

function orderCreditBadge(status: string): string {
  if (status === "credited") {
    return statusBadgeSa("acreditada");
  }
  if (status === "failed") {
    return statusBadgeSa("rechazada");
  }
  return statusBadgeSa("pendiente");
}

function txTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    purchase_credit: "Compra acreditada",
    manual_credit: "Ajuste crédito",
    manual_debit: "Ajuste débito",
    sms_debit: "Consumo SMS",
    sms_refund: "Devolución",
    reserve: "Reserva",
    release_reserved: "Liberación reserva",
    adjustment: "Ajuste",
    reversal: "Reversión",
  };
  return labels[type] ?? type;
}

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
        <td>${escapeHtml(o.package_name ?? "—")}</td>
        <td>${fmtSms(o.sms_quantity)}</td>
        <td>${orderPaymentBadge(o.payment_status)}</td>
        <td>${orderCreditBadge(o.credit_status)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="5">Sin órdenes recientes.</td></tr>`;

  const txRows = data.recentTransactions.length
    ? data.recentTransactions
        .map(
          (t) => `<tr>
        <td>${formatDate(t.created_at)}</td>
        <td>${escapeHtml(txTypeLabel(t.type))}</td>
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

export function renderAppBuySmsPage(
  ctx: AppPageContext,
  packages: SmsPackageRow[],
  orderCreated?: boolean,
): string {
  const canBuy = canOperateClientPanel(ctx.profile.role);

  const successBlock = orderCreated
    ? `<div class="tv-order-success" role="status">
        <h2 style="margin:0 0 0.5rem;font-size:1.1rem">Orden creada correctamente</h2>
        <p style="margin:0">En esta etapa, el pago será validado por el equipo Telvoice. Cuando el pago sea confirmado, tu saldo se acreditará automáticamente.</p>
        <div class="tv-quick-actions" style="margin-top:1rem">
          ${renderBtn("Ver órdenes", { href: "/app/orders", variant: "primary" })}
          ${renderBtn("Volver al dashboard", { href: "/app/dashboard", variant: "secondary" })}
        </div>
      </div>`
    : "";

  const cards = packages.length
    ? packages
        .map((p) => {
          const buyBtn = canBuy
            ? `<form method="post" action="/app/buy-sms">
                <input type="hidden" name="package_id" value="${escapeHtml(p.id)}" />
                <button type="submit" class="btn btn-primary btn-sm" style="width:100%">Comprar</button>
              </form>`
            : `<button type="button" class="btn btn-secondary btn-sm" disabled style="width:100%" title="Tu rol es solo lectura">Solo lectura</button>`;
          return `<article class="tv-package-card">
            <h3 style="margin:0;font-size:1rem">${escapeHtml(p.name)}</h3>
            <div class="tv-package-card__qty">${fmtSms(p.sms_quantity)} SMS</div>
            <div class="tv-package-card__price">${fmtMoney(Number(p.total_price), p.currency)}</div>
            <div class="tv-package-card__unit">${p.unit_price != null ? `${fmtMoney(Number(p.unit_price), p.currency)} / SMS` : ""}</div>
            ${buyBtn}
          </article>`;
        })
        .join("")
    : `<p class="tv-page-sub">No hay bolsas disponibles para compra en este momento. Contacta a soporte.</p>`;

  const body = `
    ${renderPageHeader({
      title: "Comprar SMS",
      subtitle: "Bolsas prepago para Chile. El pago se confirma con el equipo Telvoice.",
    })}
    ${successBlock}
    <div class="tv-package-grid">${cards}</div>
    <p class="field-hint" style="margin-top:1.25rem">Los precios incluyen IVA según tu contrato. Pasarela de pago en línea próximamente.</p>`;
  return wrapAppPage(ctx, "buy-sms", "Comprar SMS", body);
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
        <td>${escapeHtml(txTypeLabel(t.type))}</td>
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

export function renderAppOrdersPage(
  ctx: AppPageContext,
  orders: SmsOrderWithDetails[],
): string {
  const rows = orders.length
    ? orders
        .map((o) => {
          const actions = `<a href="/app/support" class="btn btn-ghost btn-sm">Soporte</a>
            <span class="field-hint" style="margin-left:0.25rem">Reintentar pago — próximamente</span>`;
          return `<tr>
        <td>${formatDate(o.created_at)}</td>
        <td>${escapeHtml(o.package_name ?? "—")}</td>
        <td>${fmtSms(o.sms_quantity)}</td>
        <td>${fmtMoney(Number(o.amount), o.currency)}</td>
        <td>${orderPaymentBadge(o.payment_status)}</td>
        <td>${orderCreditBadge(o.credit_status)}</td>
        <td>${escapeHtml(o.payment_reference ?? "—")}</td>
        <td>${actions}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="8">No tienes órdenes aún. <a href="/app/buy-sms">Comprar SMS</a></td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Mis órdenes",
      subtitle: "Historial de compras de bolsas SMS.",
      actions: renderBtn("Comprar SMS", { href: "/app/buy-sms", variant: "primary" }),
    })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Fecha</th><th>Bolsa</th><th>SMS</th><th>Monto</th><th>Estado pago</th><th>Acreditación</th><th>Referencia</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrapAppPage(ctx, "orders", "Mis órdenes", body);
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
