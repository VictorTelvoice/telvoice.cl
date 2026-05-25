import { env } from "../config/env.js";
import { processQueueTick } from "./smsDispatchWorkerService.js";

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

/**
 * Procesa la cola sms_send_queue en intervalo fijo (envíos programados y diferidos por TPS).
 * Equivalente al cron del panel superadmin, pero sin intervención manual.
 */
export function startSmsQueueScheduler(): void {
  if (!env.smsQueueScheduler.enabled) {
    console.info("[sms-queue] Scheduler deshabilitado (SMS_QUEUE_SCHEDULER_ENABLED=false).");
    return;
  }

  if (!env.supabase.url || !env.supabase.serviceRoleKey) {
    console.warn(
      "[sms-queue] Scheduler no iniciado: Supabase no configurado.",
    );
    return;
  }

  if (!env.smsProvider.liveTestEnabled) {
    console.warn(
      "[sms-queue] Scheduler no iniciado: SMS_LIVE_TEST_ENABLED=false.",
    );
    return;
  }

  const intervalMs = env.smsQueueScheduler.intervalSeconds * 1000;
  const batchSize = env.smsQueueScheduler.batchSize;

  const runTick = async (): Promise<void> => {
    if (tickInFlight) {
      return;
    }
    tickInFlight = true;
    try {
      const result = await processQueueTick(batchSize, "scheduler");
      if (result.sent > 0 || result.failed > 0) {
        console.info(
          `[sms-queue] tick: ${result.sent} enviados, ${result.failed} fallidos, ${result.deferred} diferidos (proc. ${result.processed})`,
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
  };

  void runTick();
  intervalHandle = setInterval(() => {
    void runTick();
  }, intervalMs);

  console.info(
    `[sms-queue] Scheduler activo: cada ${env.smsQueueScheduler.intervalSeconds}s, batch=${batchSize}`,
  );
}

export function stopSmsQueueScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
