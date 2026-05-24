import { getSupabase } from "../database/supabaseClient.js";
import type { CompanyRatePlanRow, SmsRatePlanRow } from "../types/sms-routing.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  CLIENT_TPS_CAP_ERROR,
  normalizeClientMaxTps,
  validateClientMaxTpsInput,
} from "./smsTrafficPolicyService.js";

export type CompanyRatePlanView = CompanyRatePlanRow & {
  rate_plan?: SmsRatePlanRow | null;
  rate_plan_name?: string;
  rate_plan_code?: string;
};

export async function getCompanyRatePlan(
  companyId: string,
  country = "CL",
  trafficType = "transactional",
): Promise<CompanyRatePlanView | null> {
  const { data, error } = await getSupabase()
    .from("company_rate_plans")
    .select("*, sms_rate_plans(*)")
    .eq("company_id", companyId)
    .eq("country", country)
    .eq("traffic_type", trafficType)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getCompanyRatePlan");
  }

  if (!data) {
    return null;
  }

  const row = data as CompanyRatePlanRow & { sms_rate_plans?: SmsRatePlanRow | null };
  return {
    ...row,
    rate_plan: row.sms_rate_plans ?? null,
    rate_plan_name: row.sms_rate_plans?.name,
    rate_plan_code: row.sms_rate_plans?.code,
  };
}

export async function updateCompanyRatePlanTraffic(
  companyId: string,
  input: {
    maxTps?: number;
    dailyLimit?: number | null;
    monthlyLimit?: number | null;
    liveEnabled?: boolean;
    campaignsEnabled?: boolean;
    apiEnabled?: boolean;
    country?: string;
    trafficType?: string;
  },
): Promise<CompanyRatePlanRow> {
  const country = input.country ?? "CL";
  const trafficType = input.trafficType ?? "transactional";
  const current = await getCompanyRatePlan(companyId, country, trafficType);
  if (!current) {
    throw new AppError(
      "Asigne un rate plan antes de configurar límites de tráfico.",
      400,
    );
  }

  const tpsCheck = validateClientMaxTpsInput(
    input.maxTps ?? current.max_tps ?? 1,
  );
  if (tpsCheck.error && input.maxTps != null && Number(input.maxTps) > 20) {
    throw new AppError(CLIENT_TPS_CAP_ERROR, 400);
  }

  const patch: Record<string, unknown> = {};
  if (input.maxTps != null) {
    patch.max_tps = normalizeClientMaxTps(input.maxTps);
  }
  if (input.dailyLimit !== undefined) {
    patch.daily_limit = input.dailyLimit;
  }
  if (input.monthlyLimit !== undefined) {
    patch.monthly_limit = input.monthlyLimit;
  }
  if (input.liveEnabled !== undefined) {
    patch.live_enabled = input.liveEnabled;
  }
  if (input.campaignsEnabled !== undefined) {
    patch.campaigns_enabled = input.campaignsEnabled;
  }
  if (input.apiEnabled !== undefined) {
    patch.api_enabled = input.apiEnabled;
  }

  const { data, error } = await getSupabase()
    .from("company_rate_plans")
    .update(patch)
    .eq("id", current.id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateCompanyRatePlanTraffic");
  }
  return data as CompanyRatePlanRow;
}

export async function assignCompanyRatePlan(input: {
  companyId: string;
  ratePlanId: string;
  country?: string;
  trafficType?: string;
  maxTps?: number;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  liveEnabled?: boolean;
  campaignsEnabled?: boolean;
  apiEnabled?: boolean;
}): Promise<CompanyRatePlanRow> {
  const country = input.country ?? "CL";
  const trafficType = input.trafficType ?? "transactional";

  await getSupabase()
    .from("company_rate_plans")
    .update({ status: "inactive" })
    .eq("company_id", input.companyId)
    .eq("country", country)
    .eq("traffic_type", trafficType);

  const tps =
    input.maxTps != null
      ? normalizeClientMaxTps(input.maxTps)
      : 1;

  const { data, error } = await getSupabase()
    .from("company_rate_plans")
    .insert({
      company_id: input.companyId,
      rate_plan_id: input.ratePlanId,
      country,
      traffic_type: trafficType,
      status: "active",
      max_tps: tps,
      daily_limit: input.dailyLimit ?? null,
      monthly_limit: input.monthlyLimit ?? null,
      live_enabled: input.liveEnabled ?? false,
      campaigns_enabled: input.campaignsEnabled ?? false,
      api_enabled: input.apiEnabled ?? false,
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "assignCompanyRatePlan");
  }
  return data as CompanyRatePlanRow;
}

export async function listCompanyRatePlansByPlan(
  ratePlanId: string,
): Promise<{ company_id: string; company_name: string }[]> {
  const { data, error } = await getSupabase()
    .from("company_rate_plans")
    .select("company_id, companies(name)")
    .eq("rate_plan_id", ratePlanId)
    .eq("status", "active");

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listCompanyRatePlansByPlan");
  }

  return (data ?? []).map((r) => {
    const row = r as unknown as {
      company_id: string;
      companies?: { name: string } | { name: string }[] | null;
    };
    const co = row.companies;
    const name = Array.isArray(co) ? co[0]?.name : co?.name;
    return {
      company_id: row.company_id,
      company_name: name ?? "—",
    };
  });
}
