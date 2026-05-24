import type { NextFunction, Request, Response } from "express";
import { listCompanies } from "../services/companyService.js";
import {
  getLiveTestControlPanel,
  getSmsProviderStatusView,
} from "../services/smsProviderStatusService.js";
import { assignCompanyRatePlan, getCompanyRatePlan } from "../services/companyRatePlanService.js";
import { listPanelMessagesByCompany } from "../services/panelSmsMessageService.js";
import {
  createSmsProvider,
  getSmsProviderById,
  listSmsProviders,
} from "../services/smsProviderService.js";
import {
  createRatePlanDetail,
  createSmsRatePlan,
  getSmsRatePlanById,
  listRatePlanDetails,
  listSmsRatePlans,
} from "../services/smsRatePlanService.js";
import {
  createSmsRoute,
  listSmsRoutes,
  updateSmsRoute,
} from "../services/smsRouteService.js";
import { sendSuperadminProviderTest } from "../services/superadminProviderTestService.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  renderSaClientsPage,
  renderSaProviderDetailPage,
  renderSaProviderTestPage,
  renderSaProvidersPage,
  renderSaRatePlanDetailPage,
  renderSaRatePlansPage,
  renderSaRoutesPage,
} from "../views/admin-ui/sections/superadmin-telco-pages.js";
import { AppError } from "../utils/errors.js";

function flash(req: Request): { flash?: string; error?: string } {
  return {
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function redirectQuery(res: Response, path: string, params: Record<string, string>): void {
  const q = new URLSearchParams(params).toString();
  res.redirect(302, q ? `${path}?${q}` : path);
}

export async function getSaProvidersPageTelco(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [providers, providerStatus, liveTestControl] = await Promise.all([
      listSmsProviders(),
      getSmsProviderStatusView(),
      getLiveTestControlPanel(),
    ]);
    res.type("html").send(
      renderSaProvidersPage({
        admin: req.adminUser!,
        providers,
        providerStatus,
        liveTestControl,
        tablesReady: true,
        ...flash(req),
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function getSaProviderDetailPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id), "id");
    const provider = await getSmsProviderById(id);
    if (!provider) {
      redirectQuery(res, "/admin/providers", { error: "Proveedor no encontrado" });
      return;
    }
    const routes = (await listSmsRoutes()).filter((r) => r.provider_id === id);
    const messages = (await listPanelMessagesByCompany(
      "6cd1db92-d5c7-45e0-8548-df8907843350",
      20,
    )).filter((m) => m.provider === provider.code);

    res.type("html").send(
      renderSaProviderDetailPage({
        admin: req.adminUser!,
        provider,
        routes,
        recentMessages: messages,
        ...flash(req),
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function postCreateProvider(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await createSmsProvider({
      name: String(req.body.name ?? ""),
      code: String(req.body.code ?? ""),
      type: String(req.body.type ?? "http_api"),
      apiBaseUrl: String(req.body.api_base_url ?? "") || null,
      defaultSenderId: String(req.body.default_sender_id ?? "") || null,
    });
    redirectQuery(res, "/admin/providers", { ok: "Proveedor creado" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirectQuery(res, "/admin/providers", { error: msg });
  }
}

export async function getSaProviderTestPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id), "id");
    const provider = await getSmsProviderById(id);
    if (!provider) {
      redirectQuery(res, "/admin/providers", { error: "Proveedor no encontrado" });
      return;
    }
    const routes = (await listSmsRoutes()).filter(
      (r) => r.provider_id === id && r.status === "active",
    );
    res.type("html").send(
      renderSaProviderTestPage({
        admin: req.adminUser!,
        provider,
        routes,
        testResult:
          typeof req.query.test_ok === "string"
            ? {
                messageId: String(req.query.mid ?? ""),
                providerMessageId: String(req.query.pmid ?? ""),
              }
            : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function postSaProviderTest(
  req: Request,
  res: Response,
): Promise<void> {
  const id = validateUuidParam(String(req.params.id), "id");
  try {
    if (req.body.confirm !== "1") {
      throw new AppError("Debe confirmar que entiende que es un envío real.", 400);
    }
    const provider = await getSmsProviderById(id);
    if (!provider) {
      throw new AppError("Proveedor no encontrado.", 404);
    }
    const routeId = validateUuidParam(String(req.body.route_id ?? ""), "route_id");
    const result = await sendSuperadminProviderTest({
      provider,
      routeId,
      to: String(req.body.to ?? ""),
      senderId: String(req.body.sender_id ?? ""),
      message: String(req.body.message ?? ""),
    });
    if (!result.accepted) {
      redirectQuery(res, `/admin/providers/${id}/test`, {
        error: result.errorMessage ?? "Proveedor rechazó el envío",
      });
      return;
    }
    redirectQuery(res, `/admin/providers/${id}/test`, {
      test_ok: "1",
      mid: result.messageId,
      pmid: result.providerMessageId ?? "",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirectQuery(res, `/admin/providers/${id}/test`, { error: msg });
  }
}

export async function getSaRoutesPageTelco(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const routes = await listSmsRoutes();
    const providers = await listSmsProviders();
    res.type("html").send(
      renderSaRoutesPage({
        admin: req.adminUser!,
        routes,
        providers,
        tablesReady: true,
        ...flash(req),
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function postCreateRoute(req: Request, res: Response): Promise<void> {
  try {
    await createSmsRoute({
      providerId: validateUuidParam(String(req.body.provider_id), "provider_id"),
      name: String(req.body.name ?? ""),
      country: String(req.body.country ?? "CL"),
      operatorName: String(req.body.operator_name ?? "") || null,
      routeType: String(req.body.route_type ?? "hq"),
      trafficType: String(req.body.traffic_type ?? "transactional"),
      costPerSms: Number(req.body.cost_per_sms ?? 0),
      currency: String(req.body.currency ?? "USD"),
      isDefault: req.body.is_default === "1",
    });
    redirectQuery(res, "/admin/routes", { ok: "Ruta creada" });
  } catch (e) {
    redirectQuery(res, "/admin/routes", {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function postToggleRoute(req: Request, res: Response): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id), "id");
    const status = req.body.status === "active" ? "active" : "inactive";
    await updateSmsRoute(id, { status });
    redirectQuery(res, "/admin/routes", { ok: "Ruta actualizada" });
  } catch (e) {
    redirectQuery(res, "/admin/routes", {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function getSaRatePlansPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const plans = await listSmsRatePlans();
    res.type("html").send(
      renderSaRatePlansPage({
        admin: req.adminUser!,
        ratePlans: plans,
        ...flash(req),
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function getSaRatePlanDetailPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id), "id");
    const plan = await getSmsRatePlanById(id);
    if (!plan) {
      redirectQuery(res, "/admin/rate-plans", { error: "Plan no encontrado" });
      return;
    }
    const details = await listRatePlanDetails(id);
    const routes = await listSmsRoutes();
    res.type("html").send(
      renderSaRatePlanDetailPage({
        admin: req.adminUser!,
        ratePlan: plan,
        details,
        routes,
        ...flash(req),
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function postCreateRatePlan(req: Request, res: Response): Promise<void> {
  try {
    const plan = await createSmsRatePlan({
      name: String(req.body.name ?? ""),
      code: String(req.body.code ?? ""),
      currency: String(req.body.currency ?? "CLP"),
      description: String(req.body.description ?? "") || null,
    });
    redirectQuery(res, `/admin/rate-plans/${plan.id}`, { ok: "Rate plan creado" });
  } catch (e) {
    redirectQuery(res, "/admin/rate-plans", {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function postCreateRatePlanDetail(
  req: Request,
  res: Response,
): Promise<void> {
  const planId = validateUuidParam(String(req.params.id), "id");
  try {
    await createRatePlanDetail({
      ratePlanId: planId,
      routeId: validateUuidParam(String(req.body.route_id), "route_id"),
      country: String(req.body.country ?? "CL"),
      operatorName: String(req.body.operator_name ?? "") || null,
      trafficType: String(req.body.traffic_type ?? "transactional"),
      sellPricePerSms: Number(req.body.sell_price_per_sms ?? 1),
      costPricePerSms: Number(req.body.cost_price_per_sms ?? 0),
      currency: String(req.body.currency ?? "CLP"),
    });
    redirectQuery(res, `/admin/rate-plans/${planId}`, { ok: "Tarifa agregada" });
  } catch (e) {
    redirectQuery(res, `/admin/rate-plans/${planId}`, {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function postAssignCompanyRatePlan(
  req: Request,
  res: Response,
): Promise<void> {
  const companyId = validateUuidParam(String(req.params.companyId), "companyId");
  try {
    await assignCompanyRatePlan({
      companyId,
      ratePlanId: validateUuidParam(String(req.body.rate_plan_id), "rate_plan_id"),
      country: String(req.body.country ?? "CL"),
      trafficType: String(req.body.traffic_type ?? "transactional"),
    });
    redirectQuery(res, `/admin/wallets/${companyId}`, {
      ok: "Rate plan asignado al cliente",
    });
  } catch (e) {
    redirectQuery(res, `/admin/wallets/${companyId}`, {
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export async function getSaClientsPageTelco(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companies = await listCompanies(100);
    const withPlans = await Promise.all(
      companies.map(async (c) => {
        const rp = await getCompanyRatePlan(c.id);
        return { company: c, ratePlan: rp };
      }),
    );
    res.type("html").send(
      renderSaClientsPage({
        admin: req.adminUser!,
        clients: withPlans,
        useReal: true,
        ...flash(req),
      }),
    );
  } catch (e) {
    next(e);
  }
}
