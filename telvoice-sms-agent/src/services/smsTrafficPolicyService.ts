import { env } from "../config/env.js";
import {
  DEFAULT_TPS,
  MAX_CLIENT_TPS,
} from "../constants/sms-traffic.js";
import type { ResolvedTrafficPolicy } from "../types/sms-traffic.js";
import {
  getCompanyRatePlan,
  listActiveCompanyRatePlans,
} from "./companyRatePlanService.js";
import { getSmsProviderById } from "./smsProviderService.js";
import { getSmsRouteById } from "./smsRouteService.js";
import { getSmsRatePlanById } from "./smsRatePlanService.js";

const CLIENT_TPS_CAP_ERROR =
  "El TPS máximo permitido por cuenta cliente es 20.";

function safeTps(value: unknown, fallback = DEFAULT_TPS): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < DEFAULT_TPS) {
    return fallback;
  }
  return n;
}

/** Normaliza TPS cliente: nunca > 20. */
export function normalizeClientMaxTps(value: unknown): number {
  const n = safeTps(value, DEFAULT_TPS);
  return Math.min(n, MAX_CLIENT_TPS);
}

export function validateClientMaxTpsInput(value: unknown): {
  value: number;
  normalized: boolean;
  error?: string;
} {
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return { value: DEFAULT_TPS, normalized: true };
  }
  if (raw > MAX_CLIENT_TPS) {
    return {
      value: MAX_CLIENT_TPS,
      normalized: true,
      error: CLIENT_TPS_CAP_ERROR,
    };
  }
  if (raw < DEFAULT_TPS) {
    return { value: DEFAULT_TPS, normalized: true };
  }
  return { value: raw, normalized: false };
}

export function computeEffectiveTps(limits: {
  clientMaxTps: number;
  ratePlanTps: number;
  routeTps: number;
  providerTps: number;
  platformTps: number;
}): number {
  const cappedClient = Math.min(limits.clientMaxTps, MAX_CLIENT_TPS);
  const effective = Math.min(
    cappedClient,
    limits.ratePlanTps,
    limits.routeTps,
    limits.providerTps,
    limits.platformTps,
    MAX_CLIENT_TPS,
  );
  return Math.max(DEFAULT_TPS, effective);
}

function pickDailyLimit(...candidates: (number | null | undefined)[]): number | null {
  const active = candidates.filter(
    (v): v is number => v != null && Number.isFinite(v) && v > 0,
  );
  if (active.length === 0) {
    return null;
  }
  return Math.min(...active);
}

export async function resolveTrafficPolicy(input: {
  companyId: string;
  routeId?: string | null;
  providerId?: string | null;
  ratePlanId?: string | null;
  trafficType?: string;
  country?: string;
}): Promise<ResolvedTrafficPolicy> {
  const trafficType = (input.trafficType ?? "transactional").trim().toLowerCase();
  const country = (input.country ?? "CL").trim().toUpperCase();
  const platformTps = safeTps(env.smsPlatformMaxTps, 100);

  const assignment = await getCompanyRatePlan(
    input.companyId,
    country,
    trafficType,
  );

  const allAssignments = await listActiveCompanyRatePlans(
    input.companyId,
    country,
  );
  const mergeFrom = allAssignments.length > 0 ? allAssignments : assignment ? [assignment] : [];

  let clientMaxTps = safeTps(
    mergeFrom.reduce(
      (max, row) => Math.max(max, safeTps(row.max_tps, DEFAULT_TPS)),
      safeTps(assignment?.max_tps, DEFAULT_TPS),
    ),
    DEFAULT_TPS,
  );
  let liveEnabled = mergeFrom.some((row) => row.live_enabled === true);
  let campaignsEnabled = mergeFrom.some(
    (row) => row.campaigns_enabled === true,
  );
  let apiEnabled = mergeFrom.some((row) => row.api_enabled === true);
  let ratePlanId = input.ratePlanId ?? assignment?.rate_plan_id ?? null;
  let ratePlanTps = DEFAULT_TPS;
  let ratePlanDaily: number | null = null;
  let ratePlanMonthly: number | null = null;
  let clientDaily: number | null = assignment?.daily_limit ?? null;
  let clientMonthly: number | null = assignment?.monthly_limit ?? null;

  if (ratePlanId) {
    const plan = await getSmsRatePlanById(ratePlanId);
    if (plan) {
      ratePlanTps = safeTps(plan.default_tps, DEFAULT_TPS);
      ratePlanDaily = plan.daily_limit ?? null;
      ratePlanMonthly = plan.monthly_limit ?? null;
    }
  }

  let routeId = input.routeId ?? null;
  let routeTps = DEFAULT_TPS;
  let routeDaily: number | null = null;
  let providerId = input.providerId ?? null;

  if (routeId) {
    const route = await getSmsRouteById(routeId);
    if (route) {
      routeTps = safeTps(route.max_tps, DEFAULT_TPS);
      routeDaily = route.daily_limit ?? null;
      if (!providerId) {
        providerId = route.provider_id;
      }
    }
  }
  let providerTps = DEFAULT_TPS;
  let providerDaily: number | null = null;
  let providerMonthly: number | null = null;

  if (providerId) {
    const provider = await getSmsProviderById(providerId);
    if (provider) {
      providerTps = safeTps(provider.max_tps, DEFAULT_TPS);
      providerDaily = provider.daily_limit ?? null;
      providerMonthly = provider.monthly_limit ?? null;
    }
  }

  clientMaxTps = normalizeClientMaxTps(clientMaxTps);

  const effectiveTps = computeEffectiveTps({
    clientMaxTps,
    ratePlanTps,
    routeTps,
    providerTps,
    platformTps,
  });

  const daily_limit = pickDailyLimit(
    clientDaily,
    ratePlanDaily,
    routeDaily,
    providerDaily,
  );

  const monthly_limit = pickDailyLimit(
    clientMonthly,
    ratePlanMonthly,
    providerMonthly,
  );

  return {
    client_max_tps: clientMaxTps,
    rate_plan_tps: ratePlanTps,
    route_tps: routeTps,
    provider_tps: providerTps,
    platform_tps: platformTps,
    max_client_tps_cap: MAX_CLIENT_TPS,
    effective_tps: effectiveTps,
    daily_limit,
    monthly_limit,
    live_enabled: liveEnabled,
    campaigns_enabled: campaignsEnabled,
    api_enabled: apiEnabled,
    reason_if_blocked: null,
    company_id: input.companyId,
    rate_plan_id: ratePlanId,
    route_id: routeId,
    provider_id: providerId,
  };
}

export { CLIENT_TPS_CAP_ERROR };
