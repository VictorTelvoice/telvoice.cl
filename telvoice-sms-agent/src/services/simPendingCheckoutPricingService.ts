import type { SmsOrderRow } from "../types/wallet.js";
import { getOrderById, patchOrderFields } from "./smsOrderService.js";
import {
  buildSimPlanDefinitionFromSettings,
  calculatePlanIntroPromo,
  calculateSimPlanPrice,
  getSimPlanById,
  type SimBillingCycle,
} from "./simPlanSettingsService.js";
import { isSimPlanId } from "../utils/simPlans.js";
import {
  inventorySuffixFromE164,
  resolveSimSubscriptionCheckoutPricing,
  type SimCheckoutPricing,
} from "../utils/simTestPricing.js";
import { releaseReservationForOrder } from "./realNumberInventoryService.js";
import { updateSimSubscriptionStatus } from "./simSubscriptionService.js";
import { getInventoryById } from "./realNumberInventoryService.js";

export type SimPendingPricingContext = {
  planId: string;
  billingCycle: SimBillingCycle;
  checkoutEmail: string;
  inventorySuffix?: string;
};

export type SimPendingPricingExpectation = {
  planId: string;
  billingCycle: SimBillingCycle;
  totalAmount: number;
};

export async function computeSimCheckoutPricingForContext(
  context: SimPendingPricingContext,
): Promise<SimCheckoutPricing | null> {
  if (!isSimPlanId(context.planId)) return null;

  const planSettings = await getSimPlanById(context.planId);
  if (!planSettings || planSettings.plan_id === "custom") return null;

  const plan = buildSimPlanDefinitionFromSettings(planSettings);
  if (!plan) return null;

  const configuredPricing = calculateSimPlanPrice(planSettings, context.billingCycle);
  const introPromo =
    context.billingCycle === "monthly"
      ? calculatePlanIntroPromo(planSettings)
      : null;

  return resolveSimSubscriptionCheckoutPricing(
    plan,
    context.checkoutEmail,
    context.inventorySuffix ?? "",
    {
      billingCycle: context.billingCycle,
      configuredMonthlyClp: configuredPricing.monthly_price_clp,
      annualDiscountPercent: configuredPricing.annual_discount_percent,
      planIntroPromo: introPromo?.hasIntroPromo ? introPromo : undefined,
    },
  );
}

export function isSimPendingOrderPricingStale(
  order: SmsOrderRow,
  expected: SimPendingPricingExpectation,
): boolean {
  const meta = order.metadata ?? {};
  const orderPlanId =
    typeof meta.plan_id === "string" ? meta.plan_id.trim() : "";
  const orderBilling: SimBillingCycle =
    meta.billing_cycle === "annual" ? "annual" : "monthly";
  const orderAmount = Math.round(Number(order.amount));
  const chargeMeta = meta.charge_amount_clp;
  const chargeAmount =
    chargeMeta != null && Number.isFinite(Number(chargeMeta))
      ? Math.round(Number(chargeMeta))
      : orderAmount;

  if (orderPlanId && orderPlanId !== expected.planId) return true;
  if (orderBilling !== expected.billingCycle) return true;
  if (orderAmount !== expected.totalAmount) return true;
  if (chargeAmount !== expected.totalAmount) return true;
  return false;
}

export async function supersedeSimPendingCheckoutOrder(
  orderId: string,
  reason: string,
): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order || order.payment_status !== "pending") return;

  await releaseReservationForOrder(orderId).catch(() => undefined);

  const simSubscriptionId =
    typeof order.metadata?.sim_subscription_id === "string"
      ? order.metadata.sim_subscription_id
      : null;
  if (simSubscriptionId) {
    await updateSimSubscriptionStatus({
      subscriptionId: simSubscriptionId,
      status: "cancelled",
      patch: { cancelled_at: new Date().toISOString() },
      metadata: { checkout_cancel_reason: reason },
    }).catch(() => undefined);
  }

  await patchOrderFields(orderId, {
    payment_status: "cancelled",
    metadata: {
      ...(order.metadata ?? {}),
      checkout_cancel_reason: reason,
      stale_checkout_superseded_at: new Date().toISOString(),
    },
  });
}

export async function resolveSimPendingCheckoutBeforeStart(input: {
  pendingOrderId?: string;
  reservationExpired?: boolean;
  paymentUrl?: string;
  expected: SimPendingPricingExpectation;
}): Promise<{ reuseExisting: false } | { reuseExisting: true; paymentUrl: string; orderId: string }> {
  if (!input.pendingOrderId) {
    return { reuseExisting: false };
  }

  const order = await getOrderById(input.pendingOrderId);
  if (!order || order.payment_status !== "pending") {
    return { reuseExisting: false };
  }

  const stale = isSimPendingOrderPricingStale(order, input.expected);
  if (stale || input.reservationExpired || !input.paymentUrl) {
    await supersedeSimPendingCheckoutOrder(
      input.pendingOrderId,
      stale ? "pricing_mismatch" : "reservation_expired_or_no_payment_url",
    );
    return { reuseExisting: false };
  }

  return {
    reuseExisting: true,
    paymentUrl: input.paymentUrl,
    orderId: input.pendingOrderId,
  };
}

export async function inventorySuffixForPendingOrder(
  order: SmsOrderRow,
): Promise<string> {
  const meta = order.metadata ?? {};
  const inventoryId =
    typeof meta.inventory_number_id === "string" ? meta.inventory_number_id : "";
  if (!inventoryId) return "";
  const row = await getInventoryById(inventoryId);
  return row ? inventorySuffixFromE164(row.e164_number) : "";
}
