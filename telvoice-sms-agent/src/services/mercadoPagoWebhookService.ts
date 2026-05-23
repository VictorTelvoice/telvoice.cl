import { getMercadoPagoPayment } from "./mercadoPagoService.js";
import {
  isClientPanelMercadoPagoOrder,
  loadOrderForWebhook,
} from "./mercadoPagoClientPanelService.js";
import {
  confirmOrderCredit,
  getOrderById,
  markOrderPaid,
  patchOrderFields,
} from "./smsOrderService.js";

function mergeMpMetadata(
  order: { metadata?: Record<string, unknown> },
  payment: {
    id: number | string;
    status: string;
    status_detail?: string;
    payment_method_id?: string | null;
  },
): Record<string, unknown> {
  return {
    ...(order.metadata ?? {}),
    mercadopago_payment_id: String(payment.id),
    mercadopago_status: payment.status,
    mercadopago_status_detail: payment.status_detail ?? null,
    mercadopago_payment_method_id: payment.payment_method_id ?? null,
    mercadopago_webhook_at: new Date().toISOString(),
  };
}

export async function processClientPanelMercadoPagoWebhook(
  paymentId: string,
): Promise<{ handled: boolean; orderId?: string; result?: string }> {
  const payment = await getMercadoPagoPayment(paymentId);
  const orderId = payment.external_reference?.trim();
  if (!orderId) {
    console.warn("[mp-webhook] payment sin external_reference", paymentId);
    return { handled: false };
  }

  const order = await loadOrderForWebhook(orderId);
  if (!order) {
    return { handled: false };
  }

  if (
    order.metadata?.mercadopago_payment_id === String(paymentId) &&
    order.metadata?.mercadopago_status === payment.status &&
    order.credit_status === "credited" &&
    payment.status === "approved"
  ) {
    console.log("[mp-webhook] idempotente, orden ya acreditada", orderId);
    return { handled: true, orderId, result: "already_credited" };
  }

  const metaPatch = mergeMpMetadata(order, payment);

  if (payment.status === "approved") {
    const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));
    const expected = Math.round(Number(order.amount));
    if (payment.currency_id && payment.currency_id !== "CLP") {
      console.error("[mp-webhook] moneda inválida", payment.currency_id, orderId);
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "invalid_currency" };
    }
    if (paidAmount !== expected) {
      console.error(
        "[mp-webhook] monto no coincide",
        paidAmount,
        expected,
        orderId,
      );
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "amount_mismatch" };
    }

    if (order.payment_status !== "paid") {
      await markOrderPaid(orderId, null);
    }

    const credit = await confirmOrderCredit(orderId, null, {
      allowManualWithoutPaid: false,
    });

    await patchOrderFields(orderId, { metadata: metaPatch });

    return {
      handled: true,
      orderId,
      result: credit.alreadyCredited ? "already_credited" : "credited",
    };
  }

  if (payment.status === "rejected") {
    await patchOrderFields(orderId, {
      payment_status: "rejected",
      metadata: metaPatch,
    });
    return { handled: true, orderId, result: "rejected" };
  }

  if (payment.status === "cancelled") {
    await patchOrderFields(orderId, {
      payment_status: "cancelled",
      metadata: metaPatch,
    });
    return { handled: true, orderId, result: "cancelled" };
  }

  await patchOrderFields(orderId, { metadata: metaPatch });
  return { handled: true, orderId, result: payment.status };
}

/** Ignora pagos cuyo external_reference no es orden del panel (landing u otros). */
export async function routeMercadoPagoWebhook(
  paymentId: string,
): Promise<{ ok: boolean; skipped?: string; orderId?: string; result?: string }> {
  const payment = await getMercadoPagoPayment(paymentId);
  const orderId = payment.external_reference?.trim();
  if (!orderId) {
    return { ok: true, skipped: "no_external_reference" };
  }

  const order = await getOrderById(orderId);
  if (!order) {
    return { ok: true, skipped: "order_not_in_sms_orders" };
  }

  if (!isClientPanelMercadoPagoOrder(order)) {
    return { ok: true, skipped: "not_client_panel_order" };
  }

  const result = await processClientPanelMercadoPagoWebhook(paymentId);
  return {
    ok: true,
    orderId: result.orderId,
    result: result.result,
  };
}
