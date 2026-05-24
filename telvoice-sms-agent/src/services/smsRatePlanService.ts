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

export async function listRatePlanDetails(
  ratePlanId: string,
): Promise<SmsRatePlanDetailEnriched[]> {
  const { data, error } = await getSupabase()
    .from("sms_rate_plan_details")
    .select(
      "*, sms_routes(*, sms_providers(id, name, code)), sms_rate_plans(name, code)",
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
        sms_providers?: { id: string; name: string; code: string } | null;
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
}): Promise<SmsRatePlanDetailRow> {
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
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createRatePlanDetail");
  }
  return data as SmsRatePlanDetailRow;
}
