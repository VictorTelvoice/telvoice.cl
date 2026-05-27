import type { NextFunction, Request, Response } from "express";
import { pauseQueueByProvider, pauseQueueByRoute } from "../services/smsQueueService.js";
import { processQueueTick } from "../services/smsDispatchWorkerService.js";
import {
  pauseSmsProvider,
  resumeSmsProvider,
  updateSmsProvider,
} from "../services/smsProviderService.js";
import { pauseSmsRoute, resumeSmsRoute } from "../services/smsRouteService.js";
import { getTrafficControlDashboard } from "../services/smsTrafficMetricsService.js";
import {
  getSmsQueueRuntimeConfig,
  TEST13_REFERENCE_SCHEDULER,
  LOAD_TEST_REFERENCE_SCHEDULER,
} from "../services/smsQueueRuntimeConfigService.js";
import { saveSchedulerSettings } from "../services/platformRuntimeSettingsService.js";
import { validateUuidParam } from "../utils/validation.js";
import { renderSaTrafficControlPage } from "../views/admin-ui/sections/superadmin-traffic-pages.js";

function flash(req: Request): { flash?: string; error?: string } {
  return {
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function redirectQuery(res: Response, path: string, params: Record<string, string>): void {
  const q = new URLSearchParams(params).toString();
  res.redirect(302, q ? `${path}?${q}` : path);
}

export async function getSaQueueSchedulerConfigJson(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const config = await getSmsQueueRuntimeConfig();
    res.json(config);
  } catch (e) {
    next(e);
  }
}

export async function getSaTrafficControlPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dashboard = await getTrafficControlDashboard();
    res.type("html").send(
      renderSaTrafficControlPage({
        admin: req.adminUser!,
        dashboard,
        ...flash(req),
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function postUpdateQueueSchedulerSettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const presetTest13 = req.body.preset === "test13";
    const presetLoad = req.body.preset === "load5";
    const preset = presetTest13 || presetLoad;
    const ref = presetLoad
      ? LOAD_TEST_REFERENCE_SCHEDULER
      : TEST13_REFERENCE_SCHEDULER;
    const enabled =
      req.body.scheduler_enabled === "1" ||
      req.body.scheduler_enabled === "true" ||
      preset;
    const intervalSeconds = preset
      ? ref.intervalSeconds
      : Number(req.body.interval_seconds ?? 1);
    const batchSize = preset
      ? ref.batchSize
      : Number(req.body.batch_size ?? 20);
    const queueMinPaceSeconds = preset
      ? ref.queueMinPaceSeconds
      : Number(req.body.queue_min_pace_seconds ?? 3);
    const asmscMaxSendsPerTick = presetLoad
      ? LOAD_TEST_REFERENCE_SCHEDULER.asmscMaxSendsPerTick
      : Number(req.body.asmsc_max_sends_per_tick ?? 5);
    const asmscInterSendMs = presetLoad
      ? LOAD_TEST_REFERENCE_SCHEDULER.asmscInterSendMs
      : Number(req.body.asmsc_inter_send_ms ?? 200);

    await saveSchedulerSettings({
      enabled,
      intervalSeconds,
      batchSize,
      queueMinPaceSeconds,
      asmscMaxSendsPerTick,
      asmscInterSendMs,
    });

    redirectQuery(res, "/admin/traffic-control", {
      ok: presetLoad
        ? "Preset carga API (5 aSMSC/tick, pacing 1s) — aplica en ~3s"
        : presetTest13
          ? "Preset Test13 — aplica en ~3s sin reiniciar"
          : "Scheduler actualizado (aplica en ~3s sin reiniciar VPS)",
    });
  } catch (e) {
    redirectQuery(res, "/admin/traffic-control", {
      error: e instanceof Error ? e.message : "Error al guardar scheduler",
    });
  }
}

export async function postTrafficQueueProcessTick(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.body?.limit ?? 5)));
    const result = await processQueueTick(limit);
    redirectQuery(res, "/admin/traffic-control", {
      ok: `Tick manual: ${result.sent} enviados, ${result.deferred} diferidos, ${result.failed} fallidos`,
    });
  } catch (e) {
    redirectQuery(res, "/admin/traffic-control", {
      error: e instanceof Error ? e.message : "Error en tick",
    });
  }
}

export async function postPauseRoute(req: Request, res: Response): Promise<void> {
  const id = validateUuidParam(String(req.params.id), "id");
  try {
    await pauseSmsRoute(id);
    await pauseQueueByRoute(id);
    redirectQuery(res, "/admin/traffic-control", { ok: "Ruta pausada" });
  } catch (e) {
    redirectQuery(res, "/admin/routes", {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function postResumeRoute(req: Request, res: Response): Promise<void> {
  const id = validateUuidParam(String(req.params.id), "id");
  try {
    await resumeSmsRoute(id);
    redirectQuery(res, "/admin/traffic-control", { ok: "Ruta reanudada" });
  } catch (e) {
    redirectQuery(res, "/admin/routes", {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function postPauseProvider(
  req: Request,
  res: Response,
): Promise<void> {
  const id = validateUuidParam(String(req.params.id), "id");
  try {
    await pauseSmsProvider(id);
    await pauseQueueByProvider(id);
    redirectQuery(res, "/admin/traffic-control", { ok: "Proveedor pausado" });
  } catch (e) {
    redirectQuery(res, "/admin/providers", {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function postResumeProvider(
  req: Request,
  res: Response,
): Promise<void> {
  const id = validateUuidParam(String(req.params.id), "id");
  try {
    await resumeSmsProvider(id);
    redirectQuery(res, "/admin/traffic-control", { ok: "Proveedor reanudado" });
  } catch (e) {
    redirectQuery(res, "/admin/providers", {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function postUpdateProviderTraffic(
  req: Request,
  res: Response,
): Promise<void> {
  const id = validateUuidParam(String(req.params.id), "id");
  try {
    await updateSmsProvider(id, {
      max_tps: Number(req.body.max_tps ?? 1),
      max_concurrent_requests: Number(req.body.max_concurrent_requests ?? 1),
      daily_limit: req.body.daily_limit
        ? Number(req.body.daily_limit)
        : null,
      monthly_limit: req.body.monthly_limit
        ? Number(req.body.monthly_limit)
        : null,
      failure_threshold_percent: Number(
        req.body.failure_threshold_percent ?? 20,
      ),
      auto_pause_on_failure: req.body.auto_pause_on_failure === "1",
    });
    redirectQuery(res, `/admin/providers/${id}`, {
      ok: "Límites de vendor actualizados",
    });
  } catch (e) {
    redirectQuery(res, `/admin/providers/${id}`, {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}
