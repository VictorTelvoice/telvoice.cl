import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export const PLATFORM_SCHEDULER_KEY = "sms_queue_scheduler";

export type SchedulerSettingsValue = {
  enabled?: boolean;
  interval_seconds?: number;
  batch_size?: number;
  queue_min_pace_seconds?: number;
  /** Envíos aSMSC secuenciales máximos por tick del scheduler (prueba de carga API). */
  asmsc_max_sends_per_tick?: number;
  /** Pausa ms entre envíos aSMSC en el mismo tick (anti-ráfaga IP). */
  asmsc_inter_send_ms?: number;
};

export type EffectiveSchedulerConfig = {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
  queueMinPaceSeconds: number;
  queueMinPaceMs: number;
  asmscMaxSendsPerTick: number;
  asmscInterSendMs: number;
  source: "database" | "env";
};

const DEFAULT_ASMSC_MAX_PER_TICK = 5;
const DEFAULT_ASMSC_INTER_SEND_MS = 200;

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function getPlatformSetting(
  key: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await getSupabase()
    .from("platform_runtime_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getPlatformSetting");
  }
  const value = data?.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export async function upsertPlatformSetting(
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  const { error } = await getSupabase().from("platform_runtime_settings").upsert(
    { key, value },
    { onConflict: "key" },
  );

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        "Migración 025 no aplicada (platform_runtime_settings). Ejecute npm run migrate:025.",
      );
    }
    wrapSupabaseError(error, "upsertPlatformSetting");
  }
}

/** Config efectiva del scheduler: BD override > .env */
let configCache: { at: number; config: EffectiveSchedulerConfig } | null = null;
const CONFIG_CACHE_MS = 3000;

export function invalidateSchedulerConfigCache(): void {
  configCache = null;
}

export async function getEffectiveSchedulerConfigCached(): Promise<EffectiveSchedulerConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_CACHE_MS) {
    return configCache.config;
  }
  const config = await getEffectiveSchedulerConfig();
  configCache = { at: Date.now(), config };
  return config;
}

export async function getEffectiveSchedulerConfig(): Promise<EffectiveSchedulerConfig> {
  const db = await getPlatformSetting(PLATFORM_SCHEDULER_KEY);
  const fromDb = db as SchedulerSettingsValue | null;

  if (fromDb && Object.keys(fromDb).length > 0) {
    const paceSec = clampInt(
      Number(fromDb.queue_min_pace_seconds ?? env.smsCampaign.queueMinPaceMs / 1000),
      1,
      120,
    );
    return {
      enabled: fromDb.enabled ?? env.smsQueueScheduler.enabled,
      intervalSeconds: clampInt(
        Number(fromDb.interval_seconds ?? env.smsQueueScheduler.intervalSeconds),
        1,
        300,
      ),
      batchSize: clampInt(
        Number(fromDb.batch_size ?? env.smsQueueScheduler.batchSize),
        1,
        100,
      ),
      queueMinPaceSeconds: paceSec,
      queueMinPaceMs: paceSec * 1000,
      asmscMaxSendsPerTick: clampInt(
        Number(fromDb.asmsc_max_sends_per_tick ?? DEFAULT_ASMSC_MAX_PER_TICK),
        1,
        10,
      ),
      asmscInterSendMs: clampInt(
        Number(fromDb.asmsc_inter_send_ms ?? DEFAULT_ASMSC_INTER_SEND_MS),
        0,
        2000,
      ),
      source: "database",
    };
  }

  const paceSec = Math.round(env.smsCampaign.queueMinPaceMs / 1000);
  return {
    enabled: env.smsQueueScheduler.enabled,
    intervalSeconds: env.smsQueueScheduler.intervalSeconds,
    batchSize: env.smsQueueScheduler.batchSize,
    queueMinPaceSeconds: paceSec,
    queueMinPaceMs: env.smsCampaign.queueMinPaceMs,
    asmscMaxSendsPerTick: DEFAULT_ASMSC_MAX_PER_TICK,
    asmscInterSendMs: DEFAULT_ASMSC_INTER_SEND_MS,
    source: "env",
  };
}

export async function saveSchedulerSettings(input: {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
  queueMinPaceSeconds: number;
  asmscMaxSendsPerTick?: number;
  asmscInterSendMs?: number;
}): Promise<EffectiveSchedulerConfig> {
  const existing = (await getPlatformSetting(PLATFORM_SCHEDULER_KEY)) as
    | SchedulerSettingsValue
    | null;
  const value: SchedulerSettingsValue = {
    ...existing,
    enabled: input.enabled,
    interval_seconds: clampInt(input.intervalSeconds, 1, 300),
    batch_size: clampInt(input.batchSize, 1, 100),
    queue_min_pace_seconds: clampInt(input.queueMinPaceSeconds, 1, 120),
    asmsc_max_sends_per_tick: clampInt(
      Number(
        input.asmscMaxSendsPerTick ??
          existing?.asmsc_max_sends_per_tick ??
          DEFAULT_ASMSC_MAX_PER_TICK,
      ),
      1,
      10,
    ),
    asmsc_inter_send_ms: clampInt(
      Number(
        input.asmscInterSendMs ??
          existing?.asmsc_inter_send_ms ??
          DEFAULT_ASMSC_INTER_SEND_MS,
      ),
      0,
      2000,
    ),
  };
  await upsertPlatformSetting(PLATFORM_SCHEDULER_KEY, value);
  invalidateSchedulerConfigCache();
  return getEffectiveSchedulerConfig();
}
