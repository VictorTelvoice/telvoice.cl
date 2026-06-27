import type { NextFunction, Request, Response } from "express";
import {
  createSmsTemplate,
  deleteSmsTemplate,
  duplicateSmsTemplate,
  getSmsTemplatesModuleState,
  listSmsTemplates,
  updateSmsTemplate,
} from "../services/clientSmsTemplateService.js";
import type {
  ClientSmsTemplate,
  ClientSmsTemplateStatus,
  CreateClientSmsTemplateInput,
} from "../types/sms-templates.js";
import { SMS_TEMPLATE_CATEGORIES } from "../types/sms-templates.js";
import { canOperateClientPanel } from "../types/roles.js";
import { validateUuidParam } from "../utils/validation.js";
import { renderAppTemplatesPage } from "../views/app-ui/app-templates-page.js";
import { parseClientTableLimit } from "../views/app-ui/client-table-kit.js";
import { buildAppContext } from "./app.controller.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";

async function requireTemplatesWriteContext(
  req: Request,
): Promise<AppPageContext | null> {
  const ctx = await buildAppContext(req);
  if (!ctx) return null;
  if (!canOperateClientPanel(ctx.profile.role)) return null;
  return ctx;
}

function parseTemplateStatus(raw: unknown): ClientSmsTemplateStatus {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v === "active" || v === "draft") return v;
  return "draft";
}

function parseCategory(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if ((SMS_TEMPLATE_CATEGORIES as readonly string[]).includes(v)) {
    return v;
  }
  return "OTP";
}

export async function getAppTemplates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/login?next=%2Fapp%2Ftemplates");
      return;
    }

    const module = await getSmsTemplatesModuleState();
    const limit = parseClientTableLimit(
      req.query as Record<string, string | string[] | undefined>,
    );
    let templates: ClientSmsTemplate[] = [];

    if (module.available && ctx.company.id) {
      const listed = await listSmsTemplates(ctx.company.id);
      if (listed.ok) {
        templates = listed.data;
      }
    }

    res.type("html").send(
      renderAppTemplatesPage(ctx, {
        module,
        templates,
        limit,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postAppSmsTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireTemplatesWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const module = await getSmsTemplatesModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend de plantillas no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const input: CreateClientSmsTemplateInput = {
      companyId: ctx.company.id,
      userId: ctx.profile.authUserId ?? ctx.profile.profileId ?? null,
      name: typeof body.name === "string" ? body.name : "",
      category: parseCategory(body.category),
      message: typeof body.message === "string" ? body.message : "",
      status: parseTemplateStatus(body.status),
    };

    const result = await createSmsTemplate(input);
    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({ ok: true, template: result.data });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo crear la plantilla.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppSmsTemplateUpdate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireTemplatesWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const templateId = validateUuidParam(String(req.params.id ?? ""), "template");
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.category === "string") patch.category = parseCategory(body.category);
    if (typeof body.message === "string") patch.message = body.message;
    if (body.status !== undefined) patch.status = parseTemplateStatus(body.status);

    const result = await updateSmsTemplate(templateId, ctx.company.id, patch);
    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({ ok: true, template: result.data });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo actualizar la plantilla.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppSmsTemplateDelete(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireTemplatesWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const templateId = validateUuidParam(String(req.params.id ?? ""), "template");
    const result = await deleteSmsTemplate(templateId, ctx.company.id);
    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({ ok: true, id: result.data.id });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo eliminar la plantilla.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppSmsTemplateDuplicate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireTemplatesWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const templateId = validateUuidParam(String(req.params.id ?? ""), "template");
    const result = await duplicateSmsTemplate(
      templateId,
      ctx.company.id,
      ctx.profile.authUserId ?? ctx.profile.profileId ?? null,
    );
    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({ ok: true, template: result.data });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo duplicar la plantilla.";
    res.status(500).json({ ok: false, error: msg });
  }
}
