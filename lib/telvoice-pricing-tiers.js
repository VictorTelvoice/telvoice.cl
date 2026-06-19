/**
 * Tramos SMS Telvoice.cl — lógica compartida landing / agente web.
 * Los precios se cargan desde agent.telvoice.cl/api/public/sms-pricing-tiers.
 */

export const IVA_RATE = 0.19;
export const SMS_MIN_QUANTITY = 1000;
export const SMS_QUANTITY_STEP = 1000;
export const CALC_MAX_VOLUME = 120000;

const DEFAULT_PRICING_API =
  process.env.TELVOICE_PRICING_API_ORIGIN || "https://agent.telvoice.cl";

/** Fallback si la API no responde (solo arranque; no editar aquí en producción). */
export const FALLBACK_MIN_QUANTITY_TIERS = [
  { min_quantity: 1000, unit_price: 10, label: "Desde 1.000 SMS", currency: "CLP" },
  { min_quantity: 5000, unit_price: 9, label: "Desde 5.000 SMS", currency: "CLP" },
  { min_quantity: 10000, unit_price: 8, label: "Desde 10.000 SMS", currency: "CLP" },
  { min_quantity: 15000, unit_price: 7, label: "Desde 15.000 SMS", currency: "CLP" },
  { min_quantity: 50000, unit_price: 6, label: "Desde 50.000 SMS", currency: "CLP" },
  { min_quantity: 100000, unit_price: 5, label: "Desde 100.000 SMS", currency: "CLP" },
];

let cachedMinTiers = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000;

function normalizeApiTier(t) {
  return {
    min_quantity: Number(t.min_sms ?? t.min_quantity),
    unit_price: Number(t.unit_price_clp ?? t.unit_price),
    label: String(t.label ?? ""),
    currency: t.currency || "CLP",
  };
}

export function setMinQuantityTiers(tiers) {
  cachedMinTiers = tiers.map(normalizeApiTier);
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
}

export function getMinQuantityTiersSync() {
  return cachedMinTiers && cachedMinTiers.length
    ? cachedMinTiers
    : FALLBACK_MIN_QUANTITY_TIERS;
}

export async function fetchMinQuantityTiers(apiOrigin = DEFAULT_PRICING_API) {
  if (cachedMinTiers && Date.now() < cacheExpiresAt) {
    return cachedMinTiers;
  }

  const base = String(apiOrigin || DEFAULT_PRICING_API).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/public/sms-pricing-tiers`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    if (res.ok && data?.success && Array.isArray(data.tiers) && data.tiers.length) {
      setMinQuantityTiers(data.tiers);
      return cachedMinTiers;
    }
  } catch (err) {
    console.warn("[telvoice-pricing-tiers] API fallback", err?.message || err);
  }

  return getMinQuantityTiersSync();
}

/** @deprecated Usar min_quantity tiers desde API. */
export const VOLUME_TIER_RANGES = FALLBACK_MIN_QUANTITY_TIERS.map((t, i, arr) => {
  const next = arr[i + 1];
  return {
    min: t.min_quantity,
    max: next ? next.min_quantity - 1 : Number.MAX_SAFE_INTEGER,
    unitPrice: t.unit_price,
    label: t.label,
    tierApplied: t.label,
  };
});

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

export function resolveUnitPriceFromMinTiers(normalizedQuantity, tiers) {
  const sorted = [...tiers].sort((a, b) => b.min_quantity - a.min_quantity);
  for (const tier of sorted) {
    if (normalizedQuantity >= tier.min_quantity) {
      return {
        unit_price: Number(tier.unit_price),
        tier_label: tier.label,
        tier_applied: tier.label,
        currency: tier.currency || "CLP",
      };
    }
  }
  const fallback = sorted[sorted.length - 1];
  return {
    unit_price: Number(fallback?.unit_price ?? 10),
    tier_label: fallback?.label ?? "Desde 1.000 SMS",
    tier_applied: fallback?.label ?? "Desde 1.000 SMS",
    currency: fallback?.currency ?? "CLP",
  };
}

export function getUnitPriceForQuantity(normalizedQuantity, tiers) {
  const list = tiers ?? getMinQuantityTiersSync();
  return resolveUnitPriceFromMinTiers(normalizedQuantity, list);
}

export function getPublicPricingTiers(tiers) {
  const list = tiers ?? getMinQuantityTiersSync();
  return list.map((t) => ({
    min_quantity: t.min_quantity,
    unit_price: t.unit_price,
    label: t.label,
    currency: t.currency || "CLP",
  }));
}
