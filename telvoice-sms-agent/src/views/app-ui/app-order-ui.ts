import type { CreditStatus, PaymentStatus } from "../../types/wallet.js";
import {
  creditStatusLabel,
  formatOrderShortId,
  isQaOrder,
  isQaTransaction,
  paymentStatusLabel,
  type OrderListFilter,
  type TimelineStep,
} from "../../utils/order-display.js";
import { escapeHtml } from "../../utils/html.js";
import type { SmsOrderWithDetails } from "../../types/wallet.js";
import type { WalletTransactionRow } from "../../types/wallet.js";

export function renderQaBadge(): string {
  return `<span class="badge badge-muted tv-badge-qa">Prueba interna</span>`;
}

function badge(cls: string, label: string): string {
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

export function renderClientPaymentBadge(status: PaymentStatus): string {
  const cls: Record<PaymentStatus, string> = {
    pending: "warn",
    paid: "ok",
    rejected: "err",
    cancelled: "muted",
    refunded: "muted",
  };
  return badge(cls[status] ?? "muted", paymentStatusLabel(status));
}

export function renderClientCreditBadge(status: CreditStatus): string {
  if (status === "credited") {
    return badge("ok", "SMS acreditados");
  }
  if (status === "failed" || status === "reversed") {
    return badge("err", creditStatusLabel(status));
  }
  return badge("warn", "Acreditación pendiente");
}

export function renderOrderQaBadgeIfNeeded(
  order: Pick<SmsOrderWithDetails, "metadata" | "payment_reference">,
): string {
  return isQaOrder(order) ? ` ${renderQaBadge()}` : "";
}

export function renderTxQaBadgeIfNeeded(
  tx: Pick<WalletTransactionRow, "metadata" | "description">,
): string {
  return isQaTransaction(tx) ? ` ${renderQaBadge()}` : "";
}

export function renderOrderFilterTabs(
  active: OrderListFilter,
  basePath = "/app/orders",
): string {
  const tabs: { id: OrderListFilter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "pending", label: "Pendientes" },
    { id: "paid", label: "Pagadas" },
    { id: "credited", label: "Acreditadas" },
    { id: "rejected", label: "Rechazadas" },
    { id: "cancelled", label: "Canceladas" },
  ];
  const links = tabs
    .map((t) => {
      const href = t.id === "all" ? basePath : `${basePath}?filter=${t.id}`;
      const cls =
        active === t.id
          ? "tv-filter-tab tv-filter-tab--active"
          : "tv-filter-tab";
      return `<a href="${href}" class="${cls}">${escapeHtml(t.label)}</a>`;
    })
    .join("");
  return `<nav class="tv-filter-tabs" aria-label="Filtrar órdenes">${links}</nav>`;
}

export function renderOrderTimeline(steps: TimelineStep[]): string {
  const items = steps
    .map((s) => {
      const icon =
        s.state === "done"
          ? "check_circle"
          : s.state === "current"
            ? "pending"
            : "radio_button_unchecked";
      return `<li class="tv-timeline__item tv-timeline__item--${s.state}">
        <span class="material-symbols-outlined tv-timeline__icon" aria-hidden="true">${icon}</span>
        <div>
          <strong>${escapeHtml(s.title)}</strong>
          <p class="field-hint" style="margin:0.15rem 0 0">${escapeHtml(s.detail)}</p>
        </div>
      </li>`;
    })
    .join("");
  return `<ol class="tv-timeline">${items}</ol>`;
}

export function renderOrderShortIdCell(id: string): string {
  const short = formatOrderShortId(id);
  return `<code class="tv-order-id" title="${escapeHtml(id)}">${escapeHtml(short)}</code>`;
}

export function renderWalletTxTypeBadge(type: string): string {
  const map: Record<string, [string, string]> = {
    purchase_credit: ["ok", "Compra acreditada"],
    manual_credit: ["ok", "Carga manual"],
    manual_debit: ["warn", "Descuento manual"],
    sms_debit: ["muted", "Consumo SMS"],
    sms_refund: ["ok", "Devolución"],
    reserve: ["warn", "Reserva"],
    release_reserved: ["muted", "Liberación reserva"],
    adjustment: ["warn", "Ajuste"],
    reversal: ["err", "Reversión"],
  };
  const [cls, label] = map[type] ?? ["muted", type];
  return badge(cls, label);
}
