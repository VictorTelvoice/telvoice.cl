import { env } from "../config/env.js";
import { getEffectiveSchedulerConfigCached } from "./platformRuntimeSettingsService.js";
import { processQueueTick } from "./smsDispatchWorkerService.js";

let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let tickInFlight = false;
let started = false;

/**
 * Procesa la cola sms_send_queue con intervalo dinámico (BD override > .env).
 * No requiere reiniciar el proceso al cambiar intervalo/batch desde Superadmin.
 */
export function startSmsQueueScheduler(): void {
  void startSmsQueueSchedulerAsync();
}

async function startSmsQueueSchedulerAsync(): Promise<void> {
  if (started) {
    return;
  }
  started = true;

  if (!env.supabase.url || !env.supabase.serviceRoleKey) {
    console.warn(
      "[sms-queue] Scheduler no iniciado: Supabase no configurado.",
    );
    return;
  }

  if (!env.smsCampaign.enabled && !env.smsProvider.liveTestEnabled) {
    console.warn(
      "[sms-queue] Scheduler no iniciado: SMS_CAMPAIGN_ENABLED=false y SMS_LIVE_TEST_ENABLED=false.",
    );
    return;
  }

  const scheduleNext = (delayMs: number): void => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    timeoutHandle = setTimeout(() => {
      void runLoop();
    }, delayMs);
  };

  const runLoop = async (): Promise<void> => {
    const cfg = await getEffectiveSchedulerConfigCached();

    if (!cfg.enabled) {
      scheduleNext(10_000);
      return;
    }

    if (!tickInFlight) {
      tickInFlight = true;
      try {
        const result = await processQueueTick(cfg.batchSize, "scheduler");
        if (result.sent > 0 || result.failed > 0) {
          console.info(
            `[sms-queue] tick: ${result.sent} enviados, ${result.failed} fallidos, ${result.deferred} diferidos (proc. ${result.processed}) · ${cfg.intervalSeconds}s/${cfg.batchSize} (${cfg.source})`,
          );
        }
      } catch (err) {
        console.error(
          "[sms-queue] tick error:",
          err instanceof Error ? err.message : err,
        );
      } finally {
        tickInFlight = false;
      }
    }

    scheduleNext(Math.max(500, cfg.intervalSeconds * 1000));
  };

  const initial = await getEffectiveSchedulerConfigCached();
  console.info(
    `[sms-queue] Scheduler loop: enabled=${initial.enabled}, interval=${initial.intervalSeconds}s, batch=${initial.batchSize}, fuente=${initial.source}`,
  );
  if (!env.smsProvider.liveTestEnabled && env.smsCampaign.enabled) {
    console.info(
      "[sms-queue] Scheduler activo para campañas (SMS_LIVE_TEST_ENABLED=false).",
    );
  }

  void runLoop();
}

export function stopSmsQueueScheduler(): void {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  started = false;
}
