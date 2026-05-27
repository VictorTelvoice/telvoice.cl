import { env } from "../config/env.js";
import { getEffectiveSchedulerConfigCached } from "../services/platformRuntimeSettingsService.js";
import type { ResolvedTrafficPolicy } from "../types/sms-traffic.js";

export type CampaignTpsPolicySnapshot = {
  client_max_tps: number;
  route_max_tps: number;
  provider_max_tps: number;
  platform_max_tps: number;
  rate_plan_tps: number;
  max_client_tps_cap: number;
  effective_tps: number;
};

export type CampaignTpsTraceability = {
  effectiveTps: number | null;
  requestedTps: number | null;
  schedulerBatchSize: number | null;
  schedulerIntervalSeconds: number | null;
  legacyTargetTpsWarning: string | null;
  requestedLimitedWarning: string | null;
};

/** Normaliza TPS solicitado por UI/API al techo operativo. */
export function capRequestedTps(
  requested: number | null | undefined,
  policy: ResolvedTrafficPolicy,
): number | null {
  if (requested == null || !Number.isFinite(requested) || requested <= 0) {
    return null;
  }
  const capped = Math.min(
    requested,
    policy.effective_tps,
    policy.client_max_tps,
    policy.max_client_tps_cap,
  );
  return capped;
}

export function buildTpsPolicySnapshot(
  policy: ResolvedTrafficPolicy,
): CampaignTpsPolicySnapshot {
  return {
    client_max_tps: policy.client_max_tps,
    route_max_tps: policy.route_tps,
    provider_max_tps: policy.provider_tps,
    platform_max_tps: policy.platform_tps,
    rate_plan_tps: policy.rate_plan_tps,
    max_client_tps_cap: policy.max_client_tps_cap,
    effective_tps: policy.effective_tps,
  };
}

/**
 * Metadata TPS para campañas programadas/masivas (Etapa 7.2).
 * `target_tps` en campañas nuevas = effective_tps (ya no batch size).
 */
export async function buildCampaignTpsMetadataFields(input: {
  policy: ResolvedTrafficPolicy;
  requestedTps?: number | null;
}): Promise<Record<string, unknown>> {
  const effectiveTps = input.policy.effective_tps;
  const requestedTps = capRequestedTps(input.requestedTps, input.policy);
  const schedulerCfg = await getEffectiveSchedulerConfigCached();
  const schedulerBatchSize = schedulerCfg.batchSize;
  const schedulerIntervalSeconds = schedulerCfg.intervalSeconds;

  return {
    requested_tps: requestedTps,
    effective_tps: effectiveTps,
    scheduler_batch_size: schedulerBatchSize,
    scheduler_interval_seconds: schedulerIntervalSeconds,
    tps_policy: buildTpsPolicySnapshot(input.policy),
    /** @deprecated En campañas antiguas podía ser batch size; nuevas campañas = effective_tps. */
    target_tps: effectiveTps,
    target_tps_semantics: "effective_tps",
  };
}

function numMeta(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Detecta metadata antigua donde target_tps guardaba batch del scheduler. */
export function isLegacyTargetTpsBatchMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const meta = metadata ?? {};
  const target = numMeta(meta.target_tps);
  const effective = numMeta(meta.effective_tps);
  const batch = numMeta(meta.scheduler_batch_size);
  if (target == null) {
    return false;
  }
  if (effective != null) {
    return false;
  }
  if (meta.target_tps_semantics === "effective_tps") {
    return false;
  }
  if (batch != null && target === batch) {
    return true;
  }
  if (target === env.smsQueueScheduler.batchSize) {
    return true;
  }
  if (target > 20) {
    return true;
  }
  // Pre Etapa 7.2: target_tps en campaña sin effective_tps ni scheduler_batch_size explícito
  if (meta.scheduler_batch_size == null) {
    return true;
  }
  return false;
}

export function interpretCampaignTpsMetadata(
  metadata: Record<string, unknown> | null | undefined,
): CampaignTpsTraceability {
  const meta = metadata ?? {};
  const effectiveTps =
    numMeta(meta.effective_tps) ??
    (isLegacyTargetTpsBatchMetadata(meta) ? null : numMeta(meta.target_tps));
  const requestedTps = numMeta(meta.requested_tps);
  const schedulerBatchSize =
    numMeta(meta.scheduler_batch_size) ??
    (isLegacyTargetTpsBatchMetadata(meta) ? numMeta(meta.target_tps) : null);
  const schedulerIntervalSeconds = numMeta(meta.scheduler_interval_seconds);

  let legacyTargetTpsWarning: string | null = null;
  if (isLegacyTargetTpsBatchMetadata(meta)) {
    legacyTargetTpsWarning =
      "target_tps antiguo parece batch del scheduler, no TPS efectivo. Ver effective_tps o política actual.";
  }

  let requestedLimitedWarning: string | null = null;
  if (
    requestedTps != null &&
    effectiveTps != null &&
    requestedTps > effectiveTps
  ) {
    requestedLimitedWarning =
      "El TPS solicitado fue limitado por la política operativa.";
  }

  return {
    effectiveTps,
    requestedTps,
    schedulerBatchSize,
    schedulerIntervalSeconds,
    legacyTargetTpsWarning,
    requestedLimitedWarning,
  };
}
