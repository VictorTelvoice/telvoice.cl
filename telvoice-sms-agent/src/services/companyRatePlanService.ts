import { getSupabase } from "../database/supabaseClient.js";
import type { CompanyRatePlanRow, SmsRatePlanRow } from "../types/sms-routing.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

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

export async function assignCompanyRatePlan(input: {
  companyId: string;
  ratePlanId: string;
  country?: string;
  trafficType?: string;
}): Promise<CompanyRatePlanRow> {
  const country = input.country ?? "CL";
  const trafficType = input.trafficType ?? "transactional";

  await getSupabase()
    .from("company_rate_plans")
    .update({ status: "inactive" })
    .eq("company_id", input.companyId)
    .eq("country", country)
    .eq("traffic_type", trafficType);

  const { data, error } = await getSupabase()
    .from("company_rate_plans")
    .insert({
      company_id: input.companyId,
      rate_plan_id: input.ratePlanId,
      country,
      traffic_type: trafficType,
      status: "active",
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
