import type { NextFunction, Request, Response } from "express";
import {
  getCompanySettings,
  getCompanySettingsModuleState,
  upsertCompanySettings,
  validateClientSettings,
} from "../services/clientCompanySettingsService.js";
import type { AppSettingsPageData, ClientSettingsData } from "../types/client-settings.js";
import { canOperateClientPanel } from "../types/roles.js";
import {
  buildDefaultClientSettings,
  renderAppSettingsPage,
} from "../views/app-ui/app-settings-page.js";
import { buildAppContext } from "./app.controller.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";

async function requireSettingsWriteContext(
  req: Request,
): Promise<AppPageContext | null> {
  const ctx = await buildAppContext(req);
  if (!ctx) return null;
  if (!canOperateClientPanel(ctx.profile.role)) return null;
  return ctx;
}

function parseSettingsBody(body: unknown): ClientSettingsData | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const b = body as Record<string, unknown>;
  if (!b.company || !b.billing || !b.notifications || !b.preferences) {
    return null;
  }
  return body as ClientSettingsData;
}

export async function getAppSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/login?next=%2Fapp%2Fsettings");
      return;
    }

    const defaults = buildDefaultClientSettings(ctx);
    const module = await getCompanySettingsModuleState();
    let pageData: AppSettingsPageData = {
      module,
      settings: defaults,
      syncSource: "defaults",
      hasStoredRecord: false,
    };

    if (module.available && ctx.company.id) {
      const loaded = await getCompanySettings(ctx.company.id, defaults);
      if (loaded.ok) {
        pageData = {
          module,
          settings: loaded.data.settings,
          syncSource: loaded.data.hasStoredRecord ? "supabase" : "defaults",
          hasStoredRecord: loaded.data.hasStoredRecord,
        };
      } else {
        pageData = {
          module,
          settings: defaults,
          syncSource: "defaults",
          hasStoredRecord: false,
        };
      }
    }

    res.type("html").send(renderAppSettingsPage(ctx, pageData));
  } catch (error) {
    next(error);
  }
}

export async function postAppSettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireSettingsWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const module = await getCompanySettingsModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend de configuración no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const settings = parseSettingsBody(req.body);
    if (!settings) {
      res.status(400).json({ ok: false, error: "Datos de configuración inválidos." });
      return;
    }

    try {
      validateClientSettings(settings);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Validación fallida.";
      res.status(400).json({ ok: false, error: msg });
      return;
    }

    const result = await upsertCompanySettings({
      companyId: ctx.company.id,
      userId: ctx.profile.authUserId ?? ctx.profile.profileId ?? null,
      settings,
    });

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
      error instanceof Error ? error.message : "No se pudo guardar la configuración.";
    res.status(500).json({ ok: false, error: msg });
  }
}
