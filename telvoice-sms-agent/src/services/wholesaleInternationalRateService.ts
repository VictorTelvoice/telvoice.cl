import { getSupabase } from "../database/supabaseClient.js";
import type { WholesaleInternationalRatePlanEnriched } from "../types/smpp-lab.js";
import type { WholesaleStatus, WholesaleTrafficType } from "../types/wholesale.js";
import { ValidationError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { WHOLESALE_STATUSES, WHOLESALE_TRAFFIC_TYPES } from "../types/wholesale.js";

function dbError(error: unknown, ctx: string): void {
  if (error) wrapSupabaseError(error as Parameters<typeof wrapSupabaseError>[0], ctx);
}

function parseStatus(raw: unknown): WholesaleStatus {
  const v = String(raw ?? "draft").trim().toLowerCase();
  if (!(WHOLESALE_STATUSES as readonly string[]).includes(v)) {
    throw new ValidationError("Estado inválido.");
  }
  return v as WholesaleStatus;
}

function parseTraffic(raw: unknown): WholesaleTrafficType {
  const v = String(raw ?? "mixed").trim().toLowerCase();
  if (!(WHOLESALE_TRAFFIC_TYPES as readonly string[]).includes(v)) {
    throw new ValidationError("Tipo de tráfico inválido.");
  }
  return v as WholesaleTrafficType;
}

function parseDecimal(raw: unknown, label: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number.parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${label} inválido.`);
  }
  return n;
}

function computeMargin(cost: number | null, sale: number | null): number | null {
  if (cost == null || sale == null) return null;
  return sale - cost;
}

export function parseInternationalRatePlanForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const country_name = String(r.country_name ?? "").trim();
  const country_iso = String(r.country_iso ?? "").trim().toUpperCase();
  const operator_name = String(r.operator_name ?? "").trim();

  if (!country_name) throw new ValidationError("Nombre del país es obligatorio.");
  if (!country_iso || country_iso.length > 3) {
    throw new ValidationError("ISO país inválido (ej. RO, GB, CL).");
  }
  if (!operator_name) throw new ValidationError("Operador es obligatorio.");

  const cost_price = parseDecimal(r.cost_price, "Costo");
  const sale_price = parseDecimal(r.sale_price, "Precio venta");
  const pending_price =
    String(r.pending_price ?? "") === "on" ||
    String(r.pending_price ?? "") === "true" ||
    (cost_price == null && sale_price == null);

  const provider_id = String(r.provider_id ?? "").trim() || null;
  const smpp_connection_id = String(r.smpp_connection_id ?? "").trim() || null;

  return {
    country_name,
    country_iso,
    mcc: String(r.mcc ?? "").trim() || null,
    mnc: String(r.mnc ?? "").trim() || null,
    operator_name,
    traffic_type: parseTraffic(r.traffic_type),
    provider_id,
    smpp_connection_id,
    cost_price,
    sale_price,
    currency: String(r.currency ?? "USD").trim().toUpperCase(),
    margin: computeMargin(cost_price, sale_price),
    valid_from: String(r.valid_from ?? "").trim() || null,
    valid_until: String(r.valid_until ?? "").trim() || null,
    pending_price,
    status: parseStatus(r.status),
    notes: String(r.notes ?? "").trim() || null,
  };
}

export async function listInternationalRatePlans(): Promise<
  WholesaleInternationalRatePlanEnriched[]
> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_international_rate_plans")
    .select(
      "*, wholesale_providers(name), wholesale_smpp_connections(label)",
    )
    .order("country_iso")
    .order("operator_name");
  dbError(error, "intlRatePlans");

  return (data ?? []).map((row) => {
    const r = row as WholesaleInternationalRatePlanEnriched & {
      wholesale_providers?: { name: string } | null;
      wholesale_smpp_connections?: { label: string } | null;
    };
    return {
      ...r,
      provider_name: r.wholesale_providers?.name,
      smpp_connection_label: r.wholesale_smpp_connections?.label,
    };
  });
}

export async function getInternationalRatePlanById(
  id: string,
): Promise<WholesaleInternationalRatePlanEnriched> {
  const list = await listInternationalRatePlans();
  const found = list.find((p) => p.id === id);
  if (!found) throw new ValidationError("Rate plan no encontrado.");
  return found;
}

export async function createInternationalRatePlan(
  input: ReturnType<typeof parseInternationalRatePlanForm>,
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_international_rate_plans")
    .insert(input)
    .select("*")
    .single();
  dbError(error, "intlRatePlans");
  return data;
}

export async function updateInternationalRatePlan(
  id: string,
  input: ReturnType<typeof parseInternationalRatePlanForm>,
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_international_rate_plans")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  dbError(error, "intlRatePlans");
  if (!data) throw new ValidationError("Rate plan no encontrado.");
  return data;
}

export async function deleteInternationalRatePlan(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("wholesale_international_rate_plans")
    .delete()
    .eq("id", id);
  dbError(error, "intlRatePlans");
}

export async function seedInternationalRatePlansDraft(): Promise<number> {
  const supabase = getSupabase();
  const seeds = [
    {
      country_name: "Romania",
      country_iso: "RO",
      mcc: "226",
      operator_name: "All operators",
      traffic_type: "mixed",
      pending_price: true,
      status: "draft",
      notes: "Seed Sprint SMPP Lab — precio pendiente",
    },
    {
      country_name: "United Kingdom",
      country_iso: "GB",
      mcc: "234",
      operator_name: "All operators",
      traffic_type: "mixed",
      pending_price: true,
      status: "draft",
      notes: "Seed Sprint SMPP Lab — precio pendiente",
    },
    {
      country_name: "Chile",
      country_iso: "CL",
      mcc: "730",
      operator_name: "All operators",
      traffic_type: "mixed",
      pending_price: true,
      status: "draft",
      notes: "Seed Sprint SMPP Lab — precio pendiente",
    },
  ];

  let inserted = 0;
  for (const seed of seeds) {
    const { data: existing } = await supabase
      .from("wholesale_international_rate_plans")
      .select("id")
      .eq("country_iso", seed.country_iso)
      .eq("operator_name", seed.operator_name)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase
      .from("wholesale_international_rate_plans")
      .insert(seed);
    if (!error) inserted += 1;
  }
  return inserted;
}
