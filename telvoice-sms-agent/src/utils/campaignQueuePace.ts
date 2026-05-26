import { env } from "../config/env.js";

/** Intervalo entre ítems encolados (ms), alineado con TPS efectivo y Test12/13. */
export function campaignQueuePaceMs(effectiveTps: number): number {
  const fromTps = Math.ceil(1000 / Math.max(1, effectiveTps));
  return Math.max(env.smsCampaign.queueMinPaceMs, fromTps);
}

export function staggeredQueueScheduledAt(
  baseScheduledAt: string,
  index: number,
  effectiveTps: number,
): string {
  const baseMs = Date.parse(baseScheduledAt);
  const at = baseMs + index * campaignQueuePaceMs(effectiveTps);
  return new Date(at).toISOString();
}
