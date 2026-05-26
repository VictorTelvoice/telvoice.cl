import { env } from "../config/env.js";
import { MAX_CLIENT_TPS } from "../constants/sms-traffic.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { listCompanies } from "./companyService.js";
import { getCompanyRatePlan } from "./companyRatePlanService.js";
import { countQueueByStatus } from "./smsQueueService.js";
import { listSmsProviders } from "./smsProviderService.js";
import { listSmsRoutes } from "./smsRouteService.js";
import { resolveTrafficPolicy } from "./smsTrafficPolicyService.js";

export type TrafficControlDashboard = {
  platformMaxTps: number;
  maxClientTpsCap: number;
  queueCounts: Record<string, number>;
  sentLast5Min: number;
  failedLast5Min: number;
  pausedRoutes: { id: string; name: string; country: string }[];
  suspendedProviders: { id: string; name: string; code: string }[];
  topCompanies: { companyId: string; companyName: string; count: number }[];
  providerUsage: { providerId: string; name: string; count: number; maxTps: number }[];
  routeUsage: { routeId: string; name: string; count: number; maxTps: number }[];
  clientPolicies: {
    companyId: string;
    companyName: string;
    clientTps: number;
    effectiveTps: number;
    liveEnabled: boolean;
  }[];
  queueScheduler: {
    enabled: boolean;
    intervalSeconds: number;
    batchSize: number;
  };
};

function fiveMinutesAgoIso(): string {
  return new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

export async function getTrafficControlDashboard(): Promise<TrafficControlDashboard> {
  const since = fiveMinutesAgoIso();
  const queueCounts = await countQueueByStatus();

  let sentLast5Min = 0;
  let failedLast5Min = 0;
  let topCompanies: TrafficControlDashboard["topCompanies"] = [];
  let providerUsage: TrafficControlDashboard["providerUsage"] = [];
  let routeUsage: TrafficControlDashboard["routeUsage"] = [];

  const { data: recent, error: recentErr } = await getSupabase()
    .from("panel_sms_messages")
    .select("id, company_id, status, provider_id, route_id, created_at")
    .gte("created_at", since);

  if (recentErr && !isMissingTableError(recentErr)) {
    wrapSupabaseError(recentErr, "getTrafficControlDashboard.recent");
  }

  const rows = (recent ?? []) as {
    id: string;
    company_id: string;
    status: string;
    provider_id?: string | null;
    route_id?: string | null;
  }[];

  for (const r of rows) {
    if (["sent", "delivered", "pending", "accepted"].includes(r.status)) {
      sentLast5Min += 1;
    }
    if (r.status === "failed" || r.status === "rejected") {
      failedLast5Min += 1;
    }
  }

  const byCompany = new Map<string, number>();
  const byProvider = new Map<string, number>();
  const byRoute = new Map<string, number>();
  for (const r of rows) {
    if (!["sent", "delivered", "pending", "accepted"].includes(r.status)) {
      continue;
    }
    byCompany.set(r.company_id, (byCompany.get(r.company_id) ?? 0) + 1);
    if (r.provider_id) {
      byProvider.set(r.provider_id, (byProvider.get(r.provider_id) ?? 0) + 1);
    }
    if (r.route_id) {
      byRoute.set(r.route_id, (byRoute.get(r.route_id) ?? 0) + 1);
    }
  }

  const companies = await listCompanies(50);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  topCompanies = [...byCompany.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([companyId, count]) => ({
      companyId,
      companyName: companyName.get(companyId) ?? companyId.slice(0, 8),
      count,
    }));

  const providers = await listSmsProviders();
  const provMap = new Map(providers.map((p) => [p.id, p]));
  providerUsage = [...byProvider.entries()].map(([providerId, count]) => {
    const p = provMap.get(providerId);
    return {
      providerId,
      name: p?.name ?? providerId.slice(0, 8),
      count,
      maxTps: Number(p?.max_tps ?? 1),
    };
  });

  const routes = await listSmsRoutes();
  const routeMap = new Map(routes.map((r) => [r.id, r]));
  routeUsage = [...byRoute.entries()].map(([routeId, count]) => {
    const r = routeMap.get(routeId);
    return {
      routeId,
      name: r?.name ?? routeId.slice(0, 8),
      count,
      maxTps: Number(r?.max_tps ?? 1),
    };
  });

  const pausedRoutes = routes
    .filter((r) => r.status === "paused")
    .map((r) => ({ id: r.id, name: r.name, country: r.country }));

  const suspendedProviders = providers
    .filter((p) => p.status === "suspended" || p.status === "inactive")
    .map((p) => ({ id: p.id, name: p.name, code: p.code }));

  const clientPolicies: TrafficControlDashboard["clientPolicies"] = [];
  for (const c of companies.slice(0, 20)) {
    const assignment = await getCompanyRatePlan(c.id);
    if (!assignment) {
      continue;
    }
    const policy = await resolveTrafficPolicy({
      companyId: c.id,
      ratePlanId: assignment.rate_plan_id,
    });
    clientPolicies.push({
      companyId: c.id,
      companyName: c.name,
      clientTps: policy.client_max_tps,
      effectiveTps: policy.effective_tps,
      liveEnabled: policy.live_enabled,
    });
  }

  return {
    platformMaxTps: env.smsPlatformMaxTps,
    maxClientTpsCap: MAX_CLIENT_TPS,
    queueCounts,
    sentLast5Min,
    failedLast5Min,
    pausedRoutes,
    suspendedProviders,
    topCompanies,
    providerUsage,
    routeUsage,
    clientPolicies,
    queueScheduler: {
      enabled: env.smsQueueScheduler.enabled,
      intervalSeconds: env.smsQueueScheduler.intervalSeconds,
      batchSize: env.smsQueueScheduler.batchSize,
    },
  };
}
