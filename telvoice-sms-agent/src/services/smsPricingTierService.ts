import { getSupabase } from "../database/supabaseClient.js";
import type { SmsPricingTierRow } from "../types/commercial.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export const SMS_QUANTITY_STEP = 1000;
export const SMS_MIN_QUANTITY = 1000;

export const FALLBACK_PRICING_TIERS: Omit<
  SmsPricingTierRow,
  "id" | "created_at" | "updated_at" | "is_active"
>[] = [
  {
    country_code: "CL",
    min_quantity: 1000,
    unit_price: 10,
    currency: "CLP",
    label: "Desde 1.000 SMS",
    sort_order: 10,
  },
  {
    country_code: "CL",
    min_quantity: 5000,
    unit_price: 9,
    currency: "CLP",
    label: "Desde 5.000 SMS",
    sort_order: 20,
  },
  {
    country_code: "CL",
    min_quantity: 10000,
    unit_price: 8,
    currency: "CLP",
    label: "Desde 10.000 SMS",
    sort_order: 30,
  },
  {
    country_code: "CL",
    min_quantity: 15000,
    unit_price: 7,
    currency: "CLP",
    label: "Desde 15.000 SMS",
    sort_order: 40,
  },
  {
    country_code: "CL",
    min_quantity: 50000,
    unit_price: 6,
    currency: "CLP",
    label: "Desde 50.000 SMS",
    sort_order: 50,
  },
  {
    country_code: "CL",
    min_quantity: 100000,
    unit_price: 5,
    currency: "CLP",
    label: "Desde 100.000 SMS",
    sort_order: 60,
  },
];

export interface NormalizedQuantityResult {
  requested_quantity: number;
  normalized_quantity: number;
  was_rounded: boolean;
  rounded_to_minimum: boolean;
}

export interface UnitPriceForQuantityResult {
  unit_price: number;
  tier_label: string;
  normalized_quantity: number;
  was_rounded: boolean;
  rounded_to_minimum: boolean;
  requested_quantity: number;
  currency: string;
}

export function normalizeQuoteQuantity(requested: number): NormalizedQuantityResult {
  const requested_quantity = Math.max(1, Math.floor(requested));
  let normalized_quantity = requested_quantity;
  let was_rounded = false;
  let rounded_to_minimum = false;

  if (normalized_quantity < SMS_MIN_QUANTITY) {
    normalized_quantity = SMS_MIN_QUANTITY;
    rounded_to_minimum = requested_quantity < SMS_MIN_QUANTITY;
    was_rounded = rounded_to_minimum;
  } else if (normalized_quantity % SMS_QUANTITY_STEP !== 0) {
    normalized_quantity =
      Math.ceil(normalized_quantity / SMS_QUANTITY_STEP) * SMS_QUANTITY_STEP;
    was_rounded = true;
  }

  return {
    requested_quantity,
    normalized_quantity,
    was_rounded,
    rounded_to_minimum,
  };
}

function resolveUnitPriceFromTiers(
  normalizedQuantity: number,
  tiers: { min_quantity: number; unit_price: number; label: string; currency: string }[],
): { unit_price: number; tier_label: string; currency: string } {
  const sorted = [...tiers].sort((a, b) => b.min_quantity - a.min_quantity);

  for (const tier of sorted) {
    if (normalizedQuantity >= tier.min_quantity) {
      return {
        unit_price: Number(tier.unit_price),
        tier_label: tier.label,
        currency: tier.currency,
      };
    }
  }

  const fallback = sorted[sorted.length - 1];
  return {
    unit_price: Number(fallback?.unit_price ?? 10),
    tier_label: fallback?.label ?? "Desde 1.000 SMS",
    currency: fallback?.currency ?? "CLP",
  };
}

export async function listAllPricingTiers(
  countryCode = "CL",
): Promise<SmsPricingTierRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_pricing_tiers")
    .select("*")
    .eq("country_code", countryCode)
    .order("sort_order", { ascending: true });

  if (error) {
    wrapSupabaseError(error, "listAllPricingTiers");
  }
  return (data ?? []) as SmsPricingTierRow[];
}

export async function updatePricingTier(
  id: string,
  patch: {
    unit_price?: number;
    label?: string;
    is_active?: boolean;
    sort_order?: number;
  },
): Promise<SmsPricingTierRow> {
  const { data, error } = await getSupabase()
    .from("sms_pricing_tiers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updatePricingTier");
  }
  return data as SmsPricingTierRow;
}

export async function listActivePricingTiers(
  countryCode = "CL",
): Promise<SmsPricingTierRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_pricing_tiers")
    .select("*")
    .eq("country_code", countryCode)
    .eq("is_active", true)
    .order("min_quantity", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []) as SmsPricingTierRow[];
}

export async function getPricingTiersForQuote(
  countryCode = "CL",
): Promise<{ min_quantity: number; unit_price: number; label: string; currency: string }[]> {
  const fromDb = await listActivePricingTiers(countryCode);
  if (fromDb.length > 0) {
    return fromDb.map((t) => ({
      min_quantity: t.min_quantity,
      unit_price: Number(t.unit_price),
      label: t.label,
      currency: t.currency,
    }));
  }
  return FALLBACK_PRICING_TIERS.filter((t) => t.country_code === countryCode).map(
    (t) => ({
      min_quantity: t.min_quantity,
      unit_price: Number(t.unit_price),
      label: t.label,
      currency: t.currency,
    }),
  );
}

export async function getUnitPriceForQuantity(
  quantity: number,
  countryCode = "CL",
): Promise<UnitPriceForQuantityResult> {
  const normalized = normalizeQuoteQuantity(quantity);
  const tiers = await getPricingTiersForQuote(countryCode);
  const { unit_price, tier_label, currency } = resolveUnitPriceFromTiers(
    normalized.normalized_quantity,
    tiers,
  );

  return {
    unit_price,
    tier_label,
    normalized_quantity: normalized.normalized_quantity,
    was_rounded: normalized.was_rounded,
    rounded_to_minimum: normalized.rounded_to_minimum,
    requested_quantity: normalized.requested_quantity,
    currency,
  };
}
