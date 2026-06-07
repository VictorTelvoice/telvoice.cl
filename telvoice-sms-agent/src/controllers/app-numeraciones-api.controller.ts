import type { Request, Response } from "express";
import { canOperateClientPanel } from "../types/roles.js";
import {
  createAgentPlanRequest,
  getAgentPlanStatusPayload,
} from "../services/clientAgentPlanService.js";
import {
  getClientNumberById,
  getClientNumbersModuleState,
  listClientNumbersByCompany,
} from "../services/clientNumberService.js";
import { listInboundSmsByCompany } from "../services/inboundSmsService.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { AgentPlanCode } from "../types/client-numbers.js";
import { AppError } from "../utils/errors.js";
import { isMissingTableError } from "../utils/db-table.js";
import { validateUuidParam } from "../utils/validation.js";
import { buildAppContext } from "./app.controller.js";

async function requireApiContext(req: Request, res: Response) {
  const ctx = await buildAppContext(req);
  if (!ctx) {
    res.status(403).json({ ok: false, error: "Sin acceso o empresa no asociada." });
    return null;
  }
  return ctx;
}

export async function getApiNumeraciones(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    const module = await getClientNumbersModuleState();
    const numbers = await listClientNumbersByCompany(ctx.company.id);
    res.json({ ok: true, module, numbers });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error al listar numeraciones." });
  }
}

export async function getApiNumeracionById(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    const id = validateUuidParam(String(req.params.id ?? ""), "numeración");
    const number = await getClientNumberById(ctx.company.id, id);
    if (!number) {
      res.status(404).json({ ok: false, error: "Numeración no encontrada." });
      return;
    }
    res.json({ ok: true, number });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ ok: false, error: error.message });
      return;
    }
    res.status(500).json({ ok: false, error: "Error al obtener numeración." });
  }
}

export async function getApiNumeracionSms(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    const id = validateUuidParam(String(req.params.id ?? ""), "numeración");
    const number = await getClientNumberById(ctx.company.id, id);
    if (!number) {
      res.status(404).json({ ok: false, error: "Numeración no encontrada." });
      return;
    }

    const messages = await listInboundSmsByCompany(ctx.company.id, {
      numberId: id,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
    });
    res.json({ ok: true, messages });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error al listar SMS." });
  }
}

export async function patchApiNumeracionConfig(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx || !canOperateClientPanel(ctx.profile.role)) {
      res.status(403).json({ ok: false, error: "Sin permiso." });
      return;
    }

    const id = validateUuidParam(String(req.params.id ?? ""), "numeración");
    const number = await getClientNumberById(ctx.company.id, id);
    if (!number) {
      res.status(404).json({ ok: false, error: "Numeración no encontrada." });
      return;
    }

    const capabilities = req.body?.capabilities;
    if (!capabilities || typeof capabilities !== "object") {
      res.status(400).json({ ok: false, error: "capabilities requerido." });
      return;
    }

    const sb = getSupabase();
    const { error } = await sb
      .from("client_numbers")
      .update({ capabilities })
      .eq("company_id", ctx.company.id)
      .eq("id", id);

    if (error) {
      if (isMissingTableError(error)) {
        res.status(503).json({ ok: false, error: "Módulo no disponible." });
        return;
      }
      throw error;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error al actualizar configuración." });
  }
}

export async function postApiNumeracionWebhookTest(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    validateUuidParam(String(req.params.id ?? ""), "numeración");
    res.json({
      ok: true,
      message: "Prueba de webhook programada (implementación Fase 3).",
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error al probar webhook." });
  }
}

export async function postApiAgentPlanRequest(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx || !canOperateClientPanel(ctx.profile.role)) {
      res.status(403).json({ ok: false, error: "Sin permiso." });
      return;
    }

    const planCode = String(req.body?.plan_code ?? "").trim() as AgentPlanCode;
    if (!["start", "pro", "business"].includes(planCode)) {
      res.status(400).json({ ok: false, error: "plan_code no válido." });
      return;
    }

    const preferred =
      req.body?.preferred_number_type === "sim_real" ||
      req.body?.preferred_number_type === "fixed_line"
        ? req.body.preferred_number_type
        : "either";

    const request = await createAgentPlanRequest(
      ctx.company.id,
      planCode,
      preferred,
    );
    res.status(201).json({
      ok: true,
      request,
      message:
        "Solicitud recibida. Telvoice revisará disponibilidad de línea y activación comercial.",
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ ok: false, error: error.message });
      return;
    }
    res.status(500).json({ ok: false, error: "Error al crear solicitud." });
  }
}

export async function getApiAgentPlanStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    const status = await getAgentPlanStatusPayload(ctx.company.id);
    res.json({
      ok: true,
      subscription: status.subscription,
      requests: status.requests,
      pending_requests: status.pendingRequests,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error al obtener plan." });
  }
}
