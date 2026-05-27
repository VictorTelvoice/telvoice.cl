import { env } from "../config/env.js";
import { getEffectiveSchedulerConfigCached } from "../services/platformRuntimeSettingsService.js";

/** Intervalo entre ítems encolados (ms), alineado con TPS efectivo y Test12/13. */
export function campaignQueuePaceMs(
  effectiveTps: number,
  minPaceMs?: number,
): number {
  const floor = minPaceMs ?? env.smsCampaign.queueMinPaceMs;
  const fromTps = Math.ceil(1000 / Math.max(1, effectiveTps));
  return Math.max(floor, fromTps);
}

export async function resolveCampaignQueueMinPaceMs(): Promise<number> {
  const cfg = await getEffectiveSchedulerConfigCached();
  return cfg.queueMinPaceMs;
}

export function staggeredQueueScheduledAt(
  baseScheduledAt: string,
  index: number,
  effectiveTps: number,
  minPaceMs?: number,
): string {
  const baseMs = Date.parse(baseScheduledAt);
  const at = baseMs + index * campaignQueuePaceMs(effectiveTps, minPaceMs);
  return new Date(at).toISOString();
}
