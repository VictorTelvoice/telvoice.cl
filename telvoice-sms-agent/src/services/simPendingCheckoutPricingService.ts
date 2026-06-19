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
  priceMetadata?: Record<string, unknown>;
};

export type SimResolvedPricingApi = {
  plan_id: string;
  billing_cycle: SimBillingCycle;
  transaction_amount_clp: number;
  regular_monthly_price_clp?: number;
  promo_enabled?: boolean;
  promo_source?: string;
  promo_discount_percent?: number;
  promo_duration_months?: number;
  promo_monthly_price_clp?: number;
  post_promo_monthly_price_clp?: number;
  annual_price_clp?: number;
  charge_amount_clp?: number;
};

function metaNumber(meta: Record<string, unknown>, key: string): number | null {
  const raw = meta[key];
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  return Math.round(Number(raw));
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const raw = meta[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function metaBool(meta: Record<string, unknown>, key: string): boolean | null {
  if (meta[key] === true) return true;
  if (meta[key] === false) return false;
  return null;
}

export function formatResolvedPricingForApi(
  planId: string,
  billingCycle: SimBillingCycle,
  pricing: SimCheckoutPricing,
): SimResolvedPricingApi {
  const meta = pricing.priceMetadata;
  return {
    plan_id: planId,
    billing_cycle: billingCycle,
    transaction_amount_clp: pricing.totalAmount,
    charge_amount_clp: pricing.totalAmount,
    regular_monthly_price_clp:
      metaNumber(meta, "regular_monthly_price_clp") ?? pricing.originalTotalAmount,
    promo_enabled: metaBool(meta, "promo_enabled") ?? undefined,
    promo_source: metaString(meta, "promo_source") ?? undefined,
    promo_discount_percent: metaNumber(meta, "promo_discount_percent") ?? undefined,
    promo_duration_months: metaNumber(meta, "promo_duration_months") ?? undefined,
    promo_monthly_price_clp: metaNumber(meta, "promo_monthly_price_clp") ?? undefined,
    post_promo_monthly_price_clp:
      metaNumber(meta, "post_promo_monthly_price_clp") ?? undefined,
    annual_price_clp: metaNumber(meta, "annual_price_clp") ?? undefined,
  };
}

export async function resolveSimCheckoutPricingApi(
  context: SimPendingPricingContext,
): Promise<SimResolvedPricingApi | null> {
  const pricing = await computeSimCheckoutPricingForContext(context);
  if (!pricing) return null;
  return formatResolvedPricingForApi(context.planId, context.billingCycle, pricing);
}

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

  const expectedMeta = expected.priceMetadata ?? {};
  const expectedTxn = metaNumber(expectedMeta, "transaction_amount_clp");
  if (expectedTxn != null && expectedTxn !== expected.totalAmount) return true;
  if (expectedTxn != null && chargeAmount !== expectedTxn) return true;

  const compareKeys = [
    "promo_source",
    "promo_discount_percent",
    "promo_duration_months",
    "promo_monthly_price_clp",
    "regular_monthly_price_clp",
    "annual_price_clp",
  ] as const;

  for (const key of compareKeys) {
    if (expectedMeta[key] == null) continue;
    if (key === "promo_source") {
      const expectedSource = metaString(expectedMeta, key);
      const orderSource = metaString(meta, key);
      if (expectedSource && orderSource && expectedSource !== orderSource) return true;
      continue;
    }
    const expectedNum = metaNumber(expectedMeta, key);
    const orderNum = metaNumber(meta, key);
    if (expectedNum != null && orderNum != null && expectedNum !== orderNum) return true;
  }

  const expectedPromoEnabled = metaBool(expectedMeta, "promo_enabled");
  const orderPromoEnabled = metaBool(meta, "promo_enabled");
  if (
    expectedPromoEnabled != null &&
    orderPromoEnabled != null &&
    expectedPromoEnabled !== orderPromoEnabled
  ) {
    return true;
  }

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
