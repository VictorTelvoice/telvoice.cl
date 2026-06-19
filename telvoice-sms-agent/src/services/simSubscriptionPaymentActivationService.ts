import { env } from "../config/env.js";
import { getMercadoPagoPayment, getMercadoPagoPreapproval, searchMercadoPagoAuthorizedPaymentsByPreapproval, getMercadoPagoAuthorizedPayment } from "./mercadoPagoService.js";
import {
  getOrderById,
  markOrderPaid,
  patchOrderFields,
} from "./smsOrderService.js";
import { isSimSubscriptionOrder } from "../utils/order-display.js";
import { getSimPlan, getBundledAgentAddonForSimPlan } from "../utils/simPlans.js";
import { getAgentAddon } from "../utils/agentAddons.js";
import {
  canOrderClaimInventoryOnPayment,
  markNumberPaymentApproved,
} from "./realNumberInventoryService.js";
import { provisionCompanyFromCheckout } from "./checkoutAccountProvisionService.js";
import { createAgentPlanRequestFromCheckout } from "./clientAgentPlanService.js";
import {
  createSimActivationRequest,
  linkSimActivationInventory,
  markSimActivationPaidPending,
  processSimPostPaymentActivation,
  getSimActivationByOrderId,
} from "./simActivationService.js";
import {
  getSimSubscriptionByOrderId,
  getSimSubscriptionByPreapprovalId,
  syncSimSubscriptionAfterOrderFirstPayment,
} from "./simSubscriptionService.js";
import { sendSimSubscriptionPaymentConfirmedEmails } from "./transactionalEmailService.js";
import { getInventoryById } from "./realNumberInventoryService.js";
import type { MercadoPagoPaymentRecord } from "./mercadoPagoService.js";

export type SimSubscriptionPaymentActivationResult = {
  ok: boolean;
  result: string;
  orderId?: string;
  subscriptionId?: string;
  paymentId?: string;
  risks?: string[];
};

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

function resolveExpectedChargeAmount(order: {
  amount: number | string;
  metadata?: Record<string, unknown>;
}): number {
  const meta = order.metadata ?? {};
  const fromMeta =
    Number(meta.charge_amount_clp ?? meta.transaction_amount_clp ?? 0) || 0;
  if (fromMeta > 0) return Math.round(fromMeta);
  return Math.round(Number(order.amount));
}

export async function resolveSimSubscriptionOrder(input: {
  orderId?: string | null;
  preapprovalId?: string | null;
  externalReference?: string | null;
  operationId?: string | null;
}): Promise<{
  order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>;
  subscription: NonNullable<Awaited<ReturnType<typeof getSimSubscriptionByOrderId>>>;
} | null> {
  if (input.orderId) {
    const order = await getOrderById(input.orderId.trim());
    if (!order || !isSimSubscriptionOrder(order)) return null;
    const subscription =
      (await getSimSubscriptionByOrderId(order.id)) ??
      (input.preapprovalId
        ? await getSimSubscriptionByPreapprovalId(input.preapprovalId)
        : null);
    if (!subscription) return null;
    return { order, subscription };
  }

  if (input.preapprovalId) {
    const subscription = await getSimSubscriptionByPreapprovalId(input.preapprovalId);
    if (!subscription) return null;
    const order = await getOrderById(subscription.order_id);
    if (!order || !isSimSubscriptionOrder(order)) return null;
    return { order, subscription };
  }

  if (input.externalReference) {
    const order = await getOrderById(input.externalReference.trim());
    if (!order || !isSimSubscriptionOrder(order)) return null;
    const subscription = await getSimSubscriptionByOrderId(order.id);
    if (!subscription) return null;
    return { order, subscription };
  }

  if (input.operationId) {
    const op = input.operationId.trim();
    const byPre = await getSimSubscriptionByPreapprovalId(op);
    if (byPre) {
      const order = await getOrderById(byPre.order_id);
      if (order && isSimSubscriptionOrder(order)) {
        return { order, subscription: byPre };
      }
    }
    try {
      const payment = await getMercadoPagoPayment(op);
      const ext = payment.external_reference?.trim();
      if (ext) {
        const order = await getOrderById(ext);
        if (order && isSimSubscriptionOrder(order)) {
          const subscription = await getSimSubscriptionByOrderId(order.id);
          if (subscription) return { order, subscription };
        }
      }
      const preId = (payment as { preapproval_id?: string }).preapproval_id?.trim();
      if (preId) {
        const subscription = await getSimSubscriptionByPreapprovalId(preId);
        if (subscription) {
          const order = await getOrderById(subscription.order_id);
          if (order && isSimSubscriptionOrder(order)) {
            return { order, subscription };
          }
        }
      }
    } catch {
      // operation id may be authorized_payment id — handled elsewhere
    }
  }

  return null;
}

export async function applySimSubscriptionApprovedPayment(input: {
  orderId: string;
  paymentId: string;
  paymentStatus: string;
  transactionAmount: number;
  preapprovalId?: string | null;
  source: string;
  dryRun?: boolean;
}): Promise<SimSubscriptionPaymentActivationResult> {
  const risks: string[] = [];
  const order = await getOrderById(input.orderId);
  if (!order || !isSimSubscriptionOrder(order)) {
    return { ok: false, result: "not_sim_subscription_order" };
  }

  const subscription =
    (await getSimSubscriptionByOrderId(order.id)) ??
    (input.preapprovalId
      ? await getSimSubscriptionByPreapprovalId(input.preapprovalId)
      : null);
  if (!subscription) {
    return { ok: false, result: "sim_subscription_not_found", orderId: order.id };
  }

  const status = input.paymentStatus.toLowerCase();
  if (status !== "approved") {
    return {
      ok: false,
      result: `payment_${status}`,
      orderId: order.id,
      subscriptionId: subscription.id,
      paymentId: input.paymentId,
    };
  }

  if (order.payment_status === "cancelled") {
    risks.push("order_cancelled");
    return {
      ok: false,
      result: "order_cancelled",
      orderId: order.id,
      subscriptionId: subscription.id,
      paymentId: input.paymentId,
      risks,
    };
  }

  const expectedFromSub = Math.round(Number(subscription.monthly_amount_clp));
  const expectedFromOrder = resolveExpectedChargeAmount(order);
  const expected = expectedFromSub > 0 ? expectedFromSub : expectedFromOrder;
  const paid = Math.round(Number(input.transactionAmount));

  if (expected > 0 && paid !== expected) {
    risks.push(`amount_mismatch:paid=${paid},expected=${expected}`);
    if (input.dryRun) {
      return {
        ok: false,
        result: "amount_mismatch",
        orderId: order.id,
        subscriptionId: subscription.id,
        paymentId: input.paymentId,
        risks,
      };
    }
    await patchOrderFields(order.id, {
      metadata: {
        ...(order.metadata ?? {}),
        reconciliation_amount_mismatch: { paid, expected, at: new Date().toISOString() },
      },
    });
    return {
      ok: false,
      result: "amount_mismatch",
      orderId: order.id,
      subscriptionId: subscription.id,
      paymentId: input.paymentId,
      risks,
    };
  }

  const activation = await getSimActivationByOrderId(order.id);
  if (
    order.payment_status === "paid" &&
    subscription.status === "active" &&
    activation?.activation_status === "active"
  ) {
    return {
      ok: true,
      result: "already_active",
      orderId: order.id,
      subscriptionId: subscription.id,
      paymentId: input.paymentId,
    };
  }

  if (input.dryRun) {
    const inventoryId =
      subscription.inventory_number_id ??
      (typeof order.metadata?.inventory_number_id === "string"
        ? order.metadata.inventory_number_id
        : null);
    return {
      ok: true,
      result: "dry_run_would_activate",
      orderId: order.id,
      subscriptionId: subscription.id,
      paymentId: input.paymentId,
      risks: inventoryId ? risks : [...risks, "no_inventory_reserved"],
    };
  }

  const paymentRecord: MercadoPagoPaymentRecord = {
    id: input.paymentId,
    status: "approved",
    transaction_amount: paid,
    currency_id: "CLP",
  };
  const metaPatch: Record<string, unknown> = {
    ...mergeMpMetadata(order, paymentRecord),
    activation_status: "paid_pending_activation",
    subscription_status: "authorized",
    sim_subscription_reconciliation_source: input.source,
    sim_subscription_reconciliation_at: new Date().toISOString(),
  };

  if (order.payment_status === "pending") {
    await markOrderPaid(order.id, null);
  }

  const orderMeta = order.metadata ?? {};
  const includesOutboundSms =
    orderMeta.includes_outbound_sms !== false &&
    Math.round(Number(order.sms_quantity) || 0) > 0;

  await patchOrderFields(order.id, {
    credit_status: includesOutboundSms ? "pending_claim" : "credited",
    metadata: metaPatch,
  });

  const refreshed = await getOrderById(order.id);
  if (!refreshed) {
    return { ok: false, result: "order_missing_after_patch", orderId: order.id };
  }

  const planId = String(
    refreshed.metadata?.sim_plan_id ?? refreshed.metadata?.plan_id ?? subscription.plan_id,
  );
  const plan = getSimPlan(planId);
  const inventoryNumberId =
    subscription.inventory_number_id ??
    (refreshed.metadata?.inventory_number_id != null
      ? String(refreshed.metadata.inventory_number_id)
      : null);

  let inventoryClaimable = false;
  if (inventoryNumberId) {
    const claim = await canOrderClaimInventoryOnPayment({
      orderId: order.id,
      inventoryNumberId,
    });
    inventoryClaimable = claim.claimable;
    if (!claim.claimable) {
      metaPatch.requires_manual_inventory_assignment = true;
      metaPatch.inventory_claim_blocked_reason = claim.reason ?? "unknown";
      await patchOrderFields(order.id, { metadata: metaPatch });
      risks.push(`inventory_claim_blocked:${claim.reason ?? "unknown"}`);
    }
  }

  if (plan) {
    await createSimActivationRequest({
      orderId: order.id,
      plan,
      checkoutEmail:
        refreshed.checkout_email ?? String(refreshed.metadata?.checkout_email ?? ""),
      payerName:
        typeof refreshed.metadata?.payer_name === "string"
          ? refreshed.metadata.payer_name
          : undefined,
      companyName:
        typeof refreshed.metadata?.company_name === "string"
          ? refreshed.metadata.company_name
          : undefined,
      phone:
        typeof refreshed.metadata?.phone === "string" ? refreshed.metadata.phone : undefined,
      taxId:
        typeof refreshed.metadata?.tax_id === "string" ? refreshed.metadata.tax_id : undefined,
      activationStatus: inventoryClaimable
        ? "paid_pending_activation"
        : "activation_review",
      inventoryNumberId:
        inventoryClaimable && inventoryNumberId ? inventoryNumberId : undefined,
    });

    if (inventoryNumberId && inventoryClaimable) {
      const activationRow = await getSimActivationByOrderId(order.id);
      await markNumberPaymentApproved({
        orderId: order.id,
        simActivationRequestId: activationRow?.id,
      });
      await linkSimActivationInventory(order.id, inventoryNumberId);
    }
  } else if (inventoryNumberId && inventoryClaimable) {
    await markNumberPaymentApproved({ orderId: order.id });
  }

  await markSimActivationPaidPending(order.id);

  const checkoutEmail =
    refreshed.checkout_email ?? String(refreshed.metadata?.checkout_email ?? "");

  await provisionCompanyFromCheckout({
    order: refreshed,
    checkoutEmail,
    payerName:
      typeof refreshed.metadata?.payer_name === "string"
        ? refreshed.metadata.payer_name
        : undefined,
    companyName:
      typeof refreshed.metadata?.company_name === "string"
        ? refreshed.metadata.company_name
        : undefined,
    phone:
      typeof refreshed.metadata?.phone === "string" ? refreshed.metadata.phone : undefined,
    taxId:
      typeof refreshed.metadata?.tax_id === "string" ? refreshed.metadata.tax_id : undefined,
    provisionSource: "sim_subscription_payment",
  });

  const afterProvision = await getOrderById(order.id);
  if (afterProvision?.company_id) {
    const bundledAgentId = plan
      ? getBundledAgentAddonForSimPlan(plan.plan_id)
      : String(afterProvision.metadata?.agent_addon_id ?? "agent_start");
    const addon = getAgentAddon(bundledAgentId);
    if (addon?.planCode) {
      await createAgentPlanRequestFromCheckout({
        companyId: afterProvision.company_id,
        orderId: order.id,
        planCode: addon.planCode,
        checkoutEmail,
      });
    }

    try {
      await syncSimSubscriptionAfterOrderFirstPayment(order.id, input.paymentId);
    } catch (err) {
      console.error("[sim-subscription-activation] month-1 credit failed", order.id, err);
      risks.push("month1_credit_failed");
    }
  }

  const postPay = await processSimPostPaymentActivation(order.id);

  let assignedNumber: string | null = null;
  const invId =
    subscription.inventory_number_id ??
    (typeof afterProvision?.metadata?.inventory_number_id === "string"
      ? afterProvision.metadata.inventory_number_id
      : null);
  if (invId) {
    const inv = await getInventoryById(invId);
    assignedNumber = inv?.e164_number ?? null;
  }

  try {
    await sendSimSubscriptionPaymentConfirmedEmails(order.id, {
      assignedNumber,
      preapprovalId:
        input.preapprovalId ??
        subscription.mercadopago_preapproval_id ??
        refreshed.payment_reference,
    });
  } catch (err) {
    console.error("[sim-subscription-activation] confirmation email failed", order.id, err);
    risks.push("confirmation_email_failed");
  }

  return {
    ok: true,
    result: postPay.autoActivated ? "activated" : postPay.reason ?? "paid_pending_activation",
    orderId: order.id,
    subscriptionId: subscription.id,
    paymentId: input.paymentId,
    risks: risks.length ? risks : undefined,
  };
}

export async function tryReconcileSimSubscriptionFirstPaymentFromPreapproval(
  preapprovalId: string,
): Promise<SimSubscriptionPaymentActivationResult | null> {
  const id = preapprovalId.trim();
  if (!id) return null;

  try {
    const pre = await getMercadoPagoPreapproval(id);
    const status = (pre.status ?? "").toLowerCase();
    if (!["authorized", "active"].includes(status)) {
      return { ok: false, result: `preapproval_${status || "unknown"}` };
    }
  } catch (err) {
    console.warn("[sim-subscription-activation] preapproval fetch failed", id, err);
  }

  const authorized = await searchMercadoPagoAuthorizedPaymentsByPreapproval(id);
  for (const row of authorized) {
    const paymentId = row.payment?.id;
    const paymentStatus = row.payment?.status ?? "";
    if (!paymentId) continue;
    if (paymentStatus !== "approved") continue;

    const payment = await getMercadoPagoPayment(String(paymentId));
    const orderId = payment.external_reference?.trim();
    if (!orderId) continue;

    const order = await getOrderById(orderId);
    if (!order || !isSimSubscriptionOrder(order)) continue;

    return applySimSubscriptionApprovedPayment({
      orderId,
      paymentId: String(paymentId),
      paymentStatus: "approved",
      transactionAmount: Number(payment.transaction_amount ?? 0),
      preapprovalId: id,
      source: "preapproval_reconcile",
    });
  }

  return null;
}

export async function processMercadoPagoAuthorizedPaymentWebhook(
  authorizedPaymentId: string,
): Promise<SimSubscriptionPaymentActivationResult> {
  const authPay = await getMercadoPagoAuthorizedPayment(authorizedPaymentId);
  const paymentId = authPay.payment?.id;
  const paymentStatus = authPay.payment?.status ?? "";

  if (!paymentId) {
    return { ok: true, result: "authorized_payment_no_payment_id" };
  }

  const payment = await getMercadoPagoPayment(String(paymentId));
  const orderId = payment.external_reference?.trim();
  if (!orderId) {
    return { ok: false, result: "no_external_reference" };
  }

  const order = await getOrderById(orderId);
  if (!order || !isSimSubscriptionOrder(order)) {
    return { ok: false, result: "not_sim_subscription_order" };
  }

  return applySimSubscriptionApprovedPayment({
    orderId,
    paymentId: String(paymentId),
    paymentStatus: paymentStatus || payment.status,
    transactionAmount: Number(payment.transaction_amount ?? 0),
    preapprovalId: authPay.preapproval_id ?? null,
    source: "authorized_payment_webhook",
  });
}

export async function inspectSimSubscriptionPaymentState(input: {
  orderId?: string | null;
  preapprovalId?: string | null;
  operationId?: string | null;
}): Promise<Record<string, unknown>> {
  const resolved = await resolveSimSubscriptionOrder(input);
  if (!resolved) {
    return { found: false };
  }
  const { order, subscription } = resolved;
  const activation = await getSimActivationByOrderId(order.id);
  let mpPayment: Record<string, unknown> | null = null;
  let mpPreapproval: Record<string, unknown> | null = null;

  if (input.operationId) {
    try {
      mpPayment = (await getMercadoPagoPayment(input.operationId)) as Record<string, unknown>;
    } catch {
      try {
        const ap = await getMercadoPagoAuthorizedPayment(input.operationId);
        mpPayment = ap.payment ? (ap.payment as Record<string, unknown>) : null;
        if (ap.preapproval_id) {
          mpPreapproval = (await getMercadoPagoPreapproval(
            ap.preapproval_id,
          )) as Record<string, unknown>;
        }
      } catch {
        // ignore
      }
    }
  }

  const preId =
    subscription.mercadopago_preapproval_id ??
    order.payment_reference ??
    input.preapprovalId ??
    null;
  if (preId && !mpPreapproval) {
    try {
      mpPreapproval = (await getMercadoPagoPreapproval(preId)) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  return {
    found: true,
    order_id: order.id,
    company_id: order.company_id,
    checkout_email: order.checkout_email,
    payment_status: order.payment_status,
    credit_status: order.credit_status,
    amount_clp: Number(order.amount),
    expected_charge_clp: resolveExpectedChargeAmount(order),
    preapproval_id: preId,
    subscription_status: subscription.status,
    activation_status: activation?.activation_status ?? null,
    inventory_number_id: subscription.inventory_number_id,
    client_number_id: subscription.client_number_id,
    mp_payment: mpPayment,
    mp_preapproval: mpPreapproval,
    panel_url: `${env.publicAppUrl.replace(/\/$/, "")}/app/numeraciones`,
  };
}
