import type { SmsPricingTierRow } from "../../types/commercial.js";
import { calcIvaFromSubtotal } from "../../utils/clp-format.js";
import { ValidationError } from "../../utils/errors.js";
import { insertAuditLog } from "../auditLogService.js";
import {
  createPricingTier,
  findActiveTierByMinQuantity,
  getPricingTierById,
  getPricingTiersForQuote,
  getUnitPriceForQuantity,
  listActivePricingTiers,
  listAllPricingTiers,
  SMS_MIN_QUANTITY,
  updatePricingTier,
  type UnitPriceForQuantityResult,
} from "../smsPricingTierService.js";

export {
  FALLBACK_PRICING_TIERS,
  getPricingTiersForQuote,
  getUnitPriceForQuantity,
  normalizeQuoteQuantity,
  SMS_MIN_QUANTITY,
  SMS_QUANTITY_STEP,
} from "../smsPricingTierService.js";

export interface PublicSmsPricingTier {
  id: string;
  label: string;
  min_sms: number;
  unit_price_clp: number;
  currency: string;
  tax_label: string;
  active: boolean;
}

export interface SmsQuoteResult {
  country_code: string;
  requested_quantity: number;
  quoted_quantity: number;
  was_rounded: boolean;
  tier_label: string;
  unit_price: number;
  subtotal: number;
  iva: number;
  total_with_iva: number;
  currency: string;
}

function tierToPublic(tier: SmsPricingTierRow): PublicSmsPricingTier {
  return {
    id: tier.id,
    label: tier.label,
    min_sms: tier.min_quantity,
    unit_price_clp: Number(tier.unit_price),
    currency: tier.currency,
    tax_label: "+ IVA",
    active: tier.is_active,
  };
}

function validateMinQuantity(minQuantity: number): void {
  if (!Number.isFinite(minQuantity) || minQuantity < SMS_MIN_QUANTITY) {
    throw new ValidationError(
      `min_sms debe ser un entero >= ${SMS_MIN_QUANTITY.toLocaleString("es-CL")}.`,
    );
  }
  if (minQuantity % 1000 !== 0) {
    throw new ValidationError("min_sms debe ser múltiplo de 1.000.");
  }
}

function validateUnitPrice(unitPrice: number): void {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new ValidationError("unit_price debe ser mayor que 0.");
  }
}

async function assertUniqueActiveMinQuantity(
  countryCode: string,
  minQuantity: number,
  excludeId?: string,
): Promise<void> {
  const existing = await findActiveTierByMinQuantity(
    countryCode,
    minQuantity,
    excludeId,
  );
  if (existing) {
    throw new ValidationError(
      `Ya existe un tramo activo con min_sms ${minQuantity.toLocaleString("es-CL")}.`,
    );
  }
}

async function logPricingAudit(input: {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: "pricing.create" | "pricing.update" | "pricing.deactivate" | "pricing.reactivate";
  tierId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
}): Promise<void> {
  await insertAuditLog({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: "sms_pricing_tier",
    entityId: input.tierId,
    metadata: {
      before: input.before ?? null,
      after: input.after ?? null,
    },
    ipAddress: input.ipAddress ?? null,
  });
}

function tierSnapshot(tier: SmsPricingTierRow): Record<string, unknown> {
  return {
    id: tier.id,
    label: tier.label,
    min_quantity: tier.min_quantity,
    unit_price: Number(tier.unit_price),
    currency: tier.currency,
    is_active: tier.is_active,
    sort_order: tier.sort_order,
  };
}

export async function getActiveSmsPricingTiers(
  countryCode = "CL",
): Promise<SmsPricingTierRow[]> {
  return listActivePricingTiers(countryCode);
}

export async function getAllSmsPricingTiers(
  countryCode = "CL",
): Promise<SmsPricingTierRow[]> {
  return listAllPricingTiers(countryCode);
}

export async function getPublicSmsPricingTiers(
  countryCode = "CL",
): Promise<PublicSmsPricingTier[]> {
  const tiers = await getActiveSmsPricingTiers(countryCode);
  if (tiers.length > 0) {
    return tiers.map(tierToPublic);
  }

  const fallback = await getPricingTiersForQuote(countryCode);
  return fallback.map((t) => ({
    id: `fallback-${t.min_quantity}`,
    label: t.label,
    min_sms: t.min_quantity,
    unit_price_clp: t.unit_price,
    currency: t.currency,
    tax_label: "+ IVA",
    active: true,
  }));
}

export async function quoteSmsQuantity(
  quantity: number,
  countryCode = "CL",
): Promise<SmsQuoteResult> {
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new ValidationError("quantity debe ser un entero positivo.");
  }

  const pricing: UnitPriceForQuantityResult = await getUnitPriceForQuantity(
    quantity,
    countryCode,
  );
  const subtotal = pricing.normalized_quantity * pricing.unit_price;
  const { iva, total_with_iva } = calcIvaFromSubtotal(subtotal);

  return {
    country_code: countryCode,
    requested_quantity: pricing.requested_quantity,
    quoted_quantity: pricing.normalized_quantity,
    was_rounded: pricing.was_rounded,
    tier_label: pricing.tier_label,
    unit_price: pricing.unit_price,
    subtotal,
    iva,
    total_with_iva,
    currency: pricing.currency,
  };
}

export interface CreateSmsPricingTierInput {
  country_code?: string;
  min_sms: number;
  unit_price: number;
  currency?: string;
  label: string;
  is_active?: boolean;
  sort_order?: number;
}

export async function createSmsPricingTier(
  input: CreateSmsPricingTierInput,
  audit?: { actorUserId?: string; actorRole?: string; ipAddress?: string },
): Promise<SmsPricingTierRow> {
  const countryCode = (input.country_code ?? "CL").trim().toUpperCase();
  const minQuantity = Math.round(input.min_sms);
  validateMinQuantity(minQuantity);
  validateUnitPrice(input.unit_price);

  const label = String(input.label ?? "").trim();
  if (!label) {
    throw new ValidationError("label es obligatorio.");
  }

  if (input.is_active !== false) {
    await assertUniqueActiveMinQuantity(countryCode, minQuantity);
  }

  const tier = await createPricingTier({
    country_code: countryCode,
    min_quantity: minQuantity,
    unit_price: input.unit_price,
    currency: input.currency ?? "CLP",
    label,
    is_active: input.is_active ?? true,
    sort_order: input.sort_order,
  });

  await logPricingAudit({
    actorUserId: audit?.actorUserId,
    actorRole: audit?.actorRole,
    action: "pricing.create",
    tierId: tier.id,
    after: tierSnapshot(tier),
    ipAddress: audit?.ipAddress,
  });

  return tier;
}

export interface UpdateSmsPricingTierInput {
  label?: string;
  min_sms?: number;
  unit_price?: number;
  currency?: string;
  is_active?: boolean;
  sort_order?: number;
}

export async function updateSmsPricingTier(
  id: string,
  input: UpdateSmsPricingTierInput,
  audit?: { actorUserId?: string; actorRole?: string; ipAddress?: string },
): Promise<SmsPricingTierRow> {
  const existing = await getPricingTierById(id);
  if (!existing) {
    throw new ValidationError("Tramo de precio no encontrado.");
  }

  const patch: Parameters<typeof updatePricingTier>[1] = {};
  const willBeActive = input.is_active ?? existing.is_active;

  if (input.label !== undefined) {
    const label = String(input.label).trim();
    if (!label) {
      throw new ValidationError("label es obligatorio.");
    }
    patch.label = label;
  }

  if (input.min_sms !== undefined) {
    const minQuantity = Math.round(input.min_sms);
    validateMinQuantity(minQuantity);
    patch.min_quantity = minQuantity;
  }

  if (input.unit_price !== undefined) {
    validateUnitPrice(input.unit_price);
    patch.unit_price = input.unit_price;
  }

  if (input.is_active !== undefined) {
    patch.is_active = input.is_active;
  }

  if (input.sort_order !== undefined) {
    patch.sort_order = input.sort_order;
  }

  const nextMinQuantity = patch.min_quantity ?? existing.min_quantity;
  if (willBeActive) {
    await assertUniqueActiveMinQuantity(
      existing.country_code,
      nextMinQuantity,
      id,
    );
  }

  const before = tierSnapshot(existing);
  const tier = await updatePricingTier(id, patch);

  const action =
    before.is_active === true && tier.is_active === false
      ? "pricing.deactivate"
      : before.is_active === false && tier.is_active === true
        ? "pricing.reactivate"
        : "pricing.update";

  await logPricingAudit({
    actorUserId: audit?.actorUserId,
    actorRole: audit?.actorRole,
    action,
    tierId: tier.id,
    before,
    after: tierSnapshot(tier),
    ipAddress: audit?.ipAddress,
  });

  return tier;
}

export async function deactivateSmsPricingTier(
  id: string,
  audit?: { actorUserId?: string; actorRole?: string; ipAddress?: string },
): Promise<SmsPricingTierRow> {
  return updateSmsPricingTier(id, { is_active: false }, audit);
}
