import { env } from "../config/env.js";
import type { SimBillingCycle } from "../services/simPlanSettingsService.js";
import type { SimPlanDefinition } from "./simPlans.js";

export type SimCheckoutPricing = {
  totalAmount: number;
  originalTotalAmount: number;
  priceMetadata: Record<string, unknown>;
};

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Precio backend para checkout SIM bundle (MercadoPago + orden). No altera landing público. */
export function resolveSimBundleCheckoutPricing(
  plan: SimPlanDefinition,
  checkoutEmail: string,
): SimCheckoutPricing {
  const originalTotalAmount = plan.total_amount;
  const email = normalizedEmail(checkoutEmail);
  const testPrice = env.simCheckout.starterTestPriceClp;
  const allowedEmails = env.simCheckout.starterTestPriceEmails;

  if (
    plan.plan_id === "sim_starter" &&
    testPrice != null &&
    testPrice > 0 &&
    allowedEmails.length > 0 &&
    allowedEmails.includes(email)
  ) {
    return {
      totalAmount: testPrice,
      originalTotalAmount,
      priceMetadata: {
        test_price_override: true,
        original_unit_price_clp: originalTotalAmount,
        applied_unit_price_clp: testPrice,
        test_price_reason: "controlled_sim_starter_purchase",
      },
    };
  }

  return {
    totalAmount: originalTotalAmount,
    originalTotalAmount,
    priceMetadata: {},
  };
}

function inventorySuffixFromE164(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return digits.slice(-3);
}

/**
 * Precio mensual suscripción SIM (preapproval). Solo allowlist + sufijo autorizado.
 * No acepta monto del cliente; no altera precio público del landing.
 */
export function resolveSimSubscriptionCheckoutPricing(
  plan: SimPlanDefinition,
  checkoutEmail: string,
  inventorySuffix: string,
  options?: {
    billingCycle?: SimBillingCycle;
    configuredMonthlyClp?: number;
    annualDiscountPercent?: number;
  },
): SimCheckoutPricing {
  const billingCycle = options?.billingCycle ?? "monthly";
  const baseMonthly = options?.configuredMonthlyClp ?? plan.total_amount;
  const discount = options?.annualDiscountPercent ?? 20;

  if (billingCycle === "annual") {
    const annualPrice = Math.round(baseMonthly * 12 * (1 - discount / 100));
    return {
      totalAmount: annualPrice,
      originalTotalAmount: Math.round(baseMonthly * 12),
      priceMetadata: {
        product_type: "sim_subscription",
        billing_cycle: "annual",
        monthly_price_clp: baseMonthly,
        annual_discount_percent: discount,
        annual_price_clp: annualPrice,
      },
    };
  }

  const planForPromo: SimPlanDefinition = {
    ...plan,
    total_amount: baseMonthly,
  };

  const promo50 = resolveStarterPromo50Pricing(planForPromo, checkoutEmail);
  if (promo50) return promo50;

  const cfg = env.simSubscriptionQaReal;
  const suffix = inventorySuffix.slice(-3);
  const email = normalizedEmail(checkoutEmail);
  const originalTotalAmount = baseMonthly;

  if (
    !cfg.enabled ||
    plan.plan_id !== "sim_starter" ||
    cfg.emails.length === 0 ||
    cfg.allowedSuffixes.length === 0
  ) {
    return {
      totalAmount: originalTotalAmount,
      originalTotalAmount,
      priceMetadata: {
        product_type: "sim_subscription",
        billing_cycle: "monthly",
        monthly_price_clp: baseMonthly,
      },
    };
  }

  if (!cfg.emails.includes(email) || !cfg.allowedSuffixes.includes(suffix)) {
    return {
      totalAmount: originalTotalAmount,
      originalTotalAmount,
      priceMetadata: {
        product_type: "sim_subscription",
        billing_cycle: "monthly",
        monthly_price_clp: baseMonthly,
      },
    };
  }

  const monthly = cfg.monthlyAmountClp;
  if (monthly == null || monthly <= 0) {
    return {
      totalAmount: originalTotalAmount,
      originalTotalAmount,
      priceMetadata: {
        product_type: "sim_subscription",
        billing_cycle: "monthly",
        monthly_price_clp: baseMonthly,
      },
    };
  }

  return {
    totalAmount: monthly,
    originalTotalAmount,
    priceMetadata: {
      product_type: "sim_subscription",
      billing_cycle: "monthly",
      monthly_price_clp: baseMonthly,
      sim_subscription_qa_real_override: true,
      original_monthly_clp: originalTotalAmount,
      applied_monthly_clp: monthly,
      qa_real_allowed_suffix: suffix,
      qa_real_reason: "controlled_sim_subscription_real",
    },
  };
}

function resolveStarterPromo50Pricing(
  plan: SimPlanDefinition,
  checkoutEmail: string,
): SimCheckoutPricing | null {
  const cfg = env.simStarterPromo50;
  if (!cfg.enabled || plan.plan_id !== "sim_starter" || cfg.emails.length === 0) {
    return null;
  }

  const email = normalizedEmail(checkoutEmail);
  if (!cfg.emails.includes(email)) {
    return null;
  }

  const monthly = cfg.monthlyAmountClp;
  if (monthly == null || monthly <= 0 || monthly >= plan.total_amount) {
    return null;
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setMonth(expiresAt.getMonth() + cfg.durationMonths);

  return {
    totalAmount: monthly,
    originalTotalAmount: plan.total_amount,
    priceMetadata: {
      product_type: "sim_subscription",
      starter_promo_50_6m: true,
      promo_original_monthly_clp: plan.total_amount,
      promo_applied_monthly_clp: monthly,
      promo_discount_percent: 50,
      promo_duration_months: cfg.durationMonths,
      promo_started_at: startedAt.toISOString(),
      promo_expires_at: expiresAt.toISOString(),
      promo_reason: "client_panel_starter_50_6m",
    },
  };
}

export { inventorySuffixFromE164 };
