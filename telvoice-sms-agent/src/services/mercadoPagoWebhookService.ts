import { getSupabase } from "../database/supabaseClient.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { getMercadoPagoPayment, getMercadoPagoPreapproval } from "./mercadoPagoService.js";
import {
  isClientPanelMercadoPagoOrder,
  loadOrderForWebhook,
} from "./mercadoPagoClientPanelService.js";
import {
  confirmOrderCredit,
  createOrder,
  getOrderById,
  markOrderPaid,
  patchOrderFields,
} from "./smsOrderService.js";
import {
  CLIENT_PANEL_ORDER_METADATA,
  isPublicCheckoutOrder,
} from "../utils/order-display.js";
import { sendPaymentReceivedClaimEmail } from "./transactionalEmailService.js";
import { hasPurchaseCreditForOrder } from "./walletTransactionService.js";
import { syncPaymentCardFromOrderMetadata } from "./companyPaymentCardService.js";
import {
  findSubscriptionByExternalReference,
  findSubscriptionByPreapprovalId,
  recordSubscriptionPayment,
  updateSmsMpSubscriptionStatus,
} from "./smsMpSubscriptionService.js";
import {
  handlePaidPurchasePostProcessing,
  runPostCreditPurchaseFlow,
  shouldSendPaymentClaimEmail,
} from "./paidPurchasePostProcessingService.js";
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

async function runPostPurchaseAfterCredit(orderId: string): Promise<void> {
  const result = await runPostCreditPurchaseFlow(orderId, {
    dryRun: false,
    source: "mercadopago_webhook",
    skipReconcile: true,
  });
  console.log("[mp-webhook] post_purchase_flow", orderId, result.action, {
    wouldSendEmails: result.wouldSendEmails,
    missingSteps: result.missingSteps,
  });
}

async function resolveAlreadyCredited(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<{ handled: true; orderId: string; result: "already_credited" }> {
  if (order.credit_status === "credited") {
    await patchOrderFields(orderId, { metadata: metaPatch });
    console.log("[mp-webhook] already_credited (orden acreditada)", orderId);
    await runPostPurchaseAfterCredit(orderId);
    return { handled: true, orderId, result: "already_credited" };
  }

  const hasTx = await hasPurchaseCreditForOrder(orderId);
  if (hasTx) {
    await syncCreditedOrderState(orderId, order, metaPatch);
    console.log("[mp-webhook] already_credited (purchase_credit existente)", orderId);
    await runPostPurchaseAfterCredit(orderId);
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

  await runPostPurchaseAfterCredit(orderId);

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
    if (latestBefore?.payment_status !== "paid") {
      await markOrderPaid(orderId, null);
    }

    await patchOrderFields(orderId, { metadata: metaPatch });

    const postResult = await handlePaidPurchasePostProcessing(orderId, {
      dryRun: false,
      source: "mp_webhook_public",
    });

    const refreshed = await getOrderById(orderId);
    if (
      refreshed?.credit_status !== "credited" &&
      (postResult.action === "reconcile_failed" || postResult.action === "not_credited")
    ) {
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

      if (await shouldSendPaymentClaimEmail(orderId)) {
        try {
          await sendPaymentReceivedClaimEmail(orderId);
        } catch (err) {
          console.error("[mp-webhook] payment claim email failed", orderId, err);
        }
      }
    }

    const result =
      refreshed?.credit_status === "credited" ||
      postResult.action === "processed" ||
      postResult.action === "already_processed"
        ? "paid_credited"
        : "paid_pending_claim";
    return { handled: true, orderId, result };
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
function subscriptionRefFromPayment(
  payment: MercadoPagoPaymentRecord & { preapproval_id?: string },
): string | null {
  const meta = payment.metadata ?? {};
  const fromMeta =
    typeof meta.subscription_id === "string" ? meta.subscription_id.trim() : "";
  if (fromMeta) {
    return fromMeta;
  }
  const ext = payment.external_reference?.trim();
  if (ext) {
    return ext;
  }
  const pre = payment.preapproval_id?.trim();
  return pre || null;
}

export async function processMercadoPagoPreapprovalWebhook(
  preapprovalId: string,
): Promise<{ ok: boolean; result?: string; subscriptionId?: string }> {
  const pre = await getMercadoPagoPreapproval(preapprovalId);
  const ref = pre.external_reference?.trim();
  if (!ref) {
    return { ok: true, result: "no_external_reference" };
  }

  const found = await findSubscriptionByExternalReference(ref);
  if (!found) {
    const byMp = await findSubscriptionByPreapprovalId(preapprovalId);
    if (!byMp) {
      return { ok: true, result: "subscription_not_found" };
    }
    await applyPreapprovalStatus(byMp.companyId, byMp.subscription.id, pre);
    return { ok: true, subscriptionId: byMp.subscription.id, result: pre.status };
  }

  await applyPreapprovalStatus(found.companyId, found.subscription.id, pre);
  return { ok: true, subscriptionId: found.subscription.id, result: pre.status };
}

async function applyPreapprovalStatus(
  companyId: string,
  subscriptionId: string,
  pre: { status?: string; id?: string },
): Promise<void> {
  const status = (pre.status ?? "").toLowerCase();
  if (status === "authorized") {
    await updateSmsMpSubscriptionStatus({
      companyId,
      subscriptionId,
      status: "authorized",
      mpPreapprovalId: pre.id ?? null,
    });
    return;
  }
  if (status === "paused") {
    await updateSmsMpSubscriptionStatus({
      companyId,
      subscriptionId,
      status: "paused",
      mpPreapprovalId: pre.id ?? null,
    });
    return;
  }
  if (status === "cancelled") {
    await updateSmsMpSubscriptionStatus({
      companyId,
      subscriptionId,
      status: "cancelled",
      mpPreapprovalId: pre.id ?? null,
    });
  }
}

export async function processSubscriptionMercadoPagoPayment(
  paymentId: string,
): Promise<{ handled: boolean; orderId?: string; result?: string }> {
  const payment = await getMercadoPagoPayment(paymentId);
  if (payment.status !== "approved") {
    return { handled: false };
  }

  const ref = subscriptionRefFromPayment(
    payment as MercadoPagoPaymentRecord & { preapproval_id?: string },
  );
  if (!ref) {
    return { handled: false };
  }

  let found = await findSubscriptionByExternalReference(ref);
  if (!found) {
    const preId =
      (payment as { preapproval_id?: string }).preapproval_id?.trim() ?? ref;
    found = await findSubscriptionByPreapprovalId(preId);
  }
  if (!found) {
    return { handled: false };
  }

  const { companyId, subscription } = found;
  const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));
  if (paidAmount !== subscription.monthlyAmount) {
    console.warn(
      "[mp-webhook] suscripción monto distinto",
      paidAmount,
      subscription.monthlyAmount,
      subscription.id,
    );
    return { handled: true, result: "amount_mismatch" };
  }

  const payRef = `MP-SUB-${paymentId}`;
  const { data: existing } = await getSupabase()
    .from("sms_orders")
    .select("id, credit_status")
    .eq("payment_reference", payRef)
    .maybeSingle();

  if (existing?.credit_status === "credited") {
    return { handled: true, orderId: existing.id as string, result: "already_credited" };
  }

  let orderId: string;
  if (existing?.id) {
    orderId = String(existing.id);
  } else {
    const created = await createOrder({
      companyId,
      packageId: subscription.packageId,
      paymentProvider: "mercadopago",
      paymentReference: payRef,
      metadata: {
        ...CLIENT_PANEL_ORDER_METADATA,
        checkout_mode: "mercadopago_subscription",
        subscription_id: subscription.id,
        subscription_payment: true,
        mercadopago_payment_id: String(payment.id),
        mercadopago_preapproval_id: subscription.mpPreapprovalId,
      },
    });
    orderId = created.id;
  }

  const orderRow = await getOrderById(orderId);
  if (!orderRow) {
    return { handled: false };
  }

  const metaPatch = mergeMpMetadata(orderRow, payment);
  const creditResult = await creditApprovedOrder(orderId, orderRow, metaPatch);
  await recordSubscriptionPayment({
    companyId,
    subscriptionId: subscription.id,
    orderId,
  });
  await syncPaymentCardFromOrderMetadata(companyId, orderRow.metadata, payment);

  return creditResult;
}

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
    const sub = await processSubscriptionMercadoPagoPayment(paymentId);
    if (sub.handled) {
      return {
        ok: true,
        orderId: sub.orderId,
        result: sub.result ?? "subscription_payment",
      };
    }
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
