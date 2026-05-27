import { getSupabase } from "../database/supabaseClient.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
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
import { isPublicCheckoutOrder } from "../utils/order-display.js";
import { sendPaymentReceivedClaimEmail } from "./transactionalEmailService.js";
import { hasPurchaseCreditForOrder } from "./walletTransactionService.js";
import { syncPaymentCardFromOrderMetadata } from "./companyPaymentCardService.js";
import { runBillingSyncBestEffort } from "./billingSyncService.js";
import type { MercadoPagoPaymentRecord } from "./mercadoPagoService.js";
import type { SmsOrderRow } from "../types/wallet.js";

function mergeMpMetadata(
  order: { metadata?: Record<string, unknown> },
  payment: MercadoPagoPaymentRecord,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const prev = order.metadata ?? {};
  const approved = payment.status === "approved";

  return {
    ...prev,
    mercadopago_payment_id: String(payment.id),
    mercadopago_status: payment.status,
    mercadopago_status_detail: payment.status_detail ?? null,
    mercadopago_payment_method_id: payment.payment_method_id ?? null,
    mercadopago_webhook_at: now,
    mercadopago_amount:
      payment.transaction_amount != null
        ? Math.round(Number(payment.transaction_amount))
        : prev.mercadopago_amount ?? null,
    mercadopago_currency: payment.currency_id ?? prev.mercadopago_currency ?? null,
    ...(approved ? { mercadopago_processed_at: now } : {}),
  };
}

async function syncCreditedOrderState(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<SmsOrderRow> {
  if (order.credit_status !== "credited") {
    const refreshed = await getOrderById(orderId);
    if (refreshed?.credit_status === "credited") {
      await patchOrderFields(orderId, { metadata: metaPatch });
      return refreshed;
    }
    await patchOrderFields(orderId, {
      payment_status: order.payment_status === "pending" ? "paid" : order.payment_status,
      credit_status: "credited",
      credited_at: new Date().toISOString(),
      metadata: metaPatch,
    });
    const afterSync = await getOrderById(orderId);
    return afterSync ?? order;
  }
  await patchOrderFields(orderId, { metadata: metaPatch });
  const latest = await getOrderById(orderId);
  return latest ?? order;
}

async function resolveAlreadyCredited(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<{ handled: true; orderId: string; result: "already_credited" }> {
  if (order.credit_status === "credited") {
    await patchOrderFields(orderId, { metadata: metaPatch });
    console.log("[mp-webhook] already_credited (orden acreditada)", orderId);
    await runBillingSyncBestEffort(orderId, { source: "mercadopago_webhook" });
    return { handled: true, orderId, result: "already_credited" };
  }

  const hasTx = await hasPurchaseCreditForOrder(orderId);
  if (hasTx) {
    await syncCreditedOrderState(orderId, order, metaPatch);
    console.log("[mp-webhook] already_credited (purchase_credit existente)", orderId);
    await runBillingSyncBestEffort(orderId, { source: "mercadopago_webhook" });
    return { handled: true, orderId, result: "already_credited" };
  }

  return { handled: true, orderId, result: "already_credited" };
}

async function creditApprovedOrder(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<{ handled: true; orderId: string; result: string }> {
  const early = await resolveAlreadyCreditedIfApplicable(orderId, order, metaPatch);
  if (early) {
    return early;
  }

  if (order.payment_status !== "paid") {
    await markOrderPaid(orderId, null);
  }

  const credit = await confirmOrderCredit(orderId, null, {
    allowManualWithoutPaid: false,
  });

  await patchOrderFields(orderId, { metadata: metaPatch });

  const result = credit.alreadyCredited ? "already_credited" : "credited";
  if (credit.alreadyCredited) {
    console.log("[mp-webhook] already_credited (confirmOrderCredit)", orderId);
  } else {
    console.log("[mp-webhook] credited", orderId);
  }

  await runBillingSyncBestEffort(orderId, { source: "mercadopago_webhook" });

  return { handled: true, orderId, result };
}

async function resolveAlreadyCreditedIfApplicable(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<{ handled: true; orderId: string; result: "already_credited" } | null> {
  if (order.credit_status === "credited") {
    return resolveAlreadyCredited(orderId, order, metaPatch);
  }
  if (await hasPurchaseCreditForOrder(orderId)) {
    return resolveAlreadyCredited(orderId, order, metaPatch);
  }
  return null;
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

  const metaPatch = mergeMpMetadata(order, payment);

  if (payment.status === "approved") {
    const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));
    const expected = Math.round(Number(order.amount));
    if (payment.currency_id && payment.currency_id !== "CLP") {
      console.warn("[mp-webhook] moneda inválida", payment.currency_id, orderId);
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "invalid_currency" };
    }
    if (paidAmount !== expected) {
      console.warn(
        "[mp-webhook] monto no coincide",
        paidAmount,
        expected,
        orderId,
      );
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "amount_mismatch" };
    }

    const creditResult = await creditApprovedOrder(orderId, order, metaPatch);
    if (order.company_id) {
      await syncPaymentCardFromOrderMetadata(
        order.company_id,
        order.metadata,
        payment,
      );
    }
    return creditResult;
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

export async function processPublicCheckoutMercadoPagoWebhook(
  paymentId: string,
): Promise<{ handled: boolean; orderId?: string; result?: string }> {
  const payment = await getMercadoPagoPayment(paymentId);
  const orderId = payment.external_reference?.trim();
  if (!orderId) {
    return { handled: false };
  }

  const order = await getOrderById(orderId);
  if (!order || !isPublicCheckoutOrder(order)) {
    return { handled: false };
  }

  const metaPatch = mergeMpMetadata(order, payment);

  if (payment.status === "approved") {
    const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));
    const expected = Math.round(Number(order.amount));
    if (payment.currency_id && payment.currency_id !== "CLP") {
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "invalid_currency" };
    }
    if (paidAmount !== expected) {
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "amount_mismatch" };
    }

    const latestBefore = await getOrderById(orderId);
    if (latestBefore?.credit_status === "credited") {
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "already_credited" };
    }

    if (latestBefore?.payment_status !== "paid") {
      await markOrderPaid(orderId, null);
    }

    const { error: claimErr } = await getSupabase()
      .from("sms_orders")
      .update({
        credit_status: "pending_claim",
        claim_status: latestBefore?.claim_status ?? "unclaimed",
      })
      .eq("id", orderId)
      .neq("credit_status", "credited");
    if (claimErr) {
      wrapSupabaseError(claimErr, "publicCheckoutWebhook.pending_claim");
    }

    await patchOrderFields(orderId, { metadata: metaPatch });

    try {
      await sendPaymentReceivedClaimEmail(orderId);
    } catch (err) {
      console.error("[mp-webhook] payment claim email failed", orderId, err);
    }

    return { handled: true, orderId, result: "paid_pending_claim" };
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

  if (isPublicCheckoutOrder(order)) {
    const pub = await processPublicCheckoutMercadoPagoWebhook(paymentId);
    return {
      ok: true,
      orderId: pub.orderId,
      result: pub.result,
    };
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
