import type { NextFunction, Request, Response } from "express";
import {
  activateAdminAgentPlanRequest,
  getAdminAgentPlanModuleState,
  getAdminAgentPlanRequestById,
  listAdminAgentPlanRequests,
  listAdminAgentPlanSubscriptions,
  updateAdminAgentPlanRequestStatus,
} from "../services/adminAgentPlanService.js";
import { listClientNumbersByCompanyId } from "../services/adminClientNumberService.js";
import { AppError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  parseAdminAgentPlanFilters,
  renderAdminAgentPlansPage,
} from "../views/admin-ui/sections/admin-agent-plans-pages.js";

function pageOpts(req: Request) {
  return {
    admin: req.adminUser!,
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function redirectAgentPlans(
  res: Response,
  params: { ok?: string; error?: string; request?: string },
): void {
  const q = new URLSearchParams();
  if (params.request) q.set("request", params.request);
  if (params.ok) q.set("ok", params.ok);
  if (params.error) q.set("error", params.error);
  const qs = q.toString();
  res.redirect(303, `/admin/agent-plans${qs ? `?${qs}` : ""}`);
}

export async function getAdminAgentPlansPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = parseAdminAgentPlanFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const module = await getAdminAgentPlanModuleState();
    const [requests, subscriptions] = await Promise.all([
      module.available ? listAdminAgentPlanRequests(filters) : [],
      module.available ? listAdminAgentPlanSubscriptions() : [],
    ]);

    const requestId =
      typeof req.query.request === "string" ? req.query.request.trim() : "";
    const selectedRequest =
      requestId && module.available
        ? await getAdminAgentPlanRequestById(requestId)
        : null;
    const companyNumbers = selectedRequest
      ? await listClientNumbersByCompanyId(selectedRequest.company_id)
      : [];

    res.type("html").send(
      renderAdminAgentPlansPage(pageOpts(req), {
        module,
        filters,
        requests,
        subscriptions,
        selectedRequest,
        companyNumbers,
      }),
    );
  } catch (error) {
    next(error);
  }
}

async function handleRequestAction(
  req: Request,
  res: Response,
  next: NextFunction,
  action: (id: string) => Promise<void>,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "solicitud");
    await action(id);
    redirectAgentPlans(res, { request: id, ok: "Acción aplicada." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectAgentPlans(res, {
        request: String(req.params.id ?? ""),
        error: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function postAdminAgentPlanReviewing(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await handleRequestAction(req, res, next, async (id) => {
    await updateAdminAgentPlanRequestStatus(id, "reviewing");
  });
}

export async function postAdminAgentPlanApprove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await handleRequestAction(req, res, next, async (id) => {
    await updateAdminAgentPlanRequestStatus(id, "approved");
  });
}

export async function postAdminAgentPlanReject(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await handleRequestAction(req, res, next, async (id) => {
    await updateAdminAgentPlanRequestStatus(id, "rejected");
  });
}

export async function postAdminAgentPlanActivate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "solicitud");
    const includedRaw = String(req.body?.included_number_id ?? "").trim();
    const includedNumberId = includedRaw || null;
    await activateAdminAgentPlanRequest(id, { includedNumberId });
    redirectAgentPlans(res, {
      request: id,
      ok: "Plan activado manualmente. Suscripción creada.",
    });
  } catch (error) {
    if (error instanceof AppError) {
      redirectAgentPlans(res, {
        request: String(req.params.id ?? ""),
        error: error.message,
      });
      return;
    }
    next(error);
  }
}
