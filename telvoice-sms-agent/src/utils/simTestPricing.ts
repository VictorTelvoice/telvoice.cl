import { env } from "../config/env.js";
import type { SimPlanDefinition } from "./simPlans.js";

export type SimCheckoutPricing = {
  totalAmount: number;
  originalTotalAmount: number;
  priceMetadata: Record<string, unknown>;
};

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function starterTestPriceEmails(): string[] {
  return env.simCheckout.starterTestPriceEmails.map((e) => e.trim().toLowerCase());
}

/** Precio backend para checkout SIM bundle (MercadoPago + orden). No altera landing público. */
export function resolveSimBundleCheckoutPricing(
  plan: SimPlanDefinition,
  checkoutEmail: string,
): SimCheckoutPricing {
  const originalTotalAmount = plan.total_amount;
  const email = normalizedEmail(checkoutEmail);
  const testPrice = env.simCheckout.starterTestPriceClp;
  const allowedEmails = starterTestPriceEmails();

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
