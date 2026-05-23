import type {
  CreditStatus,
  PaymentStatus,
  SmsOrderRow,
  WalletTransactionRow,
} from "../types/wallet.js";

/** Metadata estándar para órdenes creadas desde /app/buy-sms */
export const CLIENT_PANEL_ORDER_METADATA = {
  source: "client_panel",
  checkout_mode: "manual_pending",
  customer_visible: true,
} as const;

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
    mercadopago: "MercadoPago",
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

export function creditStatusLabel(status: CreditStatus): string {
  const map: Record<CreditStatus, string> = {
    pending: "Acreditación pendiente",
    credited: "Acreditada",
    failed: "Fallida",
    reversed: "Revertida",
  };
  return map[status] ?? status;
}
