import { getSupabase } from "../database/supabaseClient.js";
import { AppError } from "../utils/errors.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import type {
  SimSubscriptionRow,
  SimSubscriptionStatus,
} from "../types/sim-subscription.js";
import type { SmsOrderRow } from "../types/wallet.js";
import type { SimPlanDefinition } from "../utils/simPlans.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import { insertWalletTransaction } from "./walletTransactionService.js";
import { getOrderById } from "./smsOrderService.js";

const DEFAULT_COUNTRY = "CL";

export function subscriptionCreditIdempotencyKey(
  preapprovalId: string,
  paymentId: string,
): string {
  return `subscription-credit:${preapprovalId.trim()}:${paymentId.trim()}`;
}

function addMonthsUtc(date: Date, months = 1): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export async function createPendingSimSubscription(input: {
  order: SmsOrderRow;
  plan: SimPlanDefinition;
  checkoutEmail: string;
  inventoryNumberId?: string | null;
  monthlyAmount: number;
  metadata?: Record<string, unknown>;
}): Promise<SimSubscriptionRow> {
  const sb = getSupabase();
  const baseMetadata = {
    source: "landing_sim_checkout",
    product_type: "sim_subscription",
    public_checkout_reference: input.order.public_checkout_reference ?? null,
    ...(input.metadata ?? {}),
  };
  const row = {
    order_id: input.order.id,
    company_id: input.order.company_id,
    checkout_email: input.checkoutEmail.trim().toLowerCase(),
    inventory_number_id: input.inventoryNumberId ?? null,
    plan_id: input.plan.plan_id,
    included_sms_monthly: input.plan.sms_quantity,
    monthly_amount_clp: Math.round(input.monthlyAmount),
    currency: input.plan.currency,
    status: "pending" as const,
    metadata: baseMetadata,
  };

  const { data, error } = await sb
    .from("sim_subscriptions")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createPendingSimSubscription");
  }

  return data as SimSubscriptionRow;
}

export async function getSimSubscriptionByOrderId(
  orderId: string,
): Promise<SimSubscriptionRow | null> {
  const { data, error } = await getSupabase()
    .from("sim_subscriptions")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    wrapSupabaseError(error, "getSimSubscriptionByOrderId");
  }
  return (data as SimSubscriptionRow) ?? null;
}

export async function getSimSubscriptionByPreapprovalId(
  preapprovalId: string,
): Promise<SimSubscriptionRow | null> {
  const id = preapprovalId.trim();
  if (!id) return null;

  const { data, error } = await getSupabase()
    .from("sim_subscriptions")
    .select("*")
    .eq("mercadopago_preapproval_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    wrapSupabaseError(error, "getSimSubscriptionByPreapprovalId");
  }
  return (data as SimSubscriptionRow) ?? null;
}

export async function attachPreapprovalToSimSubscription(input: {
  subscriptionId: string;
  preapprovalId: string;
}): Promise<SimSubscriptionRow | null> {
  const { data, error } = await getSupabase()
    .from("sim_subscriptions")
    .update({
      mercadopago_preapproval_id: input.preapprovalId.trim(),
    })
    .eq("id", input.subscriptionId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "attachPreapprovalToSimSubscription");
  }
  return (data as SimSubscriptionRow) ?? null;
}

export async function updateSimSubscriptionStatus(input: {
  subscriptionId: string;
  status: SimSubscriptionStatus;
  patch?: Partial<
    Pick<
      SimSubscriptionRow,
      | "company_id"
      | "client_number_id"
      | "inventory_number_id"
      | "current_period_start"
      | "current_period_end"
      | "next_billing_date"
      | "last_payment_id"
      | "last_credit_at"
      | "activated_at"
      | "cancelled_at"
    >
  >;
  metadata?: Record<string, unknown>;
}): Promise<SimSubscriptionRow | null> {
  const current = await getSupabase()
    .from("sim_subscriptions")
    .select("metadata")
    .eq("id", input.subscriptionId)
    .maybeSingle();

  const meta = {
    ...((current.data as { metadata?: Record<string, unknown> } | null)?.metadata ??
      {}),
    ...(input.metadata ?? {}),
  };

  const { data, error } = await getSupabase()
    .from("sim_subscriptions")
    .update({
      status: input.status,
      ...(input.patch ?? {}),
      metadata: meta,
    })
    .eq("id", input.subscriptionId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateSimSubscriptionStatus");
  }
  return (data as SimSubscriptionRow) ?? null;
}

export async function applySimSubscriptionPreapprovalWebhook(input: {
  subscription: SimSubscriptionRow;
  preapprovalStatus: string;
  preapprovalId?: string | null;
}): Promise<SimSubscriptionRow | null> {
  const status = input.preapprovalStatus.toLowerCase();
  const now = new Date().toISOString();

  if (status === "authorized") {
    return updateSimSubscriptionStatus({
      subscriptionId: input.subscription.id,
      status: "authorized",
      metadata: {
        mercadopago_preapproval_webhook_at: now,
        mercadopago_preapproval_id: input.preapprovalId ?? undefined,
      },
    });
  }

  if (status === "paused") {
    return updateSimSubscriptionStatus({
      subscriptionId: input.subscription.id,
      status: "paused",
      metadata: { mercadopago_preapproval_webhook_at: now },
    });
  }

  if (status === "cancelled") {
    return updateSimSubscriptionStatus({
      subscriptionId: input.subscription.id,
      status: "cancelled",
      patch: { cancelled_at: now },
      metadata: {
        mercadopago_preapproval_webhook_at: now,
        cancel_reason: "mp_preapproval_cancelled",
      },
    });
  }

  return updateSimSubscriptionStatus({
    subscriptionId: input.subscription.id,
    status: input.subscription.status,
    metadata: { mercadopago_preapproval_webhook_at: now },
  });
}

export async function hasSubscriptionCreditForPayment(
  preapprovalId: string,
  paymentId: string,
): Promise<boolean> {
  const key = subscriptionCreditIdempotencyKey(preapprovalId, paymentId);
  const { data, error } = await getSupabase()
    .from("wallet_transactions")
    .select("id")
    .filter("metadata->>idempotency_key", "eq", key)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return false;
    wrapSupabaseError(error, "hasSubscriptionCreditForPayment");
  }
  return Boolean(data);
}

export async function creditSimSubscriptionMonthlySms(input: {
  subscription: SimSubscriptionRow;
  paymentId: string;
  preapprovalId: string;
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  isFirstPeriod?: boolean;
}): Promise<{ credited: boolean; alreadyCredited: boolean; smsAmount: number }> {
  const smsAmount = Math.round(Number(input.subscription.included_sms_monthly));
  if (smsAmount <= 0) {
    return { credited: false, alreadyCredited: false, smsAmount: 0 };
  }

  const idempotencyKey = subscriptionCreditIdempotencyKey(
    input.preapprovalId,
    input.paymentId,
  );

  if (await hasSubscriptionCreditForPayment(input.preapprovalId, input.paymentId)) {
    return { credited: false, alreadyCredited: true, smsAmount };
  }

  const wallet = await getOrCreateCompanyWallet(input.companyId, DEFAULT_COUNTRY);
  const before = wallet.available_sms;
  const after = before + smsAmount;

  const { error: walletErr } = await getSupabase()
    .from("company_sms_wallets")
    .update({
      available_sms: after,
      total_purchased_sms: wallet.total_purchased_sms + smsAmount,
    })
    .eq("id", wallet.id);

  if (walletErr) {
    wrapSupabaseError(walletErr, "creditSimSubscriptionMonthlySms.wallet");
  }

  await insertWalletTransaction({
    companyId: input.companyId,
    walletId: wallet.id,
    type: "purchase_credit",
    smsAmount,
    balanceBefore: before,
    balanceAfter: after,
    referenceType: "sim_subscription",
    referenceId: input.subscription.id,
    description: input.isFirstPeriod
      ? "SMS incluidos — primer mes suscripción numeración SIM"
      : "SMS incluidos — renovación mensual suscripción numeración SIM",
    metadata: {
      idempotency_key: idempotencyKey,
      mercadopago_payment_id: input.paymentId,
      mercadopago_preapproval_id: input.preapprovalId,
      sim_subscription_id: input.subscription.id,
      order_id: input.subscription.order_id,
      plan_id: input.subscription.plan_id,
      period_start: input.periodStart.toISOString(),
      period_end: input.periodEnd.toISOString(),
      source: "sim_subscription_recurring",
    },
  });

  return { credited: true, alreadyCredited: false, smsAmount };
}

export async function markSimSubscriptionActiveAfterFirstPayment(input: {
  subscription: SimSubscriptionRow;
  paymentId: string;
  companyId: string;
  clientNumberId?: string | null;
}): Promise<SimSubscriptionRow | null> {
  const now = new Date();
  const periodEnd = addMonthsUtc(now, 1);

  return updateSimSubscriptionStatus({
    subscriptionId: input.subscription.id,
    status: "active",
    patch: {
      company_id: input.companyId,
      client_number_id: input.clientNumberId ?? input.subscription.client_number_id,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_billing_date: periodEnd.toISOString(),
      last_payment_id: input.paymentId,
      last_credit_at: now.toISOString(),
      activated_at: input.subscription.activated_at ?? now.toISOString(),
    },
    metadata: {
      first_payment_processed_at: now.toISOString(),
    },
  });
}

export async function advanceSimSubscriptionBillingPeriod(input: {
  subscription: SimSubscriptionRow;
  paymentId: string;
}): Promise<SimSubscriptionRow | null> {
  const now = new Date();
  const periodEnd = addMonthsUtc(now, 1);

  return updateSimSubscriptionStatus({
    subscriptionId: input.subscription.id,
    status: "active",
    patch: {
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_billing_date: periodEnd.toISOString(),
      last_payment_id: input.paymentId,
      last_credit_at: now.toISOString(),
    },
    metadata: {
      last_recurring_payment_at: now.toISOString(),
    },
  });
}

export type SimSubscriptionPaymentProcessResult = {
  handled: boolean;
  result: string;
  orderId?: string;
  subscriptionId?: string;
};

export async function processSimSubscriptionMercadoPagoPayment(input: {
  paymentId: string;
  paymentStatus: string;
  transactionAmount: number;
  preapprovalId: string;
  externalReference?: string | null;
}): Promise<SimSubscriptionPaymentProcessResult> {
  let subscription = await getSimSubscriptionByPreapprovalId(input.preapprovalId);

  if (!subscription && input.externalReference) {
    subscription = await getSimSubscriptionByOrderId(input.externalReference.trim());
  }

  if (!subscription) {
    return { handled: false, result: "sim_subscription_not_found" };
  }

  const order = await getOrderById(subscription.order_id);
  if (!order) {
    return { handled: true, result: "order_missing", subscriptionId: subscription.id };
  }

  if (input.paymentStatus !== "approved") {
    if (["rejected", "cancelled"].includes(input.paymentStatus)) {
      await updateSimSubscriptionStatus({
        subscriptionId: subscription.id,
        status: "failed",
        metadata: {
          last_failed_payment_id: input.paymentId,
          last_failed_payment_status: input.paymentStatus,
        },
      });
    }
    return {
      handled: true,
      result: `payment_${input.paymentStatus}`,
      orderId: order.id,
      subscriptionId: subscription.id,
    };
  }

  const expected = Math.round(Number(subscription.monthly_amount_clp));
  const paid = Math.round(Number(input.transactionAmount));
  if (paid !== expected) {
    return {
      handled: true,
      result: "amount_mismatch",
      orderId: order.id,
      subscriptionId: subscription.id,
    };
  }

  const isFirstPayment =
    subscription.status === "pending" ||
    subscription.status === "authorized" ||
    order.payment_status !== "paid";

  if (isFirstPayment) {
    return {
      handled: false,
      result: "delegate_first_payment_to_order_webhook",
      orderId: order.id,
      subscriptionId: subscription.id,
    };
  }

  if (subscription.status !== "active") {
    return {
      handled: true,
      result: `subscription_not_active:${subscription.status}`,
      orderId: order.id,
      subscriptionId: subscription.id,
    };
  }

  const companyId = subscription.company_id ?? order.company_id;
  if (!companyId) {
    return {
      handled: true,
      result: "no_company_for_recurring_credit",
      orderId: order.id,
      subscriptionId: subscription.id,
    };
  }

  const periodStart = new Date();
  const periodEnd = addMonthsUtc(periodStart, 1);
  const credit = await creditSimSubscriptionMonthlySms({
    subscription,
    paymentId: input.paymentId,
    preapprovalId: input.preapprovalId,
    companyId,
    periodStart,
    periodEnd,
    isFirstPeriod: false,
  });

  await advanceSimSubscriptionBillingPeriod({
    subscription,
    paymentId: input.paymentId,
  });

  return {
    handled: true,
    result: credit.alreadyCredited
      ? "recurring_credit_already_processed"
      : credit.credited
        ? "recurring_credit_applied"
        : "recurring_credit_skipped",
    orderId: order.id,
    subscriptionId: subscription.id,
  };
}

export async function syncSimSubscriptionAfterOrderFirstPayment(
  orderId: string,
  paymentId: string,
): Promise<void> {
  const subscription = await getSimSubscriptionByOrderId(orderId);
  if (!subscription) return;

  const order = await getOrderById(orderId);
  if (!order?.company_id) return;

  const preapprovalId =
    subscription.mercadopago_preapproval_id ??
    (typeof order.metadata?.mercadopago_preapproval_id === "string"
      ? order.metadata.mercadopago_preapproval_id
      : order.payment_reference ?? "");

  if (!preapprovalId) {
    throw new AppError(
      "Suscripción SIM sin preapproval_id para acreditar mes 1.",
      500,
      "SIM_SUBSCRIPTION_NO_PREAPPROVAL",
    );
  }

  const periodStart = new Date();
  const periodEnd = addMonthsUtc(periodStart, 1);

  await creditSimSubscriptionMonthlySms({
    subscription,
    paymentId,
    preapprovalId,
    companyId: order.company_id,
    periodStart,
    periodEnd,
    isFirstPeriod: true,
  });

  const clientNumberId =
    typeof order.metadata?.client_number_id === "string"
      ? order.metadata.client_number_id
      : null;

  await markSimSubscriptionActiveAfterFirstPayment({
    subscription,
    paymentId,
    companyId: order.company_id,
    clientNumberId,
  });
}
