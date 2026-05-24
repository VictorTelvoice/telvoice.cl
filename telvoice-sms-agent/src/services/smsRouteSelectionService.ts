import type {
  CompanyRatePlanRow,
  SmsRatePlanDetailEnriched,
  SmsRatePlanRow,
} from "../types/sms-routing.js";
import { AppError } from "../utils/errors.js";

export type SmsRoutingMode = "single" | "weighted" | "round_robin";

export type CompanyRoutingPolicy = {
  allowedProviderIds: string[];
  blockedProviderIds: string[];
};

const rrCounters = new Map<string, number>();

function parseUuidList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((v) => String(v).trim())
    .filter(Boolean);
}

export function routingModeFromPlan(plan: SmsRatePlanRow): SmsRoutingMode {
  const raw = plan.metadata?.routing_mode;
  if (raw === "weighted" || raw === "round_robin" || raw === "single") {
    return raw;
  }
  return "single";
}

export function companyRoutingPolicyFromAssignment(
  assignment: CompanyRatePlanRow | null | undefined,
): CompanyRoutingPolicy {
  const meta = assignment?.metadata ?? {};
  return {
    allowedProviderIds: parseUuidList(meta.allowed_provider_ids),
    blockedProviderIds: parseUuidList(meta.blocked_provider_ids),
  };
}

export function buildCompanyRoutingMetadata(input: {
  allowedProviderIds?: string[];
  blockedProviderIds?: string[];
}): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (input.allowedProviderIds && input.allowedProviderIds.length > 0) {
    meta.allowed_provider_ids = input.allowedProviderIds;
  }
  if (input.blockedProviderIds && input.blockedProviderIds.length > 0) {
    meta.blocked_provider_ids = input.blockedProviderIds;
  }
  return meta;
}

function detailWeight(detail: SmsRatePlanDetailEnriched): number {
  const raw = detail.metadata?.weight;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return 100;
  }
  return n;
}

function providerIdOf(detail: SmsRatePlanDetailEnriched): string | null {
  return detail.route?.provider_id ?? detail.provider?.id ?? null;
}

function isDetailRoutable(detail: SmsRatePlanDetailEnriched): boolean {
  if (detail.status !== "active") {
    return false;
  }
  if (!detail.route_id || !detail.route) {
    return false;
  }
  if (detail.route.status !== "active") {
    return false;
  }
  const prov = detail.provider;
  if (prov && "status" in prov && prov.status !== "active") {
    return false;
  }
  return true;
}

export function filterDetailsForCompany(
  details: SmsRatePlanDetailEnriched[],
  input: {
    country: string;
    trafficType: string;
    policy: CompanyRoutingPolicy;
  },
): SmsRatePlanDetailEnriched[] {
  const country = input.country.toUpperCase();

  return details.filter((detail) => {
    if (!isDetailRoutable(detail)) {
      return false;
    }
    if (detail.country.toUpperCase() !== country) {
      return false;
    }
    if (
      detail.traffic_type !== input.trafficType &&
      detail.traffic_type !== "mixed"
    ) {
      return false;
    }

    const providerId = providerIdOf(detail);
    if (!providerId) {
      return false;
    }

    if (input.policy.blockedProviderIds.includes(providerId)) {
      return false;
    }

    if (
      input.policy.allowedProviderIds.length > 0 &&
      !input.policy.allowedProviderIds.includes(providerId)
    ) {
      return false;
    }

    return true;
  });
}

function pickSingleRoute(
  candidates: SmsRatePlanDetailEnriched[],
): SmsRatePlanDetailEnriched {
  const withDefault = candidates.find((d) => d.route?.is_default);
  if (withDefault) {
    return withDefault;
  }

  const sorted = [...candidates].sort((a, b) => {
    const pa = Number(a.route?.priority ?? 100);
    const pb = Number(b.route?.priority ?? 100);
    return pa - pb;
  });
  return sorted[0]!;
}

function pickWeightedRoute(
  candidates: SmsRatePlanDetailEnriched[],
): SmsRatePlanDetailEnriched {
  const weights = candidates.map((c) => detailWeight(c));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return pickSingleRoute(candidates);
  }

  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      return candidates[i]!;
    }
  }
  return candidates[candidates.length - 1]!;
}

function pickRoundRobinRoute(
  candidates: SmsRatePlanDetailEnriched[],
  bucketKey: string,
): SmsRatePlanDetailEnriched {
  const weights = candidates.map((c) => detailWeight(c));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return pickSingleRoute(candidates);
  }

  const current = rrCounters.get(bucketKey) ?? 0;
  let cursor = current % total;
  rrCounters.set(bucketKey, current + 1);

  for (let i = 0; i < candidates.length; i++) {
    cursor -= weights[i]!;
    if (cursor < 0) {
      return candidates[i]!;
    }
  }
  return candidates[candidates.length - 1]!;
}

/** Selecciona el detalle tarifario según modo del plan y política del cliente. */
export function selectRatePlanDetail(input: {
  ratePlan: SmsRatePlanRow;
  details: SmsRatePlanDetailEnriched[];
  assignment: CompanyRatePlanRow | null;
  country: string;
  trafficType: string;
  companyId: string;
}): SmsRatePlanDetailEnriched {
  const policy = companyRoutingPolicyFromAssignment(input.assignment);
  const candidates = filterDetailsForCompany(input.details, {
    country: input.country,
    trafficType: input.trafficType,
    policy,
  });

  if (candidates.length === 0) {
    throw new AppError(
      "No hay rutas SMS disponibles para este cliente/destino (revise rate plan y proveedores permitidos).",
      400,
    );
  }

  const mode = routingModeFromPlan(input.ratePlan);

  if (mode === "single" || candidates.length === 1) {
    return pickSingleRoute(candidates);
  }

  if (mode === "round_robin") {
    const bucketKey = `${input.companyId}:${input.ratePlan.id}:${input.country}:${input.trafficType}`;
    return pickRoundRobinRoute(candidates, bucketKey);
  }

  return pickWeightedRoute(candidates);
}

/** Expuesto para tests — reinicia contadores round-robin en memoria. */
export function resetRouteSelectionCountersForTests(): void {
  rrCounters.clear();
}
