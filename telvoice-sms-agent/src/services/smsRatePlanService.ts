import { getSupabase } from "../database/supabaseClient.js";
import type {
  SmsRatePlanDetailEnriched,
  SmsRatePlanDetailRow,
  SmsRatePlanRow,
} from "../types/sms-routing.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function listSmsRatePlans(): Promise<SmsRatePlanRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_rate_plans")
    .select("*")
    .order("name");

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listSmsRatePlans");
  }
  return (data ?? []) as SmsRatePlanRow[];
}

export async function getSmsRatePlanById(id: string): Promise<SmsRatePlanRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_rate_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getSmsRatePlanById");
  }
  return data as SmsRatePlanRow | null;
}

export async function createSmsRatePlan(input: {
  name: string;
  code: string;
  currency?: string;
  description?: string | null;
}): Promise<SmsRatePlanRow> {
  const { data, error } = await getSupabase()
    .from("sms_rate_plans")
    .insert({
      name: input.name,
      code: input.code.toUpperCase().trim(),
      currency: input.currency ?? "CLP",
      description: input.description ?? null,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError("Migración 014 no aplicada (sms_rate_plans).", 503);
    }
    wrapSupabaseError(error, "createSmsRatePlan");
  }
  return data as SmsRatePlanRow;
}

export async function updateSmsRatePlan(
  id: string,
  patch: Partial<{
    name: string;
    status: string;
    description: string | null;
    default_tps: number;
    daily_limit: number | null;
    monthly_limit: number | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<SmsRatePlanRow> {
  const { data, error } = await getSupabase()
    .from("sms_rate_plans")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateSmsRatePlan");
  }
  return data as SmsRatePlanRow;
}

export async function listRatePlanDetails(
  ratePlanId: string,
): Promise<SmsRatePlanDetailEnriched[]> {
  const { data, error } = await getSupabase()
    .from("sms_rate_plan_details")
    .select(
      "*, sms_routes(*, sms_providers(id, name, code, status)), sms_rate_plans(name, code)",
    )
    .eq("rate_plan_id", ratePlanId)
    .order("country");

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listRatePlanDetails");
  }

  return (data ?? []).map((row) => {
    const r = row as SmsRatePlanDetailRow & {
      sms_routes?: (SmsRatePlanDetailEnriched["route"] & {
        sms_providers?: {
          id: string;
          name: string;
          code: string;
          status?: string;
        } | null;
      }) | null;
    };
    const route = r.sms_routes ?? null;
    const prov = route?.sms_providers;
    return {
      ...r,
      route,
      provider: prov
        ? ({
            id: prov.id,
            name: prov.name,
            code: prov.code,
            status: prov.status,
          } as SmsRatePlanDetailEnriched["provider"])
        : null,
    };
  });
}

export async function createRatePlanDetail(input: {
  ratePlanId: string;
  routeId: string;
  country?: string;
  mcc?: string | null;
  mnc?: string | null;
  operatorName?: string | null;
  trafficType?: string;
  sellPricePerSms: number;
  costPricePerSms?: number;
  currency?: string;
  weight?: number;
}): Promise<SmsRatePlanDetailRow> {
  const metadata: Record<string, unknown> = {};
  if (input.weight != null && Number.isFinite(input.weight) && input.weight > 0) {
    metadata.weight = input.weight;
  }

  const { data, error } = await getSupabase()
    .from("sms_rate_plan_details")
    .insert({
      rate_plan_id: input.ratePlanId,
      route_id: input.routeId,
      country: input.country ?? "CL",
      mcc: input.mcc ?? null,
      mnc: input.mnc ?? null,
      operator_name: input.operatorName ?? null,
      traffic_type: input.trafficType ?? "transactional",
      sell_price_per_sms: input.sellPricePerSms,
      cost_price_per_sms: input.costPricePerSms ?? 0,
      currency: input.currency ?? "CLP",
      status: "active",
      metadata,
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createRatePlanDetail");
  }
  return data as SmsRatePlanDetailRow;
}

export async function getRatePlanDetailById(
  id: string,
): Promise<SmsRatePlanDetailRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_rate_plan_details")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getRatePlanDetailById");
  }
  return data as SmsRatePlanDetailRow | null;
}

export async function updateRatePlanDetail(
  detailId: string,
  patch: {
    routeId?: string;
    country?: string;
    operatorName?: string | null;
    trafficType?: string;
    sellPricePerSms?: number;
    costPricePerSms?: number;
    currency?: string;
    status?: string;
    weight?: number;
  },
): Promise<SmsRatePlanDetailRow> {
  const existing = await getRatePlanDetailById(detailId);
  if (!existing) {
    throw new AppError("Tarifa no encontrada", 404);
  }

  const metadata: Record<string, unknown> = {
    ...((existing.metadata as Record<string, unknown> | null) ?? {}),
  };
  if (patch.weight != null && Number.isFinite(patch.weight) && patch.weight > 0) {
    metadata.weight = patch.weight;
  }

  const row: Record<string, unknown> = { metadata };
  if (patch.routeId) row.route_id = patch.routeId;
  if (patch.country) row.country = patch.country;
  if (patch.operatorName !== undefined) row.operator_name = patch.operatorName;
  if (patch.trafficType) row.traffic_type = patch.trafficType;
  if (patch.sellPricePerSms != null) row.sell_price_per_sms = patch.sellPricePerSms;
  if (patch.costPricePerSms != null) row.cost_price_per_sms = patch.costPricePerSms;
  if (patch.currency) row.currency = patch.currency;
  if (patch.status) row.status = patch.status;

  const { data, error } = await getSupabase()
    .from("sms_rate_plan_details")
    .update(row)
    .eq("id", detailId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateRatePlanDetail");
  }
  return data as SmsRatePlanDetailRow;
}

export async function deactivateRatePlanDetail(
  detailId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("sms_rate_plan_details")
    .update({ status: "inactive" })
    .eq("id", detailId);

  if (error) {
    wrapSupabaseError(error, "deactivateRatePlanDetail");
  }
}
