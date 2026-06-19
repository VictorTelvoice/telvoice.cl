import { getSupabase } from "../database/supabaseClient.js";
import { AppError } from "../utils/errors.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  SIM_SUBSCRIPTION_PLAN_CATALOG,
  PUBLIC_SIM_SUBSCRIPTION_PLAN_IDS,
  type PublicSimSubscriptionPlanId,
  type SimPlanDefinition,
  type SimPlanId,
  getSimPlan,
} from "../utils/simPlans.js";

export type SimBillingCycle = "monthly" | "annual";

export type SimPlanSettingsRow = {
  id: string;
  plan_id: string;
  label: string;
  monthly_price_clp: number;
  annual_discount_percent: number;
  annual_enabled: boolean;
  included_sms: number;
  is_visible: boolean;
  is_featured: boolean;
  sort_order: number;
  badge: string | null;
  ribbon: string | null;
  short_description: string | null;
  feature_list: string[];
  metadata: Record<string, unknown>;
  promo_enabled: boolean;
  promo_discount_percent: number;
  promo_duration_months: number;
  promo_label: string | null;
  promo_metadata: Record<string, unknown>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicSimPlanCatalogItem = {
  plan_id: PublicSimSubscriptionPlanId;
  label: string;
  sim_label: string;
  name: string;
  description: string;
  features: string[];
  ctaLabel: string;
  featured?: boolean;
  badge?: string | null;
  ribbon?: string | null;
  monthly_price_clp: number;
  total_amount: number;
  sms_quantity: number;
  included_sms: number;
  annual_enabled: boolean;
  annual_discount_percent: number;
  annual_price_clp: number;
  monthly_equiv_annual_clp: number;
  currency: "CLP";
  product_type: "sim_subscription";
  has_intro_promo: boolean;
  regular_monthly_price_clp: number;
  promo_monthly_price_clp: number;
  promo_savings_clp: number;
  promo_duration_months: number;
  promo_discount_percent: number;
  promo_label: string | null;
};

export type PlanIntroPromoPricing = {
  hasIntroPromo: boolean;
  regularMonthlyPriceClp: number;
  promoMonthlyPriceClp: number;
  promoSavingsClp: number;
  promoDurationMonths: number;
  promoDiscountPercent: number;
  promoLabel: string | null;
};

export type UpdateSimPlanSettingsInput = {
  plan_id: string;
  monthly_price_clp: number;
  annual_discount_percent: number;
  annual_enabled: boolean;
  included_sms: number;
  is_visible: boolean;
  is_featured: boolean;
  badge?: string | null;
  ribbon?: string | null;
  short_description?: string | null;
  feature_list: string[];
  promo_enabled: boolean;
  promo_discount_percent: number;
  promo_duration_months: number;
  promo_label?: string | null;
};

const CACHE_TTL_MS = 60_000;

let cachedRows: SimPlanSettingsRow[] | null = null;
let cacheExpiresAt = 0;

function parseFeatureList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function rowFromDb(raw: Record<string, unknown>): SimPlanSettingsRow {
  return {
    id: String(raw.id),
    plan_id: String(raw.plan_id),
    label: String(raw.label),
    monthly_price_clp: Number(raw.monthly_price_clp) || 0,
    annual_discount_percent: Number(raw.annual_discount_percent) || 0,
    annual_enabled: raw.annual_enabled !== false,
    included_sms: Number(raw.included_sms) || 0,
    is_visible: raw.is_visible !== false,
    is_featured: raw.is_featured === true,
    sort_order: Number(raw.sort_order) || 100,
    badge: typeof raw.badge === "string" ? raw.badge : null,
    ribbon: typeof raw.ribbon === "string" ? raw.ribbon : null,
    short_description:
      typeof raw.short_description === "string" ? raw.short_description : null,
    feature_list: parseFeatureList(raw.feature_list),
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : {},
    promo_enabled: raw.promo_enabled === true,
    promo_discount_percent: Number(raw.promo_discount_percent) || 0,
    promo_duration_months: Number(raw.promo_duration_months) || 0,
    promo_label: typeof raw.promo_label === "string" ? raw.promo_label : null,
    promo_metadata:
      raw.promo_metadata &&
      typeof raw.promo_metadata === "object" &&
      !Array.isArray(raw.promo_metadata)
        ? (raw.promo_metadata as Record<string, unknown>)
        : {},
    updated_by: typeof raw.updated_by === "string" ? raw.updated_by : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

function fallbackRowsFromCatalog(): SimPlanSettingsRow[] {
  const now = new Date().toISOString();
  const starterPro: SimPlanSettingsRow[] = PUBLIC_SIM_SUBSCRIPTION_PLAN_IDS.map((planId, index) => {
    const entry = SIM_SUBSCRIPTION_PLAN_CATALOG[planId];
    return {
      id: `fallback-${planId}`,
      plan_id: planId,
      label: entry.sim_label,
      monthly_price_clp: entry.total_amount,
      annual_discount_percent: 20,
      annual_enabled: true,
      included_sms: entry.sms_quantity,
      is_visible: true,
      is_featured: entry.featured === true,
      sort_order: (index + 1) * 10,
      badge: null,
      ribbon: entry.featured ? "Popular" : null,
      short_description: entry.description,
      feature_list: [...entry.features],
      metadata: {},
      promo_enabled: false,
      promo_discount_percent: 0,
      promo_duration_months: 0,
      promo_label: null,
      promo_metadata: {},
      updated_by: null,
      created_at: now,
      updated_at: now,
    };
  });

  const custom: SimPlanSettingsRow = {
    id: "fallback-custom",
    plan_id: "custom",
    label: "A medida",
    monthly_price_clp: 0,
    annual_discount_percent: 0,
    annual_enabled: false,
    included_sms: 0,
    is_visible: true,
    is_featured: false,
    sort_order: 30,
    badge: null,
    ribbon: null,
    short_description:
      "Para múltiples números, volumen o integraciones especiales.",
    feature_list: [
      "Múltiples números SIM reales",
      "Volumen SMS personalizado",
      "Automatizaciones e integraciones avanzadas",
      "Integración API/Webhooks",
      "Soporte operativo Telvoice",
      "Diseño de flujo a medida",
    ],
    metadata: {},
    promo_enabled: false,
    promo_discount_percent: 0,
    promo_duration_months: 0,
    promo_label: null,
    promo_metadata: {},
    updated_by: null,
    created_at: now,
    updated_at: now,
  };

  return [...starterPro, custom];
}

export function invalidateSimPlanSettingsCache(): void {
  cachedRows = null;
  cacheExpiresAt = 0;
}

export async function getSimPlanSettings(): Promise<SimPlanSettingsRow[]> {
  if (cachedRows && Date.now() < cacheExpiresAt) {
    return cachedRows;
  }

  const { data, error } = await getSupabase()
    .from("sim_subscription_plan_settings")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      cachedRows = fallbackRowsFromCatalog();
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      return cachedRows;
    }
    wrapSupabaseError(error, "getSimPlanSettings");
  }

  const rows = (data ?? []).map((row) =>
    rowFromDb(row as Record<string, unknown>),
  );
  cachedRows = rows.length > 0 ? rows : fallbackRowsFromCatalog();
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedRows;
}

export async function getSimPlanById(
  planId: string,
): Promise<SimPlanSettingsRow | null> {
  const rows = await getSimPlanSettings();
  return rows.find((row) => row.plan_id === planId.trim()) ?? null;
}

export function calculateSimPlanPrice(
  settings: Pick<
    SimPlanSettingsRow,
    "monthly_price_clp" | "annual_discount_percent" | "annual_enabled"
  >,
  billingCycle: SimBillingCycle,
): {
  amount_clp: number;
  billing_cycle: SimBillingCycle;
  monthly_price_clp: number;
  annual_discount_percent: number;
  annual_price_clp: number;
  monthly_equiv_annual_clp: number;
} {
  const monthly = Math.max(0, Math.round(settings.monthly_price_clp));
  const discount = Math.min(
    80,
    Math.max(0, Number(settings.annual_discount_percent) || 0),
  );
  const annualPrice = Math.round(monthly * 12 * (1 - discount / 100));
  const monthlyEquiv = monthly > 0 ? Math.round(annualPrice / 12) : 0;

  if (billingCycle === "annual") {
    return {
      amount_clp: annualPrice,
      billing_cycle: "annual",
      monthly_price_clp: monthly,
      annual_discount_percent: discount,
      annual_price_clp: annualPrice,
      monthly_equiv_annual_clp: monthlyEquiv,
    };
  }

  return {
    amount_clp: monthly,
    billing_cycle: "monthly",
    monthly_price_clp: monthly,
    annual_discount_percent: discount,
    annual_price_clp: annualPrice,
    monthly_equiv_annual_clp: monthlyEquiv,
  };
}

function ctaLabelForPlan(
  planId: string,
  label: string,
  introPromo: PlanIntroPromoPricing,
): string {
  if (introPromo.hasIntroPromo) {
    const pct = Math.round(introPromo.promoDiscountPercent);
    if (planId === "sim_starter") return `Suscribirme Starter con ${pct}% dto.`;
    if (planId === "sim_pro") return `Suscribirme Pro con ${pct}% dto.`;
    return `Suscribirme ${label} con ${pct}% dto.`;
  }
  if (planId === "sim_starter") return "Suscribirme Starter";
  if (planId === "sim_pro") return "Suscribirme Pro";
  return `Suscribirme ${label}`;
}

export function calculatePlanIntroPromo(
  settings: Pick<
    SimPlanSettingsRow,
    | "monthly_price_clp"
    | "promo_enabled"
    | "promo_discount_percent"
    | "promo_duration_months"
    | "promo_label"
  >,
): PlanIntroPromoPricing {
  const regularMonthlyPriceClp = Math.max(0, Math.round(settings.monthly_price_clp));
  const promoDiscountPercent = Math.min(
    100,
    Math.max(0, Number(settings.promo_discount_percent) || 0),
  );
  const promoDurationMonths = Math.max(
    0,
    Math.round(Number(settings.promo_duration_months) || 0),
  );
  const hasIntroPromo =
    settings.promo_enabled === true &&
    promoDiscountPercent > 0 &&
    promoDurationMonths > 0 &&
    regularMonthlyPriceClp > 0;

  const promoMonthlyPriceClp = hasIntroPromo
    ? Math.round(regularMonthlyPriceClp * (1 - promoDiscountPercent / 100))
    : regularMonthlyPriceClp;
  const promoSavingsClp = hasIntroPromo
    ? regularMonthlyPriceClp - promoMonthlyPriceClp
    : 0;

  let promoLabel = settings.promo_label?.trim() || null;
  if (hasIntroPromo && !promoLabel) {
    promoLabel = `${Math.round(promoDiscountPercent)}% por ${promoDurationMonths} meses`;
  }

  return {
    hasIntroPromo,
    regularMonthlyPriceClp,
    promoMonthlyPriceClp,
    promoSavingsClp,
    promoDurationMonths,
    promoDiscountPercent,
    promoLabel,
  };
}

export function mapSettingsToPublicCatalogItem(
  row: SimPlanSettingsRow,
): PublicSimPlanCatalogItem | null {
  if (!PUBLIC_SIM_SUBSCRIPTION_PLAN_IDS.includes(row.plan_id as PublicSimSubscriptionPlanId)) {
    return null;
  }
  const planId = row.plan_id as PublicSimSubscriptionPlanId;
  const pricing = calculateSimPlanPrice(row, "monthly");
  const annualPricing = calculateSimPlanPrice(row, "annual");
  const introPromo = calculatePlanIntroPromo(row);
  const hardcoded = getSimPlan(planId);

  return {
    plan_id: planId,
    label: row.label,
    sim_label: row.label,
    name: hardcoded?.name ?? `Número Real ${row.label}`,
    description: row.short_description?.trim() || hardcoded?.name || row.label,
    features: row.feature_list.length
      ? row.feature_list
      : SIM_SUBSCRIPTION_PLAN_CATALOG[planId]?.features ?? [],
    ctaLabel: ctaLabelForPlan(planId, row.label, introPromo),
    featured: row.is_featured,
    badge: row.badge,
    ribbon: row.ribbon,
    monthly_price_clp: pricing.monthly_price_clp,
    total_amount: pricing.monthly_price_clp,
    sms_quantity: row.included_sms,
    included_sms: row.included_sms,
    annual_enabled: row.annual_enabled,
    annual_discount_percent: pricing.annual_discount_percent,
    annual_price_clp: annualPricing.annual_price_clp,
    monthly_equiv_annual_clp: annualPricing.monthly_equiv_annual_clp,
    currency: "CLP",
    product_type: "sim_subscription",
    has_intro_promo: introPromo.hasIntroPromo,
    regular_monthly_price_clp: introPromo.regularMonthlyPriceClp,
    promo_monthly_price_clp: introPromo.promoMonthlyPriceClp,
    promo_savings_clp: introPromo.promoSavingsClp,
    promo_duration_months: introPromo.promoDurationMonths,
    promo_discount_percent: introPromo.promoDiscountPercent,
    promo_label: introPromo.promoLabel,
  };
}

export async function getPublicSimPlanCatalog(): Promise<PublicSimPlanCatalogItem[]> {
  const rows = await getSimPlanSettings();
  return rows
    .filter((row) => row.is_visible)
    .map((row) => mapSettingsToPublicCatalogItem(row))
    .filter((item): item is PublicSimPlanCatalogItem => item != null);
}

/** Respuesta pública de catálogo SIM (landing / API sin auth). */
export type PublicSimPlanApiItem = {
  plan_id: string;
  label: string;
  description: string;
  monthly_price_clp: number;
  annual_discount_percent: number;
  annual_enabled: boolean;
  annual_price_clp: number;
  monthly_equiv_annual_clp: number;
  included_sms: number;
  has_intro_promo: boolean;
  promo_discount_percent: number;
  promo_duration_months: number;
  promo_monthly_price_clp: number;
  regular_monthly_price_clp: number;
  promo_label: string | null;
  promo_savings_clp: number;
  features: string[];
  cta_label: string;
  cta_label_regular: string;
  is_featured: boolean;
  ribbon: string | null;
  badge: string | null;
};

function ctaLabelRegularForPlan(planId: string, label: string): string {
  if (planId === "sim_starter") return "Suscribirme Starter";
  if (planId === "sim_pro") return "Suscribirme Pro";
  return `Suscribirme ${label}`;
}

export function mapCatalogItemToPublicApi(
  plan: PublicSimPlanCatalogItem,
): PublicSimPlanApiItem {
  return {
    plan_id: plan.plan_id,
    label: plan.label,
    description: plan.description,
    monthly_price_clp: plan.monthly_price_clp,
    annual_discount_percent: plan.annual_discount_percent,
    annual_enabled: plan.annual_enabled,
    annual_price_clp: plan.annual_price_clp,
    monthly_equiv_annual_clp: plan.monthly_equiv_annual_clp,
    included_sms: plan.included_sms,
    has_intro_promo: plan.has_intro_promo,
    promo_discount_percent: plan.promo_discount_percent,
    promo_duration_months: plan.promo_duration_months,
    promo_monthly_price_clp: plan.promo_monthly_price_clp,
    regular_monthly_price_clp: plan.regular_monthly_price_clp,
    promo_label: plan.promo_label,
    promo_savings_clp: plan.promo_savings_clp,
    features: plan.features,
    cta_label: plan.ctaLabel,
    cta_label_regular: ctaLabelRegularForPlan(plan.plan_id, plan.label),
    is_featured: plan.featured === true,
    ribbon: plan.ribbon ?? null,
    badge: plan.badge ?? null,
  };
}

export async function getPublicSimPlansApiCatalog(): Promise<PublicSimPlanApiItem[]> {
  const catalog = await getPublicSimPlanCatalog();
  return catalog.map(mapCatalogItemToPublicApi);
}

export function buildSimPlanDefinitionFromSettings(
  row: SimPlanSettingsRow,
): SimPlanDefinition | null {
  if (!["sim_starter", "sim_pro", "sim_power"].includes(row.plan_id)) {
    return null;
  }
  const hardcoded = getSimPlan(row.plan_id as SimPlanId);
  if (!hardcoded) return null;

  const gross = Math.max(0, Math.round(row.monthly_price_clp));
  const ratio = hardcoded.total_amount > 0 ? gross / hardcoded.total_amount : 1;
  const net = Math.round(hardcoded.net_amount * ratio);
  const tax = gross - net;

  return {
    ...hardcoded,
    sim_label: row.label,
    sms_quantity: row.included_sms > 0 ? row.included_sms : hardcoded.sms_quantity,
    net_amount: net,
    tax_amount: tax,
    total_amount: gross,
  };
}

function validateUpdateInput(input: UpdateSimPlanSettingsInput): void {
  if (!input.plan_id.trim()) {
    throw new AppError("plan_id requerido.", 400, "VALIDATION_ERROR");
  }
  if (!Number.isFinite(input.monthly_price_clp) || input.monthly_price_clp < 0) {
    throw new AppError("Precio mensual inválido.", 400, "VALIDATION_ERROR");
  }
  if (
    !Number.isFinite(input.annual_discount_percent) ||
    input.annual_discount_percent < 0 ||
    input.annual_discount_percent > 80
  ) {
    throw new AppError("Descuento anual debe estar entre 0 y 80.", 400, "VALIDATION_ERROR");
  }
  if (!Number.isFinite(input.included_sms) || input.included_sms < 0) {
    throw new AppError("SMS incluidos inválido.", 400, "VALIDATION_ERROR");
  }
  if (input.plan_id === "custom" && input.annual_enabled) {
    throw new AppError("El plan a medida no admite ciclo anual.", 400, "VALIDATION_ERROR");
  }
  if (
    !Number.isFinite(input.promo_discount_percent) ||
    input.promo_discount_percent < 0 ||
    input.promo_discount_percent > 100
  ) {
    throw new AppError("Descuento promocional debe estar entre 0 y 100.", 400, "VALIDATION_ERROR");
  }
  if (!Number.isFinite(input.promo_duration_months) || input.promo_duration_months < 0) {
    throw new AppError("Duración promocional inválida.", 400, "VALIDATION_ERROR");
  }
  if (input.promo_enabled) {
    if (input.promo_discount_percent <= 0) {
      throw new AppError("Activa un descuento promocional mayor a 0.", 400, "VALIDATION_ERROR");
    }
    if (input.promo_duration_months <= 0) {
      throw new AppError("Activa una duración promocional mayor a 0 meses.", 400, "VALIDATION_ERROR");
    }
  }
}

export async function updateSimPlanSettings(
  input: UpdateSimPlanSettingsInput,
  adminUserId: string,
): Promise<SimPlanSettingsRow> {
  validateUpdateInput(input);

  const payload = {
    monthly_price_clp: Math.round(input.monthly_price_clp),
    annual_discount_percent: input.annual_discount_percent,
    annual_enabled: input.annual_enabled,
    included_sms: Math.round(input.included_sms),
    is_visible: input.is_visible,
    is_featured: input.is_featured,
    badge: input.badge?.trim() || null,
    ribbon: input.ribbon?.trim() || null,
    short_description: input.short_description?.trim() || null,
    feature_list: input.feature_list,
    promo_enabled: input.promo_enabled,
    promo_discount_percent: input.promo_enabled ? input.promo_discount_percent : 0,
    promo_duration_months: input.promo_enabled ? Math.round(input.promo_duration_months) : 0,
    promo_label: input.promo_label?.trim() || null,
    updated_by: adminUserId,
  };

  const { data, error } = await getSupabase()
    .from("sim_subscription_plan_settings")
    .update(payload)
    .eq("plan_id", input.plan_id.trim())
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Migración 065 no aplicada (sim_subscription_plan_settings). Ejecute npm run migrate:065.",
        503,
        "MIGRATION_REQUIRED",
      );
    }
    wrapSupabaseError(error, "updateSimPlanSettings");
  }

  if (!data) {
    throw new AppError("Plan SIM no encontrado.", 404, "NOT_FOUND");
  }

  invalidateSimPlanSettingsCache();
  return rowFromDb(data as Record<string, unknown>);
}

export async function getDefaultAnnualDiscountPercent(): Promise<number> {
  const rows = await getSimPlanSettings();
  const starter = rows.find((row) => row.plan_id === "sim_starter");
  if (starter) return Number(starter.annual_discount_percent) || 20;
  return 20;
}
