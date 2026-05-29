import type { NextFunction, Request, Response } from "express";
import {
  buildDefaultClientApiSettings,
  getClientApiSettings,
  getClientApiSettingsModuleState,
  recordWebhookTest,
  regenerateDemoApiKey,
  requestSmppAccess,
  updateClientWebhookSettings,
  validateWebhookEvents,
  validateWebhookUrl,
} from "../services/clientApiSettingsService.js";
import { isApiKeyPepperConfigured } from "../services/apiKeyCryptoService.js";
import {
  getClientApiKeysModuleState,
  listClientApiKeys,
} from "../services/clientApiKeyService.js";
import {
  getClientApiRequestsModuleState,
  listApiRequestLogs,
} from "../services/clientApiRequestLogService.js";
import type { AppApiPageData, WebhookEvent } from "../types/client-api-settings.js";
import { WEBHOOK_EVENTS } from "../types/client-api-settings.js";
import { canOperateClientPanel } from "../types/roles.js";
import { AppError } from "../utils/errors.js";
import { renderAppApiPage } from "../views/app-ui/app-api-page.js";
import { buildAppContext } from "./app.controller.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";

async function requireApiWriteContext(req: Request): Promise<AppPageContext | null> {
  const ctx = await buildAppContext(req);
  if (!ctx) return null;
  if (!canOperateClientPanel(ctx.profile.role)) return null;
  return ctx;
}

function parseWebhookEventsBody(body: unknown): WebhookEvent[] {
  if (Array.isArray(body)) {
    return validateWebhookEvents(body);
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.events)) {
      return validateWebhookEvents(o.events);
    }
    const list: WebhookEvent[] = [];
    for (const key of WEBHOOK_EVENTS) {
      if (o[key] === true) {
        list.push(key);
      }
    }
    return list;
  }
  return [];
}

export async function getAppApi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/login?next=%2Fapp%2Fapi");
      return;
    }

    const defaults = buildDefaultClientApiSettings();
    const module = await getClientApiSettingsModuleState();
    const keysModule = await getClientApiKeysModuleState();
    const requestsModule = await getClientApiRequestsModuleState();
    let pageData: AppApiPageData = {
      module,
      settings: defaults,
      syncSource: "defaults",
      hasStoredRecord: false,
      keysModule,
      keys: [],
      pepperConfigured: isApiKeyPepperConfigured(),
      requestsModule,
      recentApiRequests: [],
    };

    if (module.available && ctx.company.id) {
      const loaded = await getClientApiSettings(ctx.company.id, defaults);
      if (loaded.ok) {
        pageData = {
          module,
          settings: loaded.data.settings,
          syncSource: loaded.data.hasStoredRecord ? "supabase" : "defaults",
          hasStoredRecord: loaded.data.hasStoredRecord,
          keysModule,
          keys: pageData.keys,
          pepperConfigured: isApiKeyPepperConfigured(),
          requestsModule,
          recentApiRequests: pageData.recentApiRequests,
        };
      }
    }

    if (keysModule.available && ctx.company.id) {
      const listed = await listClientApiKeys(ctx.company.id);
      if (listed.ok) {
        pageData.keys = listed.data;
      }
    }

    if (requestsModule.available && ctx.company.id) {
      const logs = await listApiRequestLogs(ctx.company.id, { limit: 10 });
      const keyMap = new Map(
        (pageData.keys ?? []).map((k) => [k.id, k]),
      );
      pageData.recentApiRequests = logs.map((log) => {
        const key = log.apiKeyId ? keyMap.get(log.apiKeyId) : undefined;
        return {
          ...log,
          apiKeyName: key?.name ?? log.apiKeyName,
          apiKeyMasked: key?.keyMasked ?? log.apiKeyMasked,
        };
      });
    }

    res.type("html").send(renderAppApiPage(ctx, pageData));
  } catch (error) {
    next(error);
  }
}

export async function postAppApiKeyRegenerate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const module = await getClientApiSettingsModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend API no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const defaults = buildDefaultClientApiSettings();
    const result = await regenerateDemoApiKey(
      ctx.company.id,
      defaults,
      ctx.profile.authUserId ?? ctx.profile.profileId ?? null,
    );

    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({
      ok: true,
      settings: result.data,
      syncSource: "supabase",
      message: "Clave de demostración regenerada.",
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo regenerar la API Key.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppApiWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const module = await getClientApiSettingsModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend API no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl : "";
    const events = parseWebhookEventsBody(body.events ?? body);

    try {
      validateWebhookUrl(webhookUrl);
    } catch (error) {
      const msg = error instanceof AppError ? error.message : "URL inválida.";
      res.status(400).json({ ok: false, error: msg });
      return;
    }

    const defaults = buildDefaultClientApiSettings();
    const result = await updateClientWebhookSettings(
      ctx.company.id,
      defaults,
      { webhookUrl, webhookEvents: events },
      ctx.profile.authUserId ?? ctx.profile.profileId ?? null,
    );

    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({
      ok: true,
      settings: result.data,
      syncSource: "supabase",
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo guardar el webhook.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppApiWebhookTest(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const module = await getClientApiSettingsModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend API no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const defaults = buildDefaultClientApiSettings();
    const result = await recordWebhookTest(
      ctx.company.id,
      defaults,
      ctx.profile.authUserId ?? ctx.profile.profileId ?? null,
    );

    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({
      ok: true,
      settings: result.data,
      message:
        "Prueba registrada correctamente. La entrega real de webhooks será habilitada por Telvoice.",
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }
    const msg =
      error instanceof Error ? error.message : "No se pudo registrar la prueba.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppApiSmppRequest(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const module = await getClientApiSettingsModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend API no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const defaults = buildDefaultClientApiSettings();
    const result = await requestSmppAccess(
      ctx.company.id,
      defaults,
      ctx.profile.authUserId ?? ctx.profile.profileId ?? null,
    );

    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({
      ok: true,
      settings: result.data,
      message:
        "Tu solicitud SMPP fue registrada. El equipo Telvoice revisará factibilidad técnica y comercial.",
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo registrar la solicitud.";
    res.status(500).json({ ok: false, error: msg });
  }
}
