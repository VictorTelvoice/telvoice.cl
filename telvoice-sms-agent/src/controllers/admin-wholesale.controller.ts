import type { NextFunction, Request, Response } from "express";
import {
  createWholesaleCustomer,
  createWholesaleOpportunity,
  createWholesaleProvider,
  createWholesaleRateOffer,
  createWholesaleRoute,
  createWholesaleRouteTest,
  deleteWholesaleCustomer,
  deleteWholesaleOpportunity,
  deleteWholesaleProvider,
  deleteWholesaleRateOffer,
  deleteWholesaleRoute,
  deleteWholesaleRouteTest,
  getWholesaleCustomerById,
  getWholesaleOpportunityById,
  getWholesaleProviderById,
  getWholesaleRateOfferById,
  getWholesaleRouteById,
  getWholesaleRouteTestById,
  buildWholesaleDashboardSnapshot,
  listWholesaleCustomers,
  listWholesaleOpportunities,
  listWholesaleProviders,
  listWholesaleRateOffers,
  listWholesaleRouteTests,
  listWholesaleRoutes,
  parseWholesaleCustomerForm,
  parseWholesaleOpportunityForm,
  parseWholesaleProviderForm,
  parseWholesaleRateOfferForm,
  parseWholesaleRouteForm,
  parseWholesaleRouteTestForm,
  updateWholesaleCustomer,
  updateWholesaleOpportunity,
  updateWholesaleProvider,
  updateWholesaleRateOffer,
  updateWholesaleRoute,
  updateWholesaleRouteTest,
} from "../services/wholesaleService.js";
import { listSmppConnections } from "../services/smppLabService.js";
import { listInternationalRatePlans } from "../services/wholesaleInternationalRateService.js";
import { ValidationError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  renderWholesaleCustomerFormPage,
  renderWholesaleCustomersListPage,
  renderWholesaleHubPage,
  renderWholesaleOpportunitiesListPage,
  renderWholesaleOpportunityFormPage,
  renderWholesaleProviderFormPage,
  renderWholesaleProvidersListPage,
  renderWholesaleRateOfferFormPage,
  renderWholesaleRateOffersListPage,
  renderWholesaleRouteFormPage,
  renderWholesaleRouteTestFormPage,
  renderWholesaleRouteTestsListPage,
  renderWholesaleRoutesListPage,
} from "../views/admin-ui/sections/wholesale-pages.js";

function flash(req: Request): { success?: string; error?: string } {
  return {
    success: typeof req.query.success === "string" ? req.query.success : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

// ── Hub ────────────────────────────────────────────────────────────────────────

export async function getWholesaleHub(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dashboard = await buildWholesaleDashboardSnapshot();
    res.type("html").send(
      renderWholesaleHubPage({
        admin: req.adminUser!,
        dashboard,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

// ── Providers ──────────────────────────────────────────────────────────────────

export async function getWholesaleProvidersList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const providers = await listWholesaleProviders();
    res.type("html").send(
      renderWholesaleProvidersListPage({
        admin: req.adminUser!,
        providers,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export function getWholesaleProviderNewForm(req: Request, res: Response): void {
  res.type("html").send(
    renderWholesaleProviderFormPage({
      admin: req.adminUser!,
      mode: "create",
      error: typeof req.query.error === "string" ? req.query.error : undefined,
    }),
  );
}

export async function postCreateWholesaleProvider(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await createWholesaleProvider(parseWholesaleProviderForm(req.body));
    res.redirect(
      `/admin/wholesale/providers?success=${encodeURIComponent("Proveedor creado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      res.type("html").send(
        renderWholesaleProviderFormPage({
          admin: req.adminUser!,
          mode: "create",
          error: error.message,
          values: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getWholesaleProviderEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const provider = await getWholesaleProviderById(id);
    res.type("html").send(
      renderWholesaleProviderFormPage({
        admin: req.adminUser!,
        mode: "edit",
        provider,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditWholesaleProvider(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await updateWholesaleProvider(id, parseWholesaleProviderForm(req.body));
    res.redirect(
      `/admin/wholesale/providers?success=${encodeURIComponent("Proveedor actualizado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const id = String(req.params.id ?? "");
      try {
        const provider = await getWholesaleProviderById(validateUuidParam(id, "id"));
        res.type("html").send(
          renderWholesaleProviderFormPage({
            admin: req.adminUser!,
            mode: "edit",
            provider,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function postDeleteWholesaleProvider(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteWholesaleProvider(id);
    res.redirect(
      `/admin/wholesale/providers?success=${encodeURIComponent("Proveedor eliminado.")}`,
    );
  } catch (error) {
    next(error);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function getWholesaleRoutesList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [routes, providers] = await Promise.all([
      listWholesaleRoutes(),
      listWholesaleProviders(),
    ]);
    res.type("html").send(
      renderWholesaleRoutesListPage({
        admin: req.adminUser!,
        routes,
        providers,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getWholesaleRouteNewForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [providers, smppConnections, ratePlans] = await Promise.all([
      listWholesaleProviders(),
      listSmppConnections(),
      listInternationalRatePlans(),
    ]);
    res.type("html").send(
      renderWholesaleRouteFormPage({
        admin: req.adminUser!,
        mode: "create",
        providers,
        smppConnections,
        ratePlans,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateWholesaleRoute(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await createWholesaleRoute(parseWholesaleRouteForm(req.body));
    res.redirect(
      `/admin/wholesale/routes?success=${encodeURIComponent("Ruta creada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const [providers, smppConnections, ratePlans] = await Promise.all([
        listWholesaleProviders(),
        listSmppConnections(),
        listInternationalRatePlans(),
      ]);
      res.type("html").send(
        renderWholesaleRouteFormPage({
          admin: req.adminUser!,
          mode: "create",
          providers,
          smppConnections,
          ratePlans,
          error: error.message,
          values: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getWholesaleRouteEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const [route, providers, smppConnections, ratePlans] = await Promise.all([
      getWholesaleRouteById(id),
      listWholesaleProviders(),
      listSmppConnections(),
      listInternationalRatePlans(),
    ]);
    res.type("html").send(
      renderWholesaleRouteFormPage({
        admin: req.adminUser!,
        mode: "edit",
        route,
        providers,
        smppConnections,
        ratePlans,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditWholesaleRoute(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await updateWholesaleRoute(id, parseWholesaleRouteForm(req.body));
    res.redirect(
      `/admin/wholesale/routes?success=${encodeURIComponent("Ruta actualizada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const routeId = String(req.params.id ?? "");
      try {
        const [route, providers, smppConnections, ratePlans] = await Promise.all([
          getWholesaleRouteById(validateUuidParam(routeId, "id")),
          listWholesaleProviders(),
          listSmppConnections(),
          listInternationalRatePlans(),
        ]);
        res.type("html").send(
          renderWholesaleRouteFormPage({
            admin: req.adminUser!,
            mode: "edit",
            route,
            providers,
            smppConnections,
            ratePlans,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function postDeleteWholesaleRoute(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteWholesaleRoute(id);
    res.redirect(
      `/admin/wholesale/routes?success=${encodeURIComponent("Ruta eliminada.")}`,
    );
  } catch (error) {
    next(error);
  }
}

// ── Rate offers ──────────────────────────────────────────────────────────────

export async function getWholesaleRateOffersList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const offers = await listWholesaleRateOffers();
    res.type("html").send(
      renderWholesaleRateOffersListPage({
        admin: req.adminUser!,
        offers,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getWholesaleRateOfferNewForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const providers = await listWholesaleProviders();
    res.type("html").send(
      renderWholesaleRateOfferFormPage({
        admin: req.adminUser!,
        mode: "create",
        providers,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateWholesaleRateOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await createWholesaleRateOffer(parseWholesaleRateOfferForm(req.body));
    res.redirect(
      `/admin/wholesale/rates?success=${encodeURIComponent("Oferta registrada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const providers = await listWholesaleProviders();
      res.type("html").send(
        renderWholesaleRateOfferFormPage({
          admin: req.adminUser!,
          mode: "create",
          providers,
          error: error.message,
          values: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getWholesaleRateOfferEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const [offer, providers] = await Promise.all([
      getWholesaleRateOfferById(id),
      listWholesaleProviders(),
    ]);
    res.type("html").send(
      renderWholesaleRateOfferFormPage({
        admin: req.adminUser!,
        mode: "edit",
        offer,
        providers,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditWholesaleRateOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await updateWholesaleRateOffer(id, parseWholesaleRateOfferForm(req.body));
    res.redirect(
      `/admin/wholesale/rates?success=${encodeURIComponent("Oferta actualizada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const offerId = String(req.params.id ?? "");
      try {
        const [offer, providers] = await Promise.all([
          getWholesaleRateOfferById(validateUuidParam(offerId, "id")),
          listWholesaleProviders(),
        ]);
        res.type("html").send(
          renderWholesaleRateOfferFormPage({
            admin: req.adminUser!,
            mode: "edit",
            offer,
            providers,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function postDeleteWholesaleRateOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteWholesaleRateOffer(id);
    res.redirect(
      `/admin/wholesale/rates?success=${encodeURIComponent("Oferta eliminada.")}`,
    );
  } catch (error) {
    next(error);
  }
}

// ── Route tests ────────────────────────────────────────────────────────────────

export async function getWholesaleRouteTestsList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tests = await listWholesaleRouteTests();
    res.type("html").send(
      renderWholesaleRouteTestsListPage({
        admin: req.adminUser!,
        tests,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getWholesaleRouteTestNewForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [providers, routes] = await Promise.all([
      listWholesaleProviders(),
      listWholesaleRoutes(),
    ]);
    res.type("html").send(
      renderWholesaleRouteTestFormPage({
        admin: req.adminUser!,
        mode: "create",
        providers,
        routes,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateWholesaleRouteTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await createWholesaleRouteTest(parseWholesaleRouteTestForm(req.body));
    res.redirect(
      `/admin/wholesale/route-tests?success=${encodeURIComponent("Prueba registrada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const [providers, routes] = await Promise.all([
        listWholesaleProviders(),
        listWholesaleRoutes(),
      ]);
      res.type("html").send(
        renderWholesaleRouteTestFormPage({
          admin: req.adminUser!,
          mode: "create",
          providers,
          routes,
          error: error.message,
          values: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getWholesaleRouteTestEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const [test, providers, routes] = await Promise.all([
      getWholesaleRouteTestById(id),
      listWholesaleProviders(),
      listWholesaleRoutes(),
    ]);
    res.type("html").send(
      renderWholesaleRouteTestFormPage({
        admin: req.adminUser!,
        mode: "edit",
        test,
        providers,
        routes,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditWholesaleRouteTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await updateWholesaleRouteTest(id, parseWholesaleRouteTestForm(req.body));
    res.redirect(
      `/admin/wholesale/route-tests?success=${encodeURIComponent("Prueba actualizada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const testId = String(req.params.id ?? "");
      try {
        const [test, providers, routes] = await Promise.all([
          getWholesaleRouteTestById(validateUuidParam(testId, "id")),
          listWholesaleProviders(),
          listWholesaleRoutes(),
        ]);
        res.type("html").send(
          renderWholesaleRouteTestFormPage({
            admin: req.adminUser!,
            mode: "edit",
            test,
            providers,
            routes,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function postDeleteWholesaleRouteTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteWholesaleRouteTest(id);
    res.redirect(
      `/admin/wholesale/route-tests?success=${encodeURIComponent("Prueba eliminada.")}`,
    );
  } catch (error) {
    next(error);
  }
}

// ── Customers ──────────────────────────────────────────────────────────────────

export async function getWholesaleCustomersList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customers = await listWholesaleCustomers();
    res.type("html").send(
      renderWholesaleCustomersListPage({
        admin: req.adminUser!,
        customers,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export function getWholesaleCustomerNewForm(req: Request, res: Response): void {
  res.type("html").send(
    renderWholesaleCustomerFormPage({
      admin: req.adminUser!,
      mode: "create",
      error: typeof req.query.error === "string" ? req.query.error : undefined,
    }),
  );
}

export async function postCreateWholesaleCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await createWholesaleCustomer(parseWholesaleCustomerForm(req.body));
    res.redirect(
      `/admin/wholesale/customers?success=${encodeURIComponent("Cliente registrado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      res.type("html").send(
        renderWholesaleCustomerFormPage({
          admin: req.adminUser!,
          mode: "create",
          error: error.message,
          values: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getWholesaleCustomerEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const customer = await getWholesaleCustomerById(id);
    res.type("html").send(
      renderWholesaleCustomerFormPage({
        admin: req.adminUser!,
        mode: "edit",
        customer,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditWholesaleCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await updateWholesaleCustomer(id, parseWholesaleCustomerForm(req.body));
    res.redirect(
      `/admin/wholesale/customers?success=${encodeURIComponent("Cliente actualizado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const customerId = String(req.params.id ?? "");
      try {
        const customer = await getWholesaleCustomerById(
          validateUuidParam(customerId, "id"),
        );
        res.type("html").send(
          renderWholesaleCustomerFormPage({
            admin: req.adminUser!,
            mode: "edit",
            customer,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function postDeleteWholesaleCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteWholesaleCustomer(id);
    res.redirect(
      `/admin/wholesale/customers?success=${encodeURIComponent("Cliente eliminado.")}`,
    );
  } catch (error) {
    next(error);
  }
}

// ── Opportunities ────────────────────────────────────────────────────────────

export async function getWholesaleOpportunitiesList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const opportunities = await listWholesaleOpportunities();
    res.type("html").send(
      renderWholesaleOpportunitiesListPage({
        admin: req.adminUser!,
        opportunities,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getWholesaleOpportunityNewForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customers = await listWholesaleCustomers();
    res.type("html").send(
      renderWholesaleOpportunityFormPage({
        admin: req.adminUser!,
        mode: "create",
        customers,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateWholesaleOpportunity(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await createWholesaleOpportunity(parseWholesaleOpportunityForm(req.body));
    res.redirect(
      `/admin/wholesale/opportunities?success=${encodeURIComponent("Oportunidad creada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const customers = await listWholesaleCustomers();
      res.type("html").send(
        renderWholesaleOpportunityFormPage({
          admin: req.adminUser!,
          mode: "create",
          customers,
          error: error.message,
          values: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getWholesaleOpportunityEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const [opportunity, customers] = await Promise.all([
      getWholesaleOpportunityById(id),
      listWholesaleCustomers(),
    ]);
    res.type("html").send(
      renderWholesaleOpportunityFormPage({
        admin: req.adminUser!,
        mode: "edit",
        opportunity,
        customers,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditWholesaleOpportunity(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await updateWholesaleOpportunity(id, parseWholesaleOpportunityForm(req.body));
    res.redirect(
      `/admin/wholesale/opportunities?success=${encodeURIComponent("Oportunidad actualizada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const oppId = String(req.params.id ?? "");
      try {
        const [opportunity, customers] = await Promise.all([
          getWholesaleOpportunityById(validateUuidParam(oppId, "id")),
          listWholesaleCustomers(),
        ]);
        res.type("html").send(
          renderWholesaleOpportunityFormPage({
            admin: req.adminUser!,
            mode: "edit",
            opportunity,
            customers,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function postDeleteWholesaleOpportunity(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteWholesaleOpportunity(id);
    res.redirect(
      `/admin/wholesale/opportunities?success=${encodeURIComponent("Oportunidad eliminada.")}`,
    );
  } catch (error) {
    next(error);
  }
}
