/**
 * Tramos oficiales Telvoice.cl — calculadora y agente comercial web.
 */

export const IVA_RATE = 0.19;
export const SMS_MIN_QUANTITY = 1000;
export const SMS_QUANTITY_STEP = 1000;
export const CALC_MAX_VOLUME = 120000;

/** Rangos inclusivos para precio unitario por SMS. */
export const VOLUME_TIER_RANGES = [
  { min: 1000, max: 4000, unitPrice: 10, label: "1.000 a 4.000 SMS", tierApplied: "desde 1.000 SMS" },
  { min: 5000, max: 9000, unitPrice: 9, label: "5.000 a 9.000 SMS", tierApplied: "desde 5.000 SMS" },
  { min: 10000, max: 14000, unitPrice: 8, label: "10.000 a 14.000 SMS", tierApplied: "desde 10.000 SMS" },
  { min: 15000, max: 49000, unitPrice: 7, label: "15.000 a 49.000 SMS", tierApplied: "desde 15.000 SMS" },
  { min: 50000, max: 99000, unitPrice: 6, label: "50.000 a 99.000 SMS", tierApplied: "desde 50.000 SMS" },
  {
    min: 100000,
    max: Number.MAX_SAFE_INTEGER,
    unitPrice: 5,
    label: "100.000 SMS o más",
    tierApplied: "desde 100.000 SMS",
  },
];

/**
 * @param {number} requested
 * @param {{ applyCalcMaxCap?: boolean }} [options]
 *   applyCalcMaxCap: true solo para la calculadora del landing (máx. 120.000).
 */
export function normalizeSmsQuantity(requested, options = {}) {
  const applyCalcMaxCap = options.applyCalcMaxCap !== false;
  const requested_quantity = Math.max(1, Math.floor(Number(requested)));
  let normalized_quantity = requested_quantity;
  let was_rounded = false;
  let rounded_to_minimum = false;
  let rounded_up_to_step = false;

  if (normalized_quantity < SMS_MIN_QUANTITY) {
    normalized_quantity = SMS_MIN_QUANTITY;
    rounded_to_minimum = true;
    was_rounded = true;
  } else if (normalized_quantity % SMS_QUANTITY_STEP !== 0) {
    normalized_quantity =
      Math.ceil(normalized_quantity / SMS_QUANTITY_STEP) * SMS_QUANTITY_STEP;
    was_rounded = true;
    rounded_up_to_step = true;
  }

  if (applyCalcMaxCap && normalized_quantity > CALC_MAX_VOLUME) {
    normalized_quantity = CALC_MAX_VOLUME;
    was_rounded = true;
    rounded_up_to_step = false;
  }

  return {
    requested_quantity,
    normalized_quantity,
    was_rounded,
    rounded_to_minimum,
    rounded_up_to_step,
  };
}

export function getUnitPriceForQuantity(normalizedQuantity) {
  const qty = normalizedQuantity;
  const range =
    VOLUME_TIER_RANGES.find((t) => qty >= t.min && qty <= t.max) ||
    VOLUME_TIER_RANGES[VOLUME_TIER_RANGES.length - 1];

  return {
    unit_price: range.unitPrice,
    tier_label: range.label,
    tier_applied: range.tierApplied,
    currency: "CLP",
  };
}

export function getPublicPricingTiers() {
  return VOLUME_TIER_RANGES.map((t) => ({
    min_quantity: t.min,
    max_quantity: t.max,
    unit_price: t.unitPrice,
    label: t.label,
    currency: "CLP",
  }));
}
