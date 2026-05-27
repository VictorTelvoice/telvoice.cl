import type {
  CreditStatus,
  PaymentStatus,
  SmsOrderRow,
  WalletTransactionRow,
} from "../types/wallet.js";
import { escapeHtml } from "./html.js";

/** Metadata estándar para órdenes creadas desde /app/buy-sms */
export const CLIENT_PANEL_ORDER_METADATA = {
  source: "client_panel",
  checkout_mode: "manual_pending",
  customer_visible: true,
} as const;

/** Compra rápida landing — claim Google post-pago */
export const PUBLIC_LANDING_ORDER_METADATA = {
  source: "landing",
  checkout_mode: "mercadopago",
  claim_required: true,
} as const;

export function isPublicCheckoutOrder(
  order: Pick<SmsOrderRow, "metadata" | "company_id">,
): boolean {
  const meta = order.metadata ?? {};
  return (
    meta.source === "landing" ||
    meta.claim_required === true ||
    (!order.company_id && meta.checkout_mode === "mercadopago")
  );
}

export type OrderListFilter =
  | "all"
  | "pending"
  | "paid"
  | "credited"
  | "rejected"
  | "cancelled";

const ORDER_FILTERS: readonly OrderListFilter[] = [
  "all",
  "pending",
  "paid",
  "credited",
  "rejected",
  "cancelled",
];

export function parseOrderListFilter(raw: string | undefined): OrderListFilter {
  if (raw && ORDER_FILTERS.includes(raw as OrderListFilter)) {
    return raw as OrderListFilter;
  }
  return "all";
}

export function isQaOrder(
  order: Pick<SmsOrderRow, "metadata" | "payment_reference">,
): boolean {
  const meta = order.metadata ?? {};
  if (meta.source === "qa") {
    return true;
  }
  const ref = String(order.payment_reference ?? "");
  return /^QA-/i.test(ref) || /QA-E2E/i.test(ref);
}

/** Órdenes visibles en el panel cliente (excluye QA, manuales pendientes y simulaciones). */
export function isClientAccountOrder(
  order: Pick<
    SmsOrderRow,
    | "metadata"
    | "payment_reference"
    | "payment_status"
    | "credit_status"
    | "payment_provider"
  >,
): boolean {
  if (isQaOrder(order)) {
    return false;
  }
  if (
    order.payment_status === "pending" ||
    order.payment_status === "cancelled" ||
    order.payment_status === "rejected"
  ) {
    return false;
  }
  const meta = order.metadata ?? {};
  const manualPending =
    order.payment_provider === "pending_checkout" ||
    meta.checkout_mode === "manual_pending";
  if (manualPending) {
    return false;
  }
  return order.credit_status === "credited";
}

export function filterClientAccountOrders<T extends SmsOrderRow>(
  orders: T[],
): T[] {
  return orders.filter(isClientAccountOrder);
}

export function isQaTransaction(
  tx: Pick<WalletTransactionRow, "metadata" | "description">,
): boolean {
  const meta = tx.metadata ?? {};
  if (meta.source === "qa") {
    return true;
  }
  const desc = String(tx.description ?? "");
  return /\bQA\b/i.test(desc) || /QA-E2E/i.test(desc) || /E2E credit/i.test(desc);
}

export function formatOrderShortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function orderMatchesFilter(
  order: Pick<SmsOrderRow, "payment_status" | "credit_status">,
  filter: OrderListFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "pending") {
    return (
      order.payment_status === "pending" ||
      (order.payment_status === "paid" && order.credit_status === "pending")
    );
  }
  if (filter === "paid") {
    return order.payment_status === "paid";
  }
  if (filter === "credited") {
    return order.credit_status === "credited";
  }
  if (filter === "rejected") {
    return order.payment_status === "rejected";
  }
  if (filter === "cancelled") {
    return order.payment_status === "cancelled";
  }
  return true;
}

export function paymentMethodLabel(provider: string | null): string {
  if (!provider) {
    return "—";
  }
  const map: Record<string, string> = {
    pending_checkout: "Pago manual (pendiente)",
    manual: "Pago manual",
    mercadopago: "Mercado Pago",
    stripe: "Stripe",
  };
  return map[provider] ?? provider;
}

export function checkoutModeLabel(
  metadata: Record<string, unknown> | undefined,
): string {
  const mode = metadata?.checkout_mode;
  if (mode === "mercadopago") {
    return "MercadoPago";
  }
  if (mode === "stripe") {
    return "Stripe";
  }
  if (mode === "manual_pending") {
    return "Pago manual pendiente";
  }
  return "—";
}

export type TimelineStep = {
  title: string;
  detail: string;
  state: "done" | "current" | "upcoming";
};

export function buildOrderTimeline(
  order: Pick<
    SmsOrderRow,
    "created_at" | "payment_status" | "credit_status" | "credited_at"
  >,
): TimelineStep[] {
  const created = formatTimelineDate(order.created_at);
  const paid =
    order.payment_status === "paid" ||
    order.payment_status === "refunded" ||
    order.credit_status === "credited";
  const credited = order.credit_status === "credited";
  const rejected =
    order.payment_status === "rejected" || order.payment_status === "cancelled";

  const steps: TimelineStep[] = [
    {
      title: "Orden creada",
      detail: created,
      state: "done",
    },
  ];

  if (rejected) {
    steps.push({
      title:
        order.payment_status === "cancelled"
          ? "Orden cancelada"
          : "Pago rechazado",
      detail: "No se acreditará saldo automáticamente.",
      state: "current",
    });
    return steps;
  }

  steps.push({
    title: paid ? "Pago confirmado" : "Pago pendiente",
    detail: paid
      ? "El equipo Telvoice registró el pago."
      : "Esperando confirmación de pago.",
    state: paid ? "done" : "current",
  });

  steps.push({
    title: credited ? "SMS acreditados" : "Acreditación pendiente",
    detail: credited
      ? order.credited_at
        ? formatTimelineDate(order.credited_at)
        : "Saldo disponible en tu wallet."
      : "Se acreditará al confirmar el pago.",
    state: credited ? "done" : paid ? "current" : "upcoming",
  });

  return steps;
}

function formatTimelineDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  const map: Record<PaymentStatus, string> = {
    pending: "Pago pendiente",
    paid: "Pagada",
    rejected: "Rechazada",
    cancelled: "Cancelada",
    refunded: "Reembolsada",
  };
  return map[status] ?? status;
}

export function mercadoPagoOrderHasPendingCheckout(order: {
  payment_status: PaymentStatus;
  metadata?: Record<string, unknown>;
}): boolean {
  if (order.payment_status !== "pending") {
    return false;
  }
  const meta = order.metadata ?? {};
  return Boolean(
    meta.mercadopago_init_point ||
      meta.mercadopago_sandbox_init_point ||
      meta.mercadopago_preference_id,
  );
}

export function mercadoPagoWebhookReceived(
  metadata: Record<string, unknown> | undefined,
): boolean {
  return Boolean(metadata?.mercadopago_webhook_at);
}

export function renderSaPaymentMethodBadge(
  provider: string | null,
  metadata?: Record<string, unknown>,
): string {
  const mode = metadata?.checkout_mode;
  if (provider === "mercadopago" || mode === "mercadopago") {
    return `<span class="badge badge-ok">MercadoPago</span>`;
  }
  if (
    provider === "manual" ||
    provider === "pending_checkout" ||
    mode === "manual_pending"
  ) {
    return `<span class="badge badge-muted">Manual</span>`;
  }
  return `<span class="badge badge-muted">${escapeHtml(paymentMethodLabel(provider))}</span>`;
}

export function renderSaOrderStatusBadges(
  order: Pick<
    SmsOrderRow,
    "payment_status" | "credit_status" | "payment_provider" | "metadata"
  >,
): string {
  const parts: string[] = [renderSaPaymentMethodBadge(order.payment_provider, order.metadata)];

  if (order.payment_status === "cancelled") {
    parts.push(`<span class="badge badge-muted">Cancelada</span>`);
  } else if (order.payment_status === "pending") {
    parts.push(`<span class="badge badge-warn">Pago pendiente</span>`);
  } else if (order.payment_status === "paid") {
    parts.push(`<span class="badge badge-ok">Pagada</span>`);
  } else if (order.payment_status === "rejected") {
    parts.push(`<span class="badge badge-err">Rechazada</span>`);
  }

  if (order.credit_status === "credited") {
    parts.push(`<span class="badge badge-ok">Acreditada</span>`);
  }

  if (mercadoPagoWebhookReceived(order.metadata)) {
    parts.push(`<span class="badge badge-muted">Webhook recibido</span>`);
  }

  return parts.join(" ");
}

export function mercadoPagoPaymentAuditRows(
  order: Pick<SmsOrderRow, "amount" | "currency" | "payment_provider" | "metadata">,
): Array<{ label: string; value: string }> {
  const meta = order.metadata ?? {};
  const rows: Array<{ label: string; value: string }> = [];

  if (meta.mercadopago_preference_id) {
    rows.push({
      label: "Preference ID",
      value: String(meta.mercadopago_preference_id),
    });
  }
  if (meta.mercadopago_payment_id) {
    rows.push({ label: "Payment ID", value: String(meta.mercadopago_payment_id) });
  }
  if (meta.mercadopago_status) {
    rows.push({ label: "Estado MercadoPago", value: String(meta.mercadopago_status) });
  }
  if (meta.mercadopago_status_detail) {
    rows.push({
      label: "Status detail",
      value: String(meta.mercadopago_status_detail),
    });
  }
  if (meta.mercadopago_webhook_at) {
    rows.push({
      label: "Último webhook",
      value: String(meta.mercadopago_webhook_at),
    });
  }
  if (meta.mercadopago_processed_at) {
    rows.push({
      label: "Procesado",
      value: String(meta.mercadopago_processed_at),
    });
  }
  const validatedAmount =
    meta.mercadopago_amount != null
      ? String(meta.mercadopago_amount)
      : String(order.amount);
  const validatedCurrency =
    meta.mercadopago_currency != null
      ? String(meta.mercadopago_currency)
      : order.currency;
  rows.push({
    label: "Monto validado",
    value: `${validatedAmount} ${validatedCurrency}`,
  });
  if (meta.mercadopago_payment_method_id) {
    rows.push({
      label: "Método de pago MP",
      value: String(meta.mercadopago_payment_method_id),
    });
  }
  rows.push({
    label: "Proveedor orden",
    value: paymentMethodLabel(order.payment_provider),
  });

  return rows;
}

/** @deprecated use mercadoPagoPaymentAuditRows */
export function mercadoPagoAdminMetaRows(
  metadata: Record<string, unknown> | undefined,
): Array<{ label: string; value: string }> {
  return mercadoPagoPaymentAuditRows({
    amount: 0,
    currency: "CLP",
    payment_provider: "mercadopago",
    metadata: metadata ?? {},
  });
}

export function creditStatusLabel(status: CreditStatus): string {
  const map: Record<CreditStatus, string> = {
    pending: "Acreditación pendiente",
    pending_claim: "Pendiente activación",
    credited: "Acreditada",
    failed: "Fallida",
    reversed: "Revertida",
  };
  return map[status] ?? status;
}
