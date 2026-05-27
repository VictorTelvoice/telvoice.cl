import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import {
  getEffectiveSchedulerConfig,
  type EffectiveSchedulerConfig,
} from "./platformRuntimeSettingsService.js";

/** Valores de referencia cuando Test12/13 despacharon bien (~3s entre envíos). */
export const TEST13_REFERENCE_SCHEDULER = {
  intervalSeconds: 1,
  batchSize: 20,
  queueMinPaceSeconds: 3,
} as const;

/** Prueba de carga API proveedor (~5 SMS/s teórico con latencia API). */
export const LOAD_TEST_REFERENCE_SCHEDULER = {
  intervalSeconds: 1,
  batchSize: 20,
  queueMinPaceSeconds: 1,
  asmscMaxSendsPerTick: 5,
  asmscInterSendMs: 200,
} as const;

export type SmsQueueRuntimeHealth = "ok" | "slow" | "critical" | "disabled";

export type SmsQueueRuntimeConfig = {
  health: SmsQueueRuntimeHealth;
  warnings: string[];
  scheduler: {
    enabled: boolean;
    intervalSeconds: number;
    batchSize: number;
    source: EffectiveSchedulerConfig["source"];
    envFallback: {
      enabled: boolean;
      intervalSeconds: number;
      batchSize: number;
    };
    env: {
      enabled: string;
      intervalSeconds: string;
      batchSize: string;
    };
  };
  campaignQueue: {
    enabled: boolean;
    trafficType: string;
    bulkQueueMinRecipients: number;
    queueMinPaceSeconds: number;
    queueMinPaceMs: number;
    env: {
      enabled: string;
      trafficType: string;
      bulkQueueMinRecipients: string;
      queueMinPaceSeconds: string;
    };
  };
  dispatchGuards: {
    asmscMaxSendsPerTick: number;
    asmscInterSendMs: number;
    asmscInProcessProviderLock: boolean;
    queueItemsStaggeredOnEnqueue: boolean;
    ipWhitelistRetriesWithBackoff: boolean;
  };
  referenceTest13: typeof TEST13_REFERENCE_SCHEDULER & {
    note: string;
  };
  estimatedThroughput: {
    maxAsmscSendsPerMinuteWithCurrentInterval: number;
    description: string;
  };
  recentCampaignSnapshots: {
    name: string;
    createdAt: string;
    source: string | null;
    sendMode: string | null;
    schedulerIntervalSeconds: number | null;
    schedulerBatchSize: number | null;
    effectiveTps: number | null;
  }[];
};

function buildWarnings(
  intervalSeconds: number,
  enabled: boolean,
): { health: SmsQueueRuntimeHealth; warnings: string[] } {
  const warnings: string[] = [];
  if (!enabled) {
    warnings.push(
      "Scheduler desactivado: solo se procesa la cola con «Procesar tick manual» o activar scheduler en Tráfico / TPS.",
    );
    return { health: "disabled", warnings };
  }
  if (intervalSeconds >= 60) {
    warnings.push(
      `Intervalo ${intervalSeconds}s: con serialización aSMSC (1 envío/tick) equivale a ~1 SMS/minuto. Test23 usó este valor y tardó mucho.`,
    );
    return { health: "critical", warnings };
  }
  if (intervalSeconds > 5) {
    warnings.push(
      `Intervalo ${intervalSeconds}s es lento frente a Test13 (1s). Las campañas masivas tardarán más de lo esperado.`,
    );
    return { health: "slow", warnings };
  }
  if (intervalSeconds !== TEST13_REFERENCE_SCHEDULER.intervalSeconds) {
    warnings.push(
      `Intervalo actual ${intervalSeconds}s ≠ referencia Test13 (${TEST13_REFERENCE_SCHEDULER.intervalSeconds}s).`,
    );
  }
  return { health: "ok", warnings };
}

export async function getRecentCampaignSchedulerSnapshots(
  limit = 8,
): Promise<SmsQueueRuntimeConfig["recentCampaignSnapshots"]> {
  const { data, error } = await getSupabase()
    .from("sms_campaigns")
    .select("name, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    return [];
  }

  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      name: String(row.name ?? "—"),
      createdAt: String(row.created_at ?? ""),
      source: typeof meta.source === "string" ? meta.source : null,
      sendMode: typeof meta.send_mode === "string" ? meta.send_mode : null,
      schedulerIntervalSeconds:
        typeof meta.scheduler_interval_seconds === "number"
          ? meta.scheduler_interval_seconds
          : null,
      schedulerBatchSize:
        typeof meta.scheduler_batch_size === "number"
          ? meta.scheduler_batch_size
          : null,
      effectiveTps:
        typeof meta.effective_tps === "number" ? meta.effective_tps : null,
    };
  });
}

/** Config efectiva: override en BD (Superadmin) > variables de entorno del proceso. */
export async function getSmsQueueRuntimeConfig(): Promise<SmsQueueRuntimeConfig> {
  const effective = await getEffectiveSchedulerConfig();
  const intervalSeconds = effective.intervalSeconds;
  const batchSize = effective.batchSize;
  const enabled = effective.enabled;
  const { health, warnings } = buildWarnings(intervalSeconds, enabled);

  const paceSeconds = effective.queueMinPaceSeconds;
  const paceMs = effective.queueMinPaceMs;

  const maxPerMinute = enabled
    ? Math.floor(60 / Math.max(1, intervalSeconds))
    : 0;

  const snapshots = await getRecentCampaignSchedulerSnapshots(8);

  const matchesTest13 =
    enabled &&
    intervalSeconds === TEST13_REFERENCE_SCHEDULER.intervalSeconds &&
    batchSize >= TEST13_REFERENCE_SCHEDULER.batchSize;

  if (!matchesTest13 && enabled) {
    warnings.push(
      `Para alinear con Test13: intervalo ${TEST13_REFERENCE_SCHEDULER.intervalSeconds}s, batch ${TEST13_REFERENCE_SCHEDULER.batchSize}, pacing ${TEST13_REFERENCE_SCHEDULER.queueMinPaceSeconds}s (editable en Tráfico / TPS).`,
    );
  }

  if (effective.source === "database") {
    warnings.push(
      "Scheduler controlado desde Superadmin (platform_runtime_settings). Los cambios aplican en ~3s sin reiniciar el VPS.",
    );
  } else if (intervalSeconds >= 60 || intervalSeconds > 5) {
    warnings.push(
      "Sin override en BD: edite en Tráfico / TPS o defina SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS=1 en el VPS.",
    );
  }

  return {
    health,
    warnings,
    scheduler: {
      enabled,
      intervalSeconds,
      batchSize,
      source: effective.source,
      envFallback: {
        enabled: env.smsQueueScheduler.enabled,
        intervalSeconds: env.smsQueueScheduler.intervalSeconds,
        batchSize: env.smsQueueScheduler.batchSize,
      },
      env: {
        enabled: "SMS_QUEUE_SCHEDULER_ENABLED",
        intervalSeconds: "SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS",
        batchSize: "SMS_QUEUE_SCHEDULER_BATCH_SIZE",
      },
    },
    campaignQueue: {
      enabled: env.smsCampaign.enabled,
      trafficType: env.smsCampaign.trafficType,
      bulkQueueMinRecipients: env.smsCampaign.bulkQueueMinRecipients,
      queueMinPaceSeconds: paceSeconds,
      queueMinPaceMs: paceMs,
      env: {
        enabled: "SMS_CAMPAIGN_ENABLED",
        trafficType: "SMS_CAMPAIGN_TRAFFIC_TYPE",
        bulkQueueMinRecipients: "SMS_CAMPAIGN_BULK_QUEUE_MIN_RECIPIENTS",
        queueMinPaceSeconds: "SMS_CAMPAIGN_QUEUE_MIN_PACE_SECONDS",
      },
    },
    dispatchGuards: {
      asmscMaxSendsPerTick: effective.asmscMaxSendsPerTick,
      asmscInterSendMs: effective.asmscInterSendMs,
      asmscInProcessProviderLock: true,
      queueItemsStaggeredOnEnqueue: true,
      ipWhitelistRetriesWithBackoff: true,
    },
    referenceTest13: {
      ...TEST13_REFERENCE_SCHEDULER,
      note: "Test13 encoló todos con el mismo scheduled_at; el worker los despachó uno tras otro cada ~2–3s con scheduler a 1s.",
    },
    estimatedThroughput: {
      maxAsmscSendsPerMinuteWithCurrentInterval: maxPerMinute,
      description: enabled
        ? `Con 1 envío aSMSC por tick y intervalo ${intervalSeconds}s, techo ~${maxPerMinute} SMS/min por proveedor en este proceso (${effective.source}).`
        : "Scheduler off — sin throughput automático.",
    },
    recentCampaignSnapshots: snapshots,
  };
}
