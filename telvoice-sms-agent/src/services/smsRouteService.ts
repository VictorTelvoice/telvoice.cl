import { getSupabase } from "../database/supabaseClient.js";
import type { SmsRouteRow, SmsRouteWithProvider } from "../types/sms-routing.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function listSmsRoutes(): Promise<SmsRouteWithProvider[]> {
  const { data, error } = await getSupabase()
    .from("sms_routes")
    .select("*, sms_providers(name, code, status)")
    .order("country")
    .order("priority", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listSmsRoutes");
  }

  return (data ?? []).map((row) => {
    const r = row as SmsRouteRow & {
      sms_providers?: { name: string; code: string; status: string } | null;
    };
    return {
      ...r,
      provider_name: r.sms_providers?.name,
      provider_code: r.sms_providers?.code,
    };
  });
}

export async function getSmsRouteById(id: string): Promise<SmsRouteRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_routes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getSmsRouteById");
  }
  return data as SmsRouteRow | null;
}

export async function createSmsRoute(input: {
  providerId: string;
  name: string;
  country?: string;
  mcc?: string | null;
  mnc?: string | null;
  operatorName?: string | null;
  routeType?: string;
  trafficType?: string;
  costPerSms?: number;
  currency?: string;
  priority?: number;
  isDefault?: boolean;
  dlrEnabled?: boolean;
}): Promise<SmsRouteRow> {
  if (input.isDefault) {
    await getSupabase()
      .from("sms_routes")
      .update({ is_default: false })
      .eq("country", input.country ?? "CL");
  }

  const { data, error } = await getSupabase()
    .from("sms_routes")
    .insert({
      provider_id: input.providerId,
      name: input.name,
      country: input.country ?? "CL",
      mcc: input.mcc ?? null,
      mnc: input.mnc ?? null,
      operator_name: input.operatorName ?? null,
      route_type: input.routeType ?? "hq",
      traffic_type: input.trafficType ?? "transactional",
      cost_per_sms: input.costPerSms ?? 0,
      currency: input.currency ?? "USD",
      priority: input.priority ?? 100,
      is_default: input.isDefault ?? false,
      dlr_enabled: input.dlrEnabled ?? true,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError("Migración 014 no aplicada (sms_routes).", 503);
    }
    wrapSupabaseError(error, "createSmsRoute");
  }
  return data as SmsRouteRow;
}

export async function updateSmsRoute(
  id: string,
  patch: Partial<{
    name: string;
    status: string;
    priority: number;
    cost_per_sms: number;
    is_default: boolean;
    dlr_enabled: boolean;
    max_tps: number;
    max_concurrent_requests: number;
    daily_limit: number | null;
    failure_threshold_percent: number;
    auto_pause_on_failure: boolean;
  }>,
): Promise<SmsRouteRow> {
  const { data, error } = await getSupabase()
    .from("sms_routes")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateSmsRoute");
  }
  return data as SmsRouteRow;
}

export async function pauseSmsRoute(id: string): Promise<SmsRouteRow> {
  return updateSmsRoute(id, { status: "paused" });
}

export async function resumeSmsRoute(id: string): Promise<SmsRouteRow> {
  return updateSmsRoute(id, { status: "active" });
}

export async function findDefaultRouteForCountry(
  country: string,
): Promise<SmsRouteRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_routes")
    .select("*")
    .eq("country", country)
    .eq("status", "active")
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findDefaultRouteForCountry");
  }
  return data as SmsRouteRow | null;
}
