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
  activatePaidSimActivationRequest,
} from "../services/simActivationService.js";
import {
  sendCheckoutPanelAccessEmail,
  sendSimNumberActiveEmail,
} from "../services/transactionalEmailService.js";
import { getInventoryById, assignInventoryNumberManual,
  createInventoryNumber,
  getInventorySummary,
  getRealNumberInventoryModuleState,
  listInventory,
  markInventoryNotForSale,
  markWebhookConnected,
  releaseExpiredReservation,
  releaseReservationById,
} from "../services/realNumberInventoryService.js";
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
    const [numbers, companies, simModule, inventoryModule] = await Promise.all([
      listAdminClientNumbers(filters),
      listCompanies(200),
      getSimActivationModuleState(),
      getRealNumberInventoryModuleState(),
    ]);
    const simActivations = simModule.available
      ? await listAdminPendingSimActivations()
      : [];
    const inventorySummary = inventoryModule.available
      ? await getInventorySummary()
      : null;
    const inventory = inventoryModule.available ? await listInventory() : [];
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
        inventory,
        inventorySummary,
        inventoryModulePending: inventoryModule.migrationPending,
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

export async function postAdminSimActivationActivate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "activación SIM");
    await activatePaidSimActivationRequest(id);
    redirectNumeraciones(res, { ok: "Activación completada: numeración y agente asignados." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminSimActivationResendAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "activación SIM");
    const row = await getSimActivationById(id);
    if (!row) {
      redirectNumeraciones(res, { error: "Activación no encontrada." });
      return;
    }
    const result = await sendCheckoutPanelAccessEmail(row.order_id, row.checkout_email, {
      skipIdempotency: true,
    });
    if (!result.ok) {
      redirectNumeraciones(res, {
        error: result.error ?? "No se pudo reenviar el correo de acceso.",
      });
      return;
    }
    redirectNumeraciones(res, { ok: "Correo de acceso reenviado." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminSimActivationResendActive(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "activación SIM");
    const row = await getSimActivationById(id);
    if (!row) {
      redirectNumeraciones(res, { error: "Activación no encontrada." });
      return;
    }
    if (row.activation_status !== "active" || !row.inventory_number_id) {
      redirectNumeraciones(res, {
        error: "La activación debe estar activa con inventario asignado.",
      });
      return;
    }
    const inventory = await getInventoryById(row.inventory_number_id);
    if (!inventory) {
      redirectNumeraciones(res, { error: "Inventario no encontrado." });
      return;
    }
    const result = await sendSimNumberActiveEmail(row.order_id, {
      assignedNumber: inventory.e164_number,
      planName: row.plan_name,
    }, { skipIdempotency: true });
    if (!result.ok) {
      redirectNumeraciones(res, {
        error: result.error ?? "No se pudo reenviar el correo de numeración activa.",
      });
      return;
    }
    redirectNumeraciones(res, { ok: "Correo de numeración activa reenviado." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminInventoryMarkConnected(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "inventario");
    await markWebhookConnected(id, {
      webhookUrl: String(req.body?.webhook_url ?? "") || undefined,
      gatewayId: String(req.body?.gateway_id ?? "") || undefined,
      simSlot: String(req.body?.sim_slot ?? "") || undefined,
    });
    redirectNumeraciones(res, { ok: "Número marcado como conectado y disponible para venta." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminInventoryNotForSale(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "inventario");
    await markInventoryNotForSale(id);
    redirectNumeraciones(res, { ok: "Número marcado como no vendible." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminInventoryReleaseExpired(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const released = await releaseExpiredReservation();
    redirectNumeraciones(res, {
      ok:
        released > 0
          ? `${released} reserva(s) expirada(s) liberada(s).`
          : "No había reservas expiradas.",
    });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminInventoryAdd(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const webhookConnected = String(req.body?.webhook_connected ?? "") === "1";
    await createInventoryNumber({
      e164_number: String(req.body?.e164_number ?? ""),
      connection_status: String(req.body?.connection_status ?? "preconfigured_pending") as
        | "connected"
        | "preconfigured_pending"
        | "connection_error"
        | "disabled",
      sales_status: String(req.body?.sales_status ?? "preconfigured_pending") as
        | "connected_available"
        | "preconfigured_pending"
        | "not_for_sale",
      provider: String(req.body?.provider ?? "telsim") || "telsim",
      gateway_id: String(req.body?.gateway_id ?? "") || undefined,
      sim_slot: String(req.body?.sim_slot ?? "") || undefined,
      webhook_url: String(req.body?.webhook_url ?? "") || undefined,
      webhook_connected: webhookConnected,
      metadata: {
        internal_notes: String(req.body?.internal_notes ?? "") || undefined,
      },
    });
    redirectNumeraciones(res, { ok: "Número agregado al inventario." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminInventoryRelease(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "inventario");
    await releaseReservationById(id);
    redirectNumeraciones(res, { ok: "Reserva liberada. El número vuelve a estar disponible." });
  } catch (error) {
    if (error instanceof AppError) {
      redirectNumeraciones(res, { error: error.message });
      return;
    }
    next(error);
  }
}

export async function postAdminInventoryAssign(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "inventario");
    const companyId = validateUuidParam(String(req.body?.company_id ?? ""), "empresa");
    const planCode = String(req.body?.plan_code ?? "sim_starter").trim();
    const simActivationRequestId = String(req.body?.sim_activation_request_id ?? "").trim();

    await assignInventoryNumberManual({
      inventoryId: id,
      companyId,
      planCode: planCode || undefined,
      simActivationRequestId: simActivationRequestId || undefined,
    });

    redirectNumeraciones(res, {
      ok: "Número asignado a la empresa. Aparecerá en el panel del cliente.",
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
