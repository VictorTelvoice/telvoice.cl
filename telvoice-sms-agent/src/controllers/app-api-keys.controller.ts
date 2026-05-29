import type { Request, Response } from "express";
import { isApiKeyPepperConfigured } from "../services/apiKeyCryptoService.js";
import {
  activateClientApiKey,
  createClientApiKey,
  getClientApiKeysModuleState,
  listClientApiKeys,
  parseApiKeyEnvironment,
  pauseClientApiKey,
  revokeClientApiKey,
  updateClientApiKeyName,
  updateClientApiKeyScopes,
  validateApiKeyName,
  validateApiKeyScopes,
} from "../services/clientApiKeyService.js";
import type { ClientApiKeyScope } from "../types/client-api-keys.js";
import { canOperateClientPanel } from "../types/roles.js";
import { AppError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import { buildAppContext } from "./app.controller.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";

async function requireKeysWriteContext(req: Request): Promise<AppPageContext | null> {
  const ctx = await buildAppContext(req);
  if (!ctx) return null;
  if (!canOperateClientPanel(ctx.profile.role)) return null;
  return ctx;
}

function parseExpiresAt(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  if (typeof raw !== "string") {
    throw new AppError("Fecha de expiración inválida.", 400);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new AppError("Fecha de expiración inválida.", 400);
  }
  return d.toISOString();
}

export async function getAppApiKeysJson(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireKeysWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const module = await getClientApiKeysModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend de API Keys no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const listed = await listClientApiKeys(ctx.company.id);
    if (!listed.ok) {
      res.status(listed.missingTable ? 503 : 400).json(listed);
      return;
    }

    res.json({
      ok: true,
      keys: listed.data,
      pepperConfigured: isApiKeyPepperConfigured(),
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudieron listar las API Keys.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppApiKeyCreate(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireKeysWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    if (!isApiKeyPepperConfigured()) {
      res.status(503).json({
        ok: false,
        error:
          "No se pueden crear API Keys: falta configurar API_KEY_PEPPER en el servidor.",
        code: "API_KEY_PEPPER_MISSING",
      });
      return;
    }

    const module = await getClientApiKeysModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend de API Keys no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = validateApiKeyName(body.name);
    const environment = parseApiKeyEnvironment(body.environment);
    const scopes = validateApiKeyScopes(body.scopes ?? body);
    const expiresAt = parseExpiresAt(body.expiresAt);

    const result = await createClientApiKey({
      companyId: ctx.company.id,
      createdByUserId: ctx.profile.authUserId ?? ctx.profile.profileId ?? null,
      name,
      environment,
      scopes,
      expiresAt,
    });

    if (!result.ok) {
      res.status(result.missingTable || result.code === "API_KEY_PEPPER_MISSING" ? 503 : 400).json(
        result,
      );
      return;
    }

    res.json({
      ok: true,
      key: result.data.key,
      plainTextKey: result.data.plainTextKey,
      message:
        "Copia esta API Key ahora. Por seguridad no volverás a verla completa.",
    });
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "No se pudo crear la API Key.";
    res.status(error instanceof AppError ? error.statusCode : 500).json({
      ok: false,
      error: msg,
    });
  }
}

export async function postAppApiKeyPause(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireKeysWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }
    const id = validateUuidParam(String(req.params.id ?? ""), "api_key");
    const result = await pauseClientApiKey(id, ctx.company.id);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true, key: result.data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "No se pudo pausar la API Key.";
    res.status(400).json({ ok: false, error: msg });
  }
}

export async function postAppApiKeyActivate(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireKeysWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }
    const id = validateUuidParam(String(req.params.id ?? ""), "api_key");
    const result = await activateClientApiKey(id, ctx.company.id);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true, key: result.data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "No se pudo activar la API Key.";
    res.status(400).json({ ok: false, error: msg });
  }
}

export async function postAppApiKeyRevoke(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireKeysWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }
    const id = validateUuidParam(String(req.params.id ?? ""), "api_key");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    const result = await revokeClientApiKey(id, ctx.company.id, reason);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true, key: result.data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "No se pudo revocar la API Key.";
    res.status(400).json({ ok: false, error: msg });
  }
}

export async function postAppApiKeyScopes(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireKeysWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }
    const id = validateUuidParam(String(req.params.id ?? ""), "api_key");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const scopes = validateApiKeyScopes(body.scopes) as ClientApiKeyScope[];
    const result = await updateClientApiKeyScopes(id, ctx.company.id, scopes);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true, key: result.data });
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "No se pudieron actualizar los scopes.";
    res.status(400).json({ ok: false, error: msg });
  }
}

export async function postAppApiKeyName(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireKeysWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }
    const id = validateUuidParam(String(req.params.id ?? ""), "api_key");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = validateApiKeyName(body.name);
    const result = await updateClientApiKeyName(id, ctx.company.id, name);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true, key: result.data });
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "No se pudo actualizar el nombre.";
    res.status(400).json({ ok: false, error: msg });
  }
}
