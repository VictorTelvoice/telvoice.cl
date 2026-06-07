import type { SmsOrderWithDetails } from "../types/wallet.js";
import { IVA_RATE, calcIvaFromSubtotal, formatClp } from "./clp-format.js";
import { formatOrderShortId } from "./order-display.js";

export type PublicOrderSummary = {
  orderId: string;
  orderRef: string;
  packageName: string | null;
  smsQuantity: number;
  paymentStatus: string;
  creditStatus: string;
  claimStatus: string | null;
  customerEmail: string | null;
  mpPaymentId: string | null;
  formatted: {
    net: string;
    tax: string;
    total: string;
    sms: string;
  };
};

function amountBreakdown(totalWithIva: number): { net: number; tax: number; total: number } {
  const total = Math.round(Number(totalWithIva));
  const subtotal = Math.round(total / (1 + IVA_RATE));
  const { iva, total_with_iva } = calcIvaFromSubtotal(subtotal);
  if (total_with_iva !== total) {
    return { net: subtotal, tax: total - subtotal, total };
  }
  return { net: subtotal, tax: iva, total };
}

function orderRefLabel(orderId: string, publicRef?: string | null): string {
  return publicRef?.trim() || formatOrderShortId(orderId);
}

export function toPublicOrderSummary(
  order: SmsOrderWithDetails,
): PublicOrderSummary {
  const meta = order.metadata ?? {};
  const mpPaymentId =
    typeof meta.mercadopago_payment_id === "string"
      ? meta.mercadopago_payment_id
      : null;
  const { net, tax, total } = amountBreakdown(order.amount);
  const email =
    order.checkout_email?.trim() ||
    order.payer_email?.trim() ||
    null;

  return {
    orderId: order.id,
    orderRef: orderRefLabel(order.id, order.public_checkout_reference),
    packageName:
      order.package_name ??
      (typeof meta.plan_name === "string" ? meta.plan_name : null),
    smsQuantity: order.sms_quantity,
    paymentStatus: order.payment_status,
    creditStatus: order.credit_status,
    claimStatus: order.claim_status ?? null,
    customerEmail: email,
    mpPaymentId,
    formatted: {
      net: formatClp(net),
      tax: formatClp(tax),
      total: formatClp(total),
      sms: new Intl.NumberFormat("es-CL").format(order.sms_quantity),
    },
  };
}
