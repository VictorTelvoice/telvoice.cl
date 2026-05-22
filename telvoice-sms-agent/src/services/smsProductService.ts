import { getSupabase } from "../database/supabaseClient.js";
import type {
  CreateSmsProductInput,
  SmsProductRow,
  UpdateSmsProductInput,
} from "../types/commercial.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function findActiveSmsProductByQuantity(
  quantity: number,
  countryCode = "CL",
): Promise<SmsProductRow | null> {
  const products = await listActiveSmsProducts(countryCode);
  return (
    products.find(
      (p) =>
        p.product_type === "sms_bundle" && p.sms_quantity === quantity,
    ) ?? null
  );
}

export async function listActiveSmsProducts(
  countryCode = "CL",
): Promise<SmsProductRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_products")
    .select("*")
    .eq("country_code", countryCode)
    .eq("is_active", true)
    .order("sms_quantity", { ascending: true });

  if (error) {
    console.warn(
      "[smsProductService] listActiveSmsProducts no disponible —",
      error.message ?? error.code,
    );
    return [];
  }

  return (data ?? []) as SmsProductRow[];
}

export async function listAllSmsProducts(): Promise<SmsProductRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_products")
    .select("*")
    .order("sms_quantity", { ascending: true });

  if (error) {
    wrapSupabaseError(error, "listAllSmsProducts");
  }

  return (data ?? []) as SmsProductRow[];
}

export async function getSmsProductById(id: string): Promise<SmsProductRow> {
  const { data, error } = await getSupabase()
    .from("sms_products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getSmsProductById");
  }

  if (!data) {
    throw new NotFoundError(`Producto no encontrado: ${id}`);
  }

  return data as SmsProductRow;
}

export async function createSmsProduct(
  input: CreateSmsProductInput,
): Promise<SmsProductRow> {
  if (!input.product_name.trim()) {
    throw new ValidationError("product_name es obligatorio.");
  }

  const { data, error } = await getSupabase()
    .from("sms_products")
    .insert({
      country_code: input.country_code ?? "CL",
      country_name: input.country_name ?? "Chile",
      product_name: input.product_name.trim(),
      description: input.description ?? null,
      sms_quantity: input.sms_quantity,
      currency: input.currency ?? "CLP",
      price_amount: input.price_amount,
      unit_price: input.unit_price,
      checkout_url: input.checkout_url ?? null,
      is_featured: input.is_featured ?? false,
      is_active: input.is_active ?? true,
      product_type: input.product_type ?? "sms_bundle",
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createSmsProduct");
  }

  return data as SmsProductRow;
}

export async function updateSmsProduct(
  id: string,
  input: UpdateSmsProductInput,
): Promise<SmsProductRow> {
  const patch: Record<string, unknown> = {};

  if (input.country_code !== undefined) {
    patch.country_code = input.country_code;
  }
  if (input.country_name !== undefined) {
    patch.country_name = input.country_name;
  }
  if (input.product_name !== undefined) {
    patch.product_name = input.product_name.trim();
  }
  if (input.description !== undefined) {
    patch.description = input.description;
  }
  if (input.sms_quantity !== undefined) {
    patch.sms_quantity = input.sms_quantity;
  }
  if (input.currency !== undefined) {
    patch.currency = input.currency;
  }
  if (input.price_amount !== undefined) {
    patch.price_amount = input.price_amount;
  }
  if (input.unit_price !== undefined) {
    patch.unit_price = input.unit_price;
  }
  if (input.checkout_url !== undefined) {
    patch.checkout_url = input.checkout_url;
  }
  if (input.is_featured !== undefined) {
    patch.is_featured = input.is_featured;
  }
  if (input.is_active !== undefined) {
    patch.is_active = input.is_active;
  }
  if (input.product_type !== undefined) {
    patch.product_type = input.product_type;
  }

  const { data, error } = await getSupabase()
    .from("sms_products")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateSmsProduct");
  }

  return data as SmsProductRow;
}
