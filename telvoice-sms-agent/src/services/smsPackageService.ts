import { getSupabase } from "../database/supabaseClient.js";
import type { PricingCatalogSummary, SmsPackageRow } from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import {
  defaultCommercialMetadata,
  isCustomerVisible,
  mergePackageMetadata,
  type PackageMetadata,
} from "../utils/package-metadata.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  return Number(value);
}

export async function listSmsPackages(activeOnly = false): Promise<SmsPackageRow[]> {
  let query = getSupabase()
    .from("sms_packages")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("sms_quantity", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listSmsPackages");
  }

  return (data ?? []) as SmsPackageRow[];
}

/** Bolsas visibles para el panel cliente /app */
export async function listCustomerVisiblePackages(
  country = "CL",
): Promise<SmsPackageRow[]> {
  const all = await listSmsPackages(true);
  return all.filter((p) => {
    if (p.country !== country || !isCustomerVisible(p.metadata ?? {})) {
      return false;
    }
    const meta = p.metadata ?? {};
    const channel = String(meta.channel ?? "web");
    const segment = String(meta.segment ?? "standard");
    return channel === "web" && segment === "standard";
  });
}

export function buildPricingCatalogSummary(
  packages: SmsPackageRow[],
): PricingCatalogSummary {
  const active = packages.filter((p) => p.is_active);
  const unitPrices = active
    .map((p) => (p.unit_price != null ? toNumber(p.unit_price) : null))
    .filter((n): n is number => n !== null && Number.isFinite(n));

  const lastUpdated = packages.reduce<string | null>((max, p) => {
    if (!max || p.updated_at > max) {
      return p.updated_at;
    }
    return max;
  }, null);

  return {
    activeCount: active.length,
    totalSmsInCatalog: active.reduce((s, p) => s + p.sms_quantity, 0),
    minUnitPrice: unitPrices.length ? Math.min(...unitPrices) : null,
    maxUnitPrice: unitPrices.length ? Math.max(...unitPrices) : null,
    lastUpdatedAt: lastUpdated,
    customerVisibleCount: active.filter((p) =>
      isCustomerVisible(p.metadata ?? {}),
    ).length,
  };
}

export async function getSmsPackageById(id: string): Promise<SmsPackageRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_packages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getSmsPackageById");
  }

  return data as SmsPackageRow | null;
}

export async function findActiveSmsPackageByQuantityAndTotal(
  input: { smsQuantity: number; totalPrice: number; currency?: string },
): Promise<SmsPackageRow | null> {
  const all = await listSmsPackages(true);
  const total = Math.round(Number(input.totalPrice));
  const cur = (input.currency ?? "CLP").trim().toUpperCase();

  for (const p of all) {
    const pTotal = Math.round(Number(p.total_price));
    const pCur = String(p.currency ?? "CLP").trim().toUpperCase();
    if (p.sms_quantity === input.smsQuantity && pTotal === total && pCur === cur) {
      return p;
    }
  }
  return null;
}

export async function createSmsPackage(input: {
  name: string;
  country?: string;
  smsQuantity: number;
  totalPrice: number;
  unitPrice?: number;
  currency?: string;
  packageType?: string;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: PackageMetadata;
}): Promise<SmsPackageRow> {
  const { unitPrice } = validateSmsPackageInput({
    name: input.name,
    smsQuantity: input.smsQuantity,
    totalPrice: input.totalPrice,
    unitPrice: input.unitPrice,
  });

  const meta = mergePackageMetadata(
    {},
    input.metadata ?? defaultCommercialMetadata(input.name),
  );

  const { data, error } = await getSupabase()
    .from("sms_packages")
    .insert({
      name: input.name.trim(),
      country: input.country ?? "CL",
      sms_quantity: input.smsQuantity,
      unit_price: unitPrice,
      total_price: input.totalPrice,
      currency: input.currency ?? "CLP",
      package_type: input.packageType ?? "prepaid",
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
      metadata: meta,
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createSmsPackage");
  }

  return data as SmsPackageRow;
}

export type SmsPackageUpsertInput = {
  name: string;
  country: string;
  smsQuantity: number;
  totalPrice: number;
  unitPrice: number;
  currency: string;
  packageType: string;
  sortOrder: number;
  isActive: boolean;
  metadata?: PackageMetadata;
};

export function validateSmsPackageInput(input: {
  name: string;
  smsQuantity: number;
  totalPrice: number;
  unitPrice?: number;
}): { unitPrice: number } {
  const name = input.name.trim();
  if (!name) {
    throw new AppError("El nombre de la bolsa no puede estar vacío.", 400);
  }
  if (!Number.isFinite(input.smsQuantity) || input.smsQuantity <= 0) {
    throw new AppError("La cantidad SMS debe ser mayor a 0.", 400);
  }
  if (!Number.isFinite(input.totalPrice) || input.totalPrice < 0) {
    throw new AppError("El precio total debe ser mayor o igual a 0.", 400);
  }

  let unitPrice = input.unitPrice;
  if (unitPrice === undefined || unitPrice === null || Number.isNaN(unitPrice)) {
    unitPrice =
      Math.round((input.totalPrice / input.smsQuantity) * 100) / 100;
  } else if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new AppError("El precio unitario debe ser mayor o igual a 0.", 400);
  }

  return { unitPrice };
}

export async function updateSmsPackage(
  id: string,
  input: Partial<SmsPackageUpsertInput>,
): Promise<SmsPackageRow> {
  if (input.name !== undefined && !input.name.trim()) {
    throw new AppError("El nombre de la bolsa no puede estar vacío.", 400);
  }
  if (
    input.smsQuantity !== undefined &&
    (!Number.isFinite(input.smsQuantity) || input.smsQuantity <= 0)
  ) {
    throw new AppError("La cantidad SMS debe ser mayor a 0.", 400);
  }
  if (
    input.totalPrice !== undefined &&
    (!Number.isFinite(input.totalPrice) || input.totalPrice < 0)
  ) {
    throw new AppError("El precio total debe ser mayor o igual a 0.", 400);
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.country !== undefined) patch.country = input.country;
  if (input.smsQuantity !== undefined) patch.sms_quantity = input.smsQuantity;
  if (input.totalPrice !== undefined) patch.total_price = input.totalPrice;
  if (input.unitPrice !== undefined) patch.unit_price = input.unitPrice;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.packageType !== undefined) patch.package_type = input.packageType;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  if (input.metadata !== undefined) {
    const current = await getSmsPackageById(id);
    patch.metadata = mergePackageMetadata(
      current?.metadata ?? {},
      input.metadata,
    );
  }

  const { data, error } = await getSupabase()
    .from("sms_packages")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateSmsPackage");
  }

  return data as SmsPackageRow;
}

export async function toggleSmsPackage(id: string): Promise<SmsPackageRow> {
  const pkg = await getSmsPackageById(id);
  if (!pkg) {
    throw new AppError("Bolsa no encontrada.", 404);
  }
  return updateSmsPackage(id, { isActive: !pkg.is_active });
}

export function formatPackagePrice(pkg: SmsPackageRow): string {
  const total = toNumber(pkg.total_price);
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: pkg.currency || "CLP",
    maximumFractionDigits: 0,
  }).format(total);
}
