import { ValidationError } from "./errors.js";

export const PUBLIC_SMS_ONLINE_MIN_QUANTITY = 1000;

export const PUBLIC_SMS_QUANTITY_ERROR =
  "La compra online permite bolsas desde 1.000 SMS.";

/** Cantidades permitidas en checkout público por sms_quantity. */
export function isAllowedPublicSmsCheckoutQuantity(quantity: number): boolean {
  if (!Number.isFinite(quantity)) return false;
  return Math.round(quantity) >= PUBLIC_SMS_ONLINE_MIN_QUANTITY;
}

export function assertAllowedPublicSmsCheckoutQuantity(quantity: number): number {
  const q = Math.round(quantity);
  if (!isAllowedPublicSmsCheckoutQuantity(q)) {
    throw new ValidationError(PUBLIC_SMS_QUANTITY_ERROR);
  }
  return q;
}
