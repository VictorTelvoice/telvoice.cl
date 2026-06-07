import type { NextFunction, Request, Response } from "express";
import { listCompanies } from "../services/companyService.js";
import {
  createAdminClientNumber,
  listAdminClientNumbers,
  updateAdminClientNumber,
} from "../services/adminClientNumberService.js";
import {
  getSimActivationById,
  getSimActivationModuleState,
  listAdminPendingSimActivations,
  updateSimActivationStatus,
} from "../services/simActivationService.js";
import type { ClientNumberStatus, ClientNumberType } from "../types/client-numbers.js";
import { AppError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  parseAdminNumeracionesFilters,
  renderAdminNumeracionesPage,
} from "../views/admin-ui/sections/admin-numeraciones-pages.js";

function pageOpts(req: Request) {
  return {
    admin: req.adminUser!,
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function redirectNumeraciones(
  res: Response,
  params: { ok?: string; error?: string; company_id?: string },
): void {
  const q = new URLSearchParams();
  if (params.company_id) q.set("company_id", params.company_id);
  if (params.ok) q.set("ok", params.ok);
  if (params.error) q.set("error", params.error);
  const qs = q.toString();
  res.redirect(303, `/admin/numeraciones${qs ? `?${qs}` : ""}`);
}

export async function getAdminNumeracionesPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = parseAdminNumeracionesFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const [numbers, companies, simModule] = await Promise.all([
      listAdminClientNumbers(filters),
      listCompanies(200),
      getSimActivationModuleState(),
    ]);
    const simActivations = simModule.available
      ? await listAdminPendingSimActivations()
      : [];
    const prefillCompanyId =
      typeof req.query.company_id === "string"
        ? req.query.company_id.trim()
        : undefined;

    res.type("html").send(
      renderAdminNumeracionesPage(pageOpts(req), {
        filters,
        numbers,
        companies,
        prefillCompanyId,
        simActivations,
        simModulePending: simModule.migrationPending,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminNumeracionesCreate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = validateUuidParam(
      String(req.body?.company_id ?? ""),
      "empresa",
    );
    const type = String(req.body?.type ?? "sim_real") as ClientNumberType;
    const status = String(req.body?.status ?? "pending_activation") as ClientNumberStatus;
    const allowedType: ClientNumberType[] = [
      "sim_real",
      "fixed_line",
      "virtual",
      "other",
    ];
    const allowedStatus: ClientNumberStatus[] = [
      "available",
      "reserved",
      "pending_activation",
      "active",
      "suspended",
      "cancelled",
    ];

    await createAdminClientNumber({
      company_id: companyId,
      number: String(req.body?.number ?? ""),
      country_code: String(req.body?.country_code ?? "CL"),
      type: allowedType.includes(type) ? type : "sim_real",
      status: allowedStatus.includes(status) ? status : "pending_activation",
      provider: String(req.body?.provider ?? "") || undefined,
      sim_slot: String(req.body?.sim_slot ?? "") || undefined,
      gateway_id: String(req.body?.gateway_id ?? "") || undefined,
    });

    redirectNumeraciones(res, {
      ok: "Numeración creada.",
      company_id: companyId,
    });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminNumeracionesStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "numeración");
    const status = String(req.body?.status ?? "") as ClientNumberStatus;
    const allowed: ClientNumberStatus[] = [
      "available",
      "reserved",
      "pending_activation",
      "active",
      "suspended",
      "cancelled",
    ];
    if (!allowed.includes(status)) {
      redirectNumeraciones(res, { error: "Estado no válido." });
      return;
    }
    await updateAdminClientNumber(id, { status });
    redirectNumeraciones(res, { ok: "Estado actualizado." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminSimActivationReview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "activación SIM");
    await updateSimActivationStatus(id, "activation_review");
    redirectNumeraciones(res, { ok: "Activación marcada en revisión." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminSimActivationNotes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "activación SIM");
    const notes = String(req.body?.admin_notes ?? "");
    const row = await getSimActivationById(id);
    if (!row) {
      redirectNumeraciones(res, { error: "Activación no encontrada." });
      return;
    }
    await updateSimActivationStatus(id, row.activation_status, notes);
    redirectNumeraciones(res, { ok: "Nota guardada." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}
