import type { SmsOrderWithDetails } from "../../types/wallet.js";
import {
  buildOrderTimeline,
  checkoutModeLabel,
  filterOrdersForDisplay,
  mercadoPagoOrderHasPendingCheckout,
  paymentMethodLabel,
  type AppOrdersPageFilters,
} from "../../utils/order-display.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtMoney, fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  renderClientCreditBadge,
  renderClientPaymentBadge,
  renderOrdersFiltersPanel,
  renderOrderQaBadgeIfNeeded,
  renderOrderShortIdCell,
  renderOrderTimeline,
} from "./app-order-ui.js";
import {
  renderClientDataTablePanel,
  renderClientTableFooter,
  type ClientTableLimit,
} from "./client-table-kit.js";
import {
  renderSmsBagCalculatorPanel,
  type SmsBagCalculatorPanelConfig,
} from "../shared/sms-bag-calculator-ui.js";
import { renderSmsMpSubscriptionBanner } from "./app-sms-subscription-ui.js";
import type { CompanySmsMpSubscription } from "../../types/sms-mp-subscription.js";

function supportOrderHref(orderId: string): string {
  return `/app/support?order=${encodeURIComponent(orderId)}`;
}


export function renderAppBuySmsPage(
  ctx: AppPageContext,
  calcConfig: SmsBagCalculatorPanelConfig,
  checkoutOptions: {
    mercadoPagoAvailable: boolean;
    manualCheckoutEnabled: boolean;
    smsSubscription?: CompanySmsMpSubscription | null;
  },
): string {
  const subscription = checkoutOptions.smsSubscription ?? null;
  const body = `
    <div class="tv-buy-sms-page">
      ${renderSmsMpSubscriptionBanner(subscription)}
      ${renderSmsBagCalculatorPanel(ctx, calcConfig, {
        mercadoPagoAvailable: checkoutOptions.mercadoPagoAvailable,
        manualCheckoutEnabled: checkoutOptions.manualCheckoutEnabled,
        smsSubscription: subscription,
      })}
    </div>`;
  return wrapAppPage(ctx, "buy-sms", "Comprar SMS", body, {
    bodyClass: "tv-app-client--buy-sms",
  });
}

function renderOrderCreatedConfirmation(order: SmsOrderWithDetails): string {
  return `<section class="tv-order-confirm" role="status">
    <h2 class="tv-order-confirm__title">Orden creada correctamente</h2>
    <p class="tv-order-confirm__lead">Tu orden fue registrada y quedó pendiente de pago. Cuando el equipo Telvoice confirme el pago, los SMS serán acreditados automáticamente en tu saldo.</p>
    <dl class="tv-order-confirm__dl">
      <div><dt>Bolsa</dt><dd>${escapeHtml(order.package_name ?? "—")}${renderOrderQaBadgeIfNeeded(order)}</dd></div>
      <div><dt>Cantidad SMS</dt><dd>${fmtSms(order.sms_quantity)}</dd></div>
      <div><dt>Monto total</dt><dd>${fmtMoney(Number(order.amount), order.currency)}</dd></div>
      <div><dt>Referencia</dt><dd><code>${escapeHtml(order.payment_reference ?? "—")}</code></dd></div>
      <div><dt>ID interno</dt><dd>${renderOrderShortIdCell(order.id)}</dd></div>
      <div><dt>Estado pago</dt><dd>${renderClientPaymentBadge(order.payment_status)}</dd></div>
      <div><dt>Estado acreditación</dt><dd>${renderClientCreditBadge(order.credit_status)}</dd></div>
    </dl>
    <div class="tv-quick-actions">
      ${renderBtn("Ver mis órdenes", { href: "/app/orders", variant: "primary" })}
      ${renderBtn("Volver al dashboard", { href: "/app/dashboard", variant: "secondary" })}
      ${renderBtn("Contactar soporte", { href: supportOrderHref(order.id), variant: "ghost" })}
    </div>
    <section class="tv-panel tv-panel--hint" style="margin-top:1.25rem">
      <h3 class="tv-panel__title" style="font-size:1rem">Pago manual temporal</h3>
      <div class="tv-panel__body">
        <p style="margin:0">En esta etapa, la compra será validada por el equipo Telvoice. Pronto podrás pagar en línea con MercadoPago o Stripe.</p>
      </div>
    </section>
  </section>`;
}

export function renderAppOrderDetailPage(
  ctx: AppPageContext,
  order: SmsOrderWithDetails,
  options?: { showCreatedBanner?: boolean; invoiceId?: string | null },
): string {
  const timeline = buildOrderTimeline(order);
  const showBanner = options?.showCreatedBanner === true;
  const isCancelled = order.payment_status === "cancelled";
  const isCredited =
    order.credit_status === "credited" && order.payment_status === "paid";
  const continuePay =
    !isCancelled && mercadoPagoOrderHasPendingCheckout(order)
      ? renderBtn("Continuar pago en Mercado Pago", {
          href: `/app/orders/${escapeHtml(order.id)}/continue-payment`,
          variant: "primary",
        })
      : "";

  const cancelledNotice = isCancelled
    ? `<div class="alert alert-muted" role="status" style="margin-bottom:1rem">
         <strong>Orden cancelada</strong>
         <p style="margin:0.35rem 0 0">Esta orden fue cancelada. Puedes crear una nueva compra cuando lo necesites.</p>
       </div>`
    : "";

  const creditedNotice = isCredited
    ? `<div class="alert alert-success" role="status" style="margin-bottom:1rem">
         <strong>SMS acreditados</strong>
         <p style="margin:0.35rem 0 0">El pago fue confirmado y los SMS ya están en tu saldo.</p>
       </div>`
    : "";

  const invoiceId = options?.invoiceId?.trim() || null;
  const receiptBlock = invoiceId
    ? `<section class="tv-panel tv-panel--hint" style="margin-top:1rem">
      <h2 class="tv-panel__title">Comprobante de compra</h2>
      <div class="tv-panel__body">
        <p style="margin:0 0 0.75rem">Documento interno no tributario asociado a esta orden.</p>
        <div class="tv-quick-actions">
          <a class="btn btn-primary btn-sm" href="/app/invoices/${escapeHtml(invoiceId)}">Ver comprobante</a>
          <a class="btn btn-ghost btn-sm" href="/app/invoices/${escapeHtml(invoiceId)}/preview" target="_blank" rel="noopener">Vista previa</a>
        </div>
      </div>
    </section>`
    : isCredited
      ? `<section class="tv-panel tv-panel--hint" style="margin-top:1rem">
      <h2 class="tv-panel__title">Comprobante</h2>
      <div class="tv-panel__body">
        <p class="field-hint" style="margin:0">Tu comprobante se generará automáticamente en breve. Si no aparece, contacta a soporte.</p>
      </div>
    </section>`
      : `<section class="tv-panel tv-panel--hint" style="margin-top:1rem">
      <h2 class="tv-panel__title">Comprobante</h2>
      <div class="tv-panel__body">
        <p class="field-hint" style="margin:0">Disponible cuando el pago esté confirmado y acreditado.</p>
      </div>
    </section>`;

  const body = `
    ${renderPageHeader({
      title: "Detalle de orden",
      subtitle: `Referencia ${escapeHtml(order.payment_reference ?? "—")}`,
      actions: renderBtn("Mis órdenes", { href: "/app/orders", variant: "secondary" }),
    })}
    ${showBanner ? renderOrderCreatedConfirmation(order) : ""}
    ${cancelledNotice}
    ${creditedNotice}
    <div class="tv-dash-grid tv-dash-grid--2">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Resumen</h2>
        <dl class="tv-detail-dl tv-panel__body">
          <div><dt>Referencia</dt><dd><code>${escapeHtml(order.payment_reference ?? "—")}</code></dd></div>
          <div><dt>ID interno</dt><dd>${renderOrderShortIdCell(order.id)}</dd></div>
          <div><dt>Bolsa</dt><dd>${escapeHtml(order.package_name ?? "—")}${renderOrderQaBadgeIfNeeded(order)}</dd></div>
          <div><dt>Cantidad SMS</dt><dd>${fmtSms(order.sms_quantity)}</dd></div>
          <div><dt>Monto</dt><dd>${fmtMoney(Number(order.amount), order.currency)} (${escapeHtml(order.currency)})</dd></div>
          <div><dt>Fecha creación</dt><dd>${formatDate(order.created_at)}</dd></div>
          <div><dt>Estado de pago</dt><dd>${renderClientPaymentBadge(order.payment_status)}</dd></div>
          <div><dt>Estado acreditación</dt><dd>${renderClientCreditBadge(order.credit_status)}</dd></div>
          <div><dt>Fecha acreditación</dt><dd>${order.credited_at ? formatDate(order.credited_at) : "—"}</dd></div>
          <div><dt>Método de pago</dt><dd>${escapeHtml(paymentMethodLabel(order.payment_provider))}</dd></div>
          <div><dt>Modo checkout</dt><dd>${escapeHtml(checkoutModeLabel(order.metadata))}</dd></div>
        </dl>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Seguimiento</h2>
        <div class="tv-panel__body">${renderOrderTimeline(timeline)}</div>
      </section>
    </div>
    ${receiptBlock}
    <div class="tv-quick-actions" style="margin-top:1rem">
      ${continuePay}
      ${renderBtn("Contactar soporte por esta orden", { href: supportOrderHref(order.id), variant: continuePay ? "secondary" : "primary" })}
      ${renderBtn("Volver a mis órdenes", { href: "/app/orders", variant: "secondary" })}
      ${renderBtn("Comprar otra bolsa", { href: "/app/buy-sms", variant: "ghost" })}
    </div>`;

  return wrapAppPage(ctx, "orders", "Detalle de orden", body);
}

export function renderAppOrdersPage(
  ctx: AppPageContext,
  orders: SmsOrderWithDetails[],
  filters: AppOrdersPageFilters,
  limit: ClientTableLimit = 20,
): string {
  const filtered = filterOrdersForDisplay(orders, filters);
  const visible = filtered.slice(0, limit);
  const hasFilters = Boolean(filters.search || filters.status !== "all");

  const emptyMsg =
    '<tr><td colspan="7" class="tv-table-empty">No hay órdenes con estos filtros. <a href="/app/buy-sms">Comprar SMS</a></td></tr>';

  const rows = visible.length
    ? visible
        .map((o) => {
          const qa = renderOrderQaBadgeIfNeeded(o);
          const detailHref = `/app/orders/${escapeHtml(o.id)}`;
          return `<tr class="tv-order-row tv-order-row--clickable" tabindex="0" role="link" data-href="${detailHref}" aria-label="Ver orden ${escapeHtml(o.package_name ?? "Bolsa SMS")}">
        <td>${formatDate(o.created_at)}</td>
        <td>${escapeHtml(o.package_name ?? "—")}${qa}</td>
        <td>${fmtSms(o.sms_quantity)}</td>
        <td>${fmtMoney(Number(o.amount), o.currency)}</td>
        <td>${renderClientPaymentBadge(o.payment_status)}</td>
        <td>${renderClientCreditBadge(o.credit_status)}</td>
        <td><code>${escapeHtml(o.payment_reference ?? "—")}</code></td>
      </tr>`;
        })
        .join("")
    : emptyMsg;

  const orderCards = visible.length
    ? visible
        .map((o) => {
          const qa = renderOrderQaBadgeIfNeeded(o);
          const detailHref = `/app/orders/${escapeHtml(o.id)}`;
          return `<a href="${detailHref}" class="tv-order-card tv-order-card--link">
        <div class="tv-order-card__head">
          <strong>${escapeHtml(o.package_name ?? "Bolsa SMS")}</strong>
          ${renderClientPaymentBadge(o.payment_status)}
        </div>
        <p class="tv-order-card__meta">${formatDate(o.created_at)} · ${fmtSms(o.sms_quantity)} · ${fmtMoney(Number(o.amount), o.currency)}</p>
        <p class="tv-order-card__meta">Acreditación: ${renderClientCreditBadge(o.credit_status)}${qa}</p>
        <p class="tv-order-card__meta"><code>${escapeHtml(o.payment_reference ?? "—")}</code></p>
        <span class="tv-order-card__chevron material-symbols-outlined" aria-hidden="true">chevron_right</span>
      </a>`;
        })
        .join("")
    : `<p class="field-hint">No hay órdenes con estos filtros. <a href="/app/buy-sms">Comprar SMS</a></p>`;

  const body = `
    <div class="tv-orders-page">
    ${renderPageHeader({
      title: "Mis órdenes",
      subtitle: "Historial de compras de bolsas SMS.",
    })}
    ${renderOrdersFiltersPanel(filters)}
    <div class="tv-dash-block tv-orders-table-block">
      <div class="tv-dash-block__head">
        <h2 class="tv-dash-block__title">Órdenes</h2>
      </div>
      ${renderClientDataTablePanel(
        `<table class="tv-table tv-table--dash tv-table--dense tv-table--col-resize tv-orders-table" data-table-id="app-orders">
          <colgroup>
            <col><col><col><col><col><col><col>
          </colgroup>
          <thead><tr>
            <th>Fecha</th><th>Bolsa</th><th>SMS</th><th>Monto</th><th>Estado pago</th><th>Acreditación</th><th>Referencia</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`,
        renderClientTableFooter({
          tableKey: "app_orders",
          count: visible.length,
          limit,
          basePath: "/app/orders",
          noun: "órdenes",
          countHint: hasFilters ? "con filtros aplicados" : undefined,
          hiddenFields: {
            filter: filters.status !== "all" ? filters.status : undefined,
            q: filters.search,
          },
        }),
      )}
    </div>
    <div class="tv-orders-cards">${orderCards}</div>
    </div>
    <script>
    (function () {
      document.querySelectorAll(".tv-order-row--clickable").forEach(function (row) {
        var href = row.getAttribute("data-href");
        if (!href) return;
        row.addEventListener("click", function () { window.location.href = href; });
        row.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.location.href = href;
          }
        });
      });
    })();
    </script>`;
  return wrapAppPage(ctx, "orders", "Mis órdenes", body);
}

export function renderAppOrderNotFoundPage(ctx: AppPageContext): string {
  const body = `
    ${renderPageHeader({ title: "Orden no encontrada", subtitle: "No existe o no tienes permiso para verla." })}
    <div class="tv-quick-actions">
      ${renderBtn("Mis órdenes", { href: "/app/orders", variant: "primary" })}
      ${renderBtn("Dashboard", { href: "/app/dashboard", variant: "secondary" })}
    </div>`;
  return wrapAppPage(ctx, "orders", "Orden no encontrada", body);
}
