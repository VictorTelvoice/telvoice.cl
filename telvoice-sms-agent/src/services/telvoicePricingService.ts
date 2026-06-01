import type { CommercialQuoteResult } from "../types/commercial.js";
import { formatClp, HIGH_VOLUME_SMS_THRESHOLD } from "../utils/clp-format.js";
import {
  normalizeQuoteQuantity,
  getUnitPriceForQuantity,
  SMS_QUANTITY_STEP,
  SMS_MIN_QUANTITY,
} from "./smsPricingTierService.js";
import { createQuickQuote, quoteSmsQuantity } from "./commercialQuoteService.js";

export { SMS_QUANTITY_STEP, SMS_MIN_QUANTITY, HIGH_VOLUME_SMS_THRESHOLD };

export function formatCurrencyClp(amount: number): string {
  return formatClp(amount);
}

export function roundSmsQuantityToThousand(quantity: number): number {
  return normalizeQuoteQuantity(quantity).normalized_quantity;
}

export function normalizeSmsQuantity(quantity: number): ReturnType<typeof normalizeQuoteQuantity> {
  return normalizeQuoteQuantity(quantity);
}

/** Compras online automáticas solo hasta 120.000 SMS (calculadora Telvoice.cl). */
export function isManualQuoteRequired(quantity: number): boolean {
  const requested = Math.max(1, Math.floor(quantity));
  if (requested > HIGH_VOLUME_SMS_THRESHOLD) {
    return true;
  }
  const normalized = normalizeQuoteQuantity(requested).normalized_quantity;
  return normalized > HIGH_VOLUME_SMS_THRESHOLD;
}

export function recommendBagQuantityForShortfall(shortfall: number): number {
  const missing = Math.max(1, Math.ceil(shortfall));
  return Math.max(SMS_MIN_QUANTITY, Math.ceil(missing / SMS_QUANTITY_STEP) * SMS_QUANTITY_STEP);
}

export async function getSmsUnitPrice(
  quantity: number,
  countryCode = "CL",
): Promise<Awaited<ReturnType<typeof getUnitPriceForQuantity>>> {
  return getUnitPriceForQuantity(quantity, countryCode);
}

export async function calculateTelvoiceQuote(
  quantity: number,
  countryCode = "CL",
): Promise<CommercialQuoteResult> {
  return quoteSmsQuantity(quantity, countryCode);
}

export async function calculateTelvoiceQuoteSync(
  quantity: number,
  countryCode = "CL",
): Promise<CommercialQuoteResult> {
  return createQuickQuote(quantity, countryCode);
}
