import type { NextFunction, Request, Response } from "express";
import {
  createSmppConnection,
  deleteSmppConnection,
  getSmppConnectionById,
  listSmppBindTests,
  listSmppConnections,
  listSmppSendTests,
  parseSmppConnectionForm,
  parseSmppSendTestForm,
  runSmppBindTest,
  runSmppSendTest,
  updateSmppConnection,
} from "../services/smppLabService.js";
import {
  createInternationalRatePlan,
  deleteInternationalRatePlan,
  getInternationalRatePlanById,
  listInternationalRatePlans,
  parseInternationalRatePlanForm,
  seedInternationalRatePlansDraft,
  updateInternationalRatePlan,
} from "../services/wholesaleInternationalRateService.js";
import { listWholesaleProviders } from "../services/wholesaleService.js";
import { resolveSmppVendorPrefill } from "../config/smpp-vendor-presets.js";
import { DatabaseError, ValidationError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  renderInternationalRatePlanFormPage,
  renderInternationalRatePlansListPage,
  renderSmppConnectionFormPage,
  renderSmppLabHubPage,
} from "../views/admin-ui/sections/wholesale-ops-pages.js";

function flash(req: Request): { success?: string; error?: string } {
  return {
    success: typeof req.query.success === "string" ? req.query.success : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function redirectWithMessage(
  res: Response,
  path: string,
  kind: "success" | "error",
  message: string,
): void {
  const q = kind === "success" ? "success" : "error";
  res.redirect(`${path}?${q}=${encodeURIComponent(message)}`);
}

const SMPP_ACCOUNT_SAVED_MESSAGE = "SMPP account saved successfully.";

function smppCreateSuccessRedirectPath(
  row: { id: string },
  providerId: string | null,
): string {
  if (providerId) {
    return `/admin/wholesale/providers/${providerId}/edit?tab=smpp-accounts`;
  }
  return `/admin/wholesale/smpp-lab/${row.id}/edit`;
}

function smppSaveErrorMessage(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.message;
  }
  if (error instanceof DatabaseError) {
    const msg = error.message.toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return "An SMPP account with this name or system ID already exists.";
    }
    if (msg.includes("wholesale_smpp_connections")) {
      return "Could not save SMPP account. Database error — contact ops if this persists.";
    }
    return "Could not save SMPP account. Please try again.";
  }
  return "Could not save SMPP account. Please try again.";
}

async function renderSmppCreateFormError(
  res: Response,
  req: Request,
  errorMessage: string,
): Promise<void> {
  const providers = await listWholesaleProviders();
  res.type("html").send(
    renderSmppConnectionFormPage({
      admin: req.adminUser!,
      mode: "create",
      providers,
      values: req.body as Record<string, unknown>,
      error: errorMessage,
    }),
  );
}

// ── SMPP Lab ─────────────────────────────────────────────────────────────────

export async function getSmppLabHub(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [connections, bindTests, sendTests] = await Promise.all([
      listSmppConnections(),
      listSmppBindTests(),
      listSmppSendTests(),
    ]);
    res.type("html").send(
      renderSmppLabHubPage({
        admin: req.adminUser!,
        connections,
        bindTests,
        sendTests,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getSmppConnectionNewForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const providers = await listWholesaleProviders();
    const providerId =
      typeof req.query.provider_id === "string" ? req.query.provider_id.trim() : "";
    const prefill = resolveSmppVendorPrefill(providers, providerId || undefined);
    res.type("html").send(
      renderSmppConnectionFormPage({
        admin: req.adminUser!,
        mode: "create",
        providers,
        values: prefill,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateSmppConnection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseSmppConnectionForm(req.body);
    const row = await createSmppConnection(input);
    redirectWithMessage(
      res,
      smppCreateSuccessRedirectPath(row, input.provider_id),
      "success",
      SMPP_ACCOUNT_SAVED_MESSAGE,
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DatabaseError) {
      await renderSmppCreateFormError(res, req, smppSaveErrorMessage(error));
      return;
    }
    next(error);
  }
}

export async function getSmppConnectionEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const [connection, providers] = await Promise.all([
      getSmppConnectionById(id),
      listWholesaleProviders(),
    ]);
    res.type("html").send(
      renderSmppConnectionFormPage({
        admin: req.adminUser!,
        mode: "edit",
        connection,
        providers,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditSmppConnection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const input = parseSmppConnectionForm(req.body, { isEdit: true });
    const updated = await updateSmppConnection(id, input);
    const providerId = input.provider_id ?? updated.provider_id ?? null;
    redirectWithMessage(
      res,
      providerId
        ? `/admin/wholesale/providers/${providerId}/edit?tab=smpp-accounts`
        : `/admin/wholesale/smpp-lab/${id}/edit`,
      "success",
      SMPP_ACCOUNT_SAVED_MESSAGE,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const id = validateUuidParam(String(req.params.id ?? ""), "id");
      const [connection, providers] = await Promise.all([
        getSmppConnectionById(id),
        listWholesaleProviders(),
      ]);
      res.type("html").send(
        renderSmppConnectionFormPage({
          admin: req.adminUser!,
          mode: "edit",
          connection,
          providers,
          values: req.body as Record<string, unknown>,
          error: error.message,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function postSmppBindTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const result = await runSmppBindTest(id);
    const msg =
      result.result === "success"
        ? `Bind OK (${result.latency_ms ?? "—"} ms)`
        : `Bind failed: ${result.error_message ?? "error"}`;
    redirectWithMessage(res, "/admin/wholesale/smpp-lab", "success", msg);
  } catch (error) {
    if (error instanceof ValidationError) {
      redirectWithMessage(res, "/admin/wholesale/smpp-lab", "error", error.message);
      return;
    }
    next(error);
  }
}

export async function postSmppSendTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseSmppSendTestForm(req.body);
    const result = await runSmppSendTest(input);
    redirectWithMessage(
      res,
      "/admin/wholesale/smpp-lab",
      "success",
      `SMS test: ${result.submit_status} · DLR ${result.dlr_status}${result.provider_message_id ? ` · ID ${result.provider_message_id}` : ""}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      redirectWithMessage(res, "/admin/wholesale/smpp-lab", "error", error.message);
      return;
    }
    next(error);
  }
}

export async function postDeleteSmppConnection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteSmppConnection(id);
    redirectWithMessage(res, "/admin/wholesale/smpp-lab", "success", "Conexión eliminada.");
  } catch (error) {
    next(error);
  }
}

// ── International rate plans ───────────────────────────────────────────────────

export async function getInternationalRatePlansList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const plans = await listInternationalRatePlans();
    res.type("html").send(
      renderInternationalRatePlansListPage({
        admin: req.adminUser!,
        plans,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getInternationalRatePlanNewForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [providers, connections] = await Promise.all([
      listWholesaleProviders(),
      listSmppConnections(),
    ]);
    res.type("html").send(
      renderInternationalRatePlanFormPage({
        admin: req.adminUser!,
        mode: "create",
        providers,
        connections,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateInternationalRatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseInternationalRatePlanForm(req.body);
    await createInternationalRatePlan(input);
    redirectWithMessage(
      res,
      "/admin/wholesale/international-rates",
      "success",
      "Rate plan creado.",
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const [providers, connections] = await Promise.all([
        listWholesaleProviders(),
        listSmppConnections(),
      ]);
      res.type("html").send(
        renderInternationalRatePlanFormPage({
          admin: req.adminUser!,
          mode: "create",
          providers,
          connections,
          values: req.body as Record<string, unknown>,
          error: error.message,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getInternationalRatePlanEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const [plan, providers, connections] = await Promise.all([
      getInternationalRatePlanById(id),
      listWholesaleProviders(),
      listSmppConnections(),
    ]);
    res.type("html").send(
      renderInternationalRatePlanFormPage({
        admin: req.adminUser!,
        mode: "edit",
        plan,
        providers,
        connections,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditInternationalRatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const input = parseInternationalRatePlanForm(req.body);
    await updateInternationalRatePlan(id, input);
    redirectWithMessage(
      res,
      "/admin/wholesale/international-rates",
      "success",
      "Rate plan actualizado.",
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const id = validateUuidParam(String(req.params.id ?? ""), "id");
      const [plan, providers, connections] = await Promise.all([
        getInternationalRatePlanById(id),
        listWholesaleProviders(),
        listSmppConnections(),
      ]);
      res.type("html").send(
        renderInternationalRatePlanFormPage({
          admin: req.adminUser!,
          mode: "edit",
          plan,
          providers,
          connections,
          values: req.body as Record<string, unknown>,
          error: error.message,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function postDeleteInternationalRatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteInternationalRatePlan(id);
    redirectWithMessage(
      res,
      "/admin/wholesale/international-rates",
      "success",
      "Rate plan eliminado.",
    );
  } catch (error) {
    next(error);
  }
}

export async function postSeedInternationalRatePlans(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const n = await seedInternationalRatePlansDraft();
    redirectWithMessage(
      res,
      "/admin/wholesale/international-rates",
      "success",
      n > 0 ? `Seed: ${n} rate plan(s) RO/GB/CL creados en draft.` : "Seed: RO/GB/CL ya existían.",
    );
  } catch (error) {
    next(error);
  }
}
