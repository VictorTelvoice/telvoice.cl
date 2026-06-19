import type { Request, Response } from "express";
import { canOperateClientPanel } from "../types/roles.js";
import {
  createAgentPlanRequest,
  getAgentPlanStatusPayload,
} from "../services/clientAgentPlanService.js";
import {
  getClientNumberById,
  getClientNumbersModuleState,
  filterClientPanelNumbers,
  listClientNumbersByCompany,
} from "../services/clientNumberService.js";
import {
  countInboundByClientNumber,
  countUnreadInboundByClientNumber,
  countUnreadInboundByCompany,
  getInboundSmsById,
  listInboundSmsByCompany,
  pollInboundSmsForCompany,
  serializeInboundMessageForApi,
  simulateInboundSmsForCompany,
} from "../services/inboundSmsService.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { AgentPlanCode } from "../types/client-numbers.js";
import { AppError } from "../utils/errors.js";
import { isMissingTableError } from "../utils/db-table.js";
import { validateUuidParam } from "../utils/validation.js";
import { buildAppContext } from "./app.controller.js";
import {
  buildClientSimCheckoutProfilePayload,
  getClientPendingSimCheckoutForCompany,
  listClientSimAvailableNumbers,
  startClientPanelSimSubscriptionCheckout,
} from "../services/clientSimSubscriptionCheckoutService.js";
import { getPublicAvailability } from "../services/realNumberInventoryService.js";
import { isSimPlanId } from "../utils/simPlans.js";

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
    const numbers = filterClientPanelNumbers(
      await listClientNumbersByCompany(ctx.company.id),
    );
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

function parseInboundApiFilters(req: Request) {
  const q = req.query;
  const str = (key: string): string | undefined => {
    const v = q[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    numberId: str("number_id") ?? str("client_number_id"),
    q: str("q"),
    from: str("from"),
    startDate: str("start_date"),
    endDate: str("end_date"),
    afterReceivedAt: str("after"),
  };
}

function parseInboundPollParams(req: Request) {
  const q = req.query;
  const str = (key: string): string | undefined => {
    const v = q[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    afterReceivedAt: str("after"),
    clientNumberId: str("client_number_id") ?? str("number_id"),
  };
}

/** Listado completo / filtros para carga inicial de /app/sms-inbox. */
export async function getApiSmsInboxMessages(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    const filters = parseInboundApiFilters(req);
    if (filters.numberId) {
      const owned = await getClientNumberById(ctx.company.id, filters.numberId);
      if (!owned) {
        res.status(404).json({ ok: false, error: "Numeración no encontrada." });
        return;
      }
    }
    const messages = await listInboundSmsByCompany(ctx.company.id, filters, 100);
    const unreadCount = await countUnreadInboundByCompany(
      ctx.company.id,
      filters.numberId,
    );
    const countsByNumber = await countInboundByClientNumber(ctx.company.id);
    const unreadByNumber = await countUnreadInboundByClientNumber(ctx.company.id);

    const latest =
      messages.length > 0
        ? messages.reduce((a, b) =>
            a.received_at >= b.received_at ? a : b,
          ).received_at
        : null;

    res.json({
      ok: true,
      messages: messages.map(serializeInboundMessageForApi),
      unread_count: unreadCount,
      counts_by_number: countsByNumber,
      unread_by_number: unreadByNumber,
      latest_received_at: latest,
    });
  } catch {
    res.status(500).json({ ok: false, error: "Error al cargar bandeja." });
  }
}

/** Polling dedicado: mensajes nuevos + conteos agrupados (egress mínimo). */
export async function getApiSmsInboxPoll(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    const { afterReceivedAt, clientNumberId } = parseInboundPollParams(req);
    if (clientNumberId) {
      const owned = await getClientNumberById(ctx.company.id, clientNumberId);
      if (!owned) {
        res.status(404).json({ ok: false, error: "Numeración no encontrada." });
        return;
      }
    }

    const result = await pollInboundSmsForCompany(ctx.company.id, {
      afterReceivedAt,
      clientNumberId,
    });

    res.json({
      ok: true,
      messages: result.messages.map(serializeInboundMessageForApi),
      unread_total: result.unreadTotal,
      unread_by_number: result.unreadByNumber,
      latest_received_at: result.latestReceivedAt,
    });
  } catch {
    res.status(500).json({ ok: false, error: "Error en polling de bandeja." });
  }
}

/** Simula recepción de SMS entrante en numeración del tenant (origen `simulation`). */
export async function postApiSmsInboxSimulate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;
    if (!canOperateClientPanel(ctx.profile.role)) {
      res.status(403).json({ ok: false, error: "Sin permiso para simular SMS." });
      return;
    }

    const clientNumberId = validateUuidParam(
      String(req.body?.number_id ?? req.body?.client_number_id ?? ""),
      "numeración",
    );
    const from = String(req.body?.from ?? req.body?.from_number ?? "").trim();
    const body = String(req.body?.body ?? req.body?.message ?? req.body?.text ?? "").trim();

    const result = await simulateInboundSmsForCompany({
      companyId: ctx.company.id,
      clientNumberId,
      from,
      body,
    });

    if (!result.ok) {
      const status = result.error?.includes("no encontrada") ? 404 : 400;
      res.status(status).json({ ok: false, error: result.error ?? "Error al simular." });
      return;
    }

    const message = result.messageId
      ? await getInboundSmsById(ctx.company.id, result.messageId)
      : null;

    res.status(201).json({
      ok: true,
      message_id: result.messageId,
      message: message ? serializeInboundMessageForApi(message) : null,
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ ok: false, error: error.message });
      return;
    }
    res.status(500).json({ ok: false, error: "Error al simular SMS entrante." });
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

export async function getApiSimSubscriptionAvailableNumbers(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    const result = await listClientSimAvailableNumbers();
    const availability = await getPublicAvailability();
    res.json({
      ok: true,
      ...result,
      in_stock: availability.in_stock,
      profile: buildClientSimCheckoutProfilePayload(ctx.company, ctx.profile),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error al listar numeraciones." });
  }
}

export async function getApiSimSubscriptionPending(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    const pending = await getClientPendingSimCheckoutForCompany(ctx.company.id);
    res.json({ ok: true, ...pending });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error al consultar checkout pendiente." });
  }
}

export async function postApiSimSubscriptionCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireApiContext(req, res);
    if (!ctx) return;

    if (!canOperateClientPanel(ctx.profile.role)) {
      res.status(403).json({ ok: false, error: "Sin permiso para contratar numeración." });
      return;
    }

    const planId = String(req.body?.plan_id ?? "").trim();
    if (!isSimPlanId(planId)) {
      res.status(400).json({ ok: false, error: "Plan SIM no válido." });
      return;
    }

    const assignmentMode =
      req.body?.assignment_mode === "auto" ? "auto" : "selected";
    const inventoryPublicId = String(req.body?.inventory_public_id ?? "").trim();

    const result = await startClientPanelSimSubscriptionCheckout({
      company: ctx.company,
      profile: ctx.profile,
      planId,
      assignmentMode,
      inventoryPublicId: inventoryPublicId || undefined,
    });

    res.json({
      ok: true,
      order_id: result.orderId,
      checkout_url: result.checkoutUrl,
      preapproval_id: result.preferenceId,
      product_type: result.productType,
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        ok: false,
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }
    res.status(500).json({ ok: false, error: "Error al iniciar checkout SIM." });
  }
}
