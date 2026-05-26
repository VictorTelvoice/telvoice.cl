import { getSupabase } from "../database/supabaseClient.js";
import type { CompanyPaymentCardConfig, PaymentBillingMode } from "../types/company-payment-card.js";
import { DEFAULT_PAYMENT_CARD_CONFIG } from "../types/company-payment-card.js";
import type { MercadoPagoPaymentRecord } from "./mercadoPagoService.js";
import { invalidateAppContextCache } from "./appContextCache.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { isMissingTableError } from "../utils/db-table.js";

const META_KEY = "payment_card";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function parsePaymentCardConfig(
  metadata: Record<string, unknown> | null | undefined,
): CompanyPaymentCardConfig {
  const raw = asRecord(metadata?.[META_KEY]);
  const billingMode = str(raw.billingMode);
  const mode: PaymentBillingMode =
    billingMode === "recurring" ? "recurring" : "on_demand";

  return {
    configured: bool(raw.configured),
    holderName: str(raw.holderName),
    brand: str(raw.brand),
    lastFour: str(raw.lastFour),
    expiryMonth: str(raw.expiryMonth),
    expiryYear: str(raw.expiryYear),
    billingMode: mode,
    autoRechargeEnabled: bool(raw.autoRechargeEnabled),
    defaultPackageId: str(raw.defaultPackageId) ?? null,
    linkedAt: str(raw.linkedAt),
    mercadopagoPaymentMethodId: str(raw.mercadopagoPaymentMethodId) ?? null,
  };
}

export async function getCompanyPaymentCard(
  companyId: string,
): Promise<CompanyPaymentCardConfig> {
  const { data, error } = await getSupabase()
    .from("companies")
    .select("metadata")
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return { ...DEFAULT_PAYMENT_CARD_CONFIG };
    }
    wrapSupabaseError(error, "getCompanyPaymentCard");
  }

  const meta = asRecord((data as { metadata?: unknown } | null)?.metadata);
  return parsePaymentCardConfig(meta);
}

export async function saveCompanyPaymentCardPreferences(
  companyId: string,
  input: Pick<
    CompanyPaymentCardConfig,
    "billingMode" | "autoRechargeEnabled" | "defaultPackageId"
  >,
): Promise<CompanyPaymentCardConfig> {
  const current = await getCompanyPaymentCard(companyId);
  const next: CompanyPaymentCardConfig = {
    ...current,
    billingMode: input.billingMode,
    autoRechargeEnabled: input.autoRechargeEnabled,
    defaultPackageId: input.defaultPackageId ?? null,
  };
  return persistPaymentCard(companyId, next);
}

async function persistPaymentCard(
  companyId: string,
  card: CompanyPaymentCardConfig,
): Promise<CompanyPaymentCardConfig> {
  const { data: row, error: readErr } = await getSupabase()
    .from("companies")
    .select("metadata")
    .eq("id", companyId)
    .maybeSingle();

  if (readErr) {
    wrapSupabaseError(readErr, "persistPaymentCard.read");
  }

  const metadata = {
    ...asRecord((row as { metadata?: unknown } | null)?.metadata),
    [META_KEY]: card,
  };

  const { error } = await getSupabase()
    .from("companies")
    .update({ metadata })
    .eq("id", companyId);

  if (error) {
    wrapSupabaseError(error, "persistPaymentCard.update");
  }

  invalidateAppContextCache(companyId);
  return card;
}

function mapMpBrand(paymentMethodId: string | null | undefined): string {
  const id = (paymentMethodId ?? "").toLowerCase();
  if (id.includes("visa")) {
    return "visa";
  }
  if (id.includes("master")) {
    return "mastercard";
  }
  if (id.includes("amex") || id.includes("american")) {
    return "amex";
  }
  return id || "card";
}

export function paymentCardPatchFromMercadoPago(
  payment: MercadoPagoPaymentRecord,
): Partial<CompanyPaymentCardConfig> {
  const card = payment.card as
    | {
        last_four_digits?: string;
        expiration_month?: number;
        expiration_year?: number;
        cardholder?: { name?: string };
      }
    | undefined;

  const lastFour = card?.last_four_digits
    ? String(card.last_four_digits).slice(-4)
    : undefined;
  const holder =
    card?.cardholder?.name?.trim() ||
    (typeof payment.payer?.email === "string" ? payment.payer.email : undefined);

  if (!lastFour && !payment.payment_method_id) {
    return {};
  }

  return {
    configured: Boolean(lastFour || payment.payment_method_id),
    holderName: holder,
    brand: mapMpBrand(payment.payment_method_id),
    lastFour,
    expiryMonth:
      card?.expiration_month != null
        ? String(card.expiration_month).padStart(2, "0")
        : undefined,
    expiryYear:
      card?.expiration_year != null ? String(card.expiration_year) : undefined,
    mercadopagoPaymentMethodId: payment.payment_method_id ?? null,
    linkedAt: new Date().toISOString(),
  };
}

export async function applyPaymentCardFromMercadoPago(
  companyId: string,
  payment: MercadoPagoPaymentRecord,
): Promise<CompanyPaymentCardConfig> {
  const patch = paymentCardPatchFromMercadoPago(payment);
  if (!patch.configured) {
    return getCompanyPaymentCard(companyId);
  }
  const current = await getCompanyPaymentCard(companyId);
  return persistPaymentCard(companyId, {
    ...current,
    ...patch,
    configured: true,
  });
}

export async function syncPaymentCardFromOrderMetadata(
  companyId: string,
  orderMetadata: Record<string, unknown> | undefined,
  payment: MercadoPagoPaymentRecord,
): Promise<void> {
  if (orderMetadata?.payment_card_setup !== true) {
    return;
  }
  if (payment.status !== "approved") {
    return;
  }
  await applyPaymentCardFromMercadoPago(companyId, payment);
}
