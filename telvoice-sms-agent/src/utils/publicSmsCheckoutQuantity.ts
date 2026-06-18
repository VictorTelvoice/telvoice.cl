import { ValidationError } from "./errors.js";

export const MINI_SMS_BAG_QUANTITY = 200;
export const MINI_SMS_BAG_TOTAL_CLP = 1000;
export const MINI_SMS_BAG_SUBTOTAL_NET = 840;
export const MINI_SMS_BAG_TAX_CLP = 160;
export const MINI_SMS_BAG_UNIT_PRICE_NET = 4.2;
export const MINI_SMS_BAG_LABEL = "Bolsa 200 SMS";

export const PUBLIC_SMS_ONLINE_MIN_STANDARD = 1000;

export const PUBLIC_SMS_QUANTITY_ERROR =
  "La compra online permite la bolsa mini de 200 SMS o bolsas desde 1.000 SMS.";

export function isMiniSmsBagQuantity(quantity: number): boolean {
  return Number.isFinite(quantity) && Math.round(quantity) === MINI_SMS_BAG_QUANTITY;
}

/** Cantidades permitidas en checkout público por sms_quantity. */
export function isAllowedPublicSmsCheckoutQuantity(quantity: number): boolean {
  if (!Number.isFinite(quantity)) return false;
  const q = Math.round(quantity);
  if (isMiniSmsBagQuantity(q)) return true;
  return q >= PUBLIC_SMS_ONLINE_MIN_STANDARD;
}

export function assertAllowedPublicSmsCheckoutQuantity(quantity: number): number {
  const q = Math.round(quantity);
  if (!isAllowedPublicSmsCheckoutQuantity(q)) {
    throw new ValidationError(PUBLIC_SMS_QUANTITY_ERROR);
  }
  return q;
}
