import type { NextFunction, Request, Response } from "express";
import { canOperateClientPanel } from "../types/roles.js";
import {
  getClientCatalogPackages,
  getClientDashboardData,
} from "../services/clientDashboardService.js";
import { findCompanyById } from "../services/companyService.js";
import { createOrder } from "../services/smsOrderService.js";
import { getCompanyBalance } from "../services/smsWalletService.js";
import { listTransactionsByCompany } from "../services/walletTransactionService.js";
import { listSmsOrdersByCompany } from "../services/smsOrderService.js";
import { validateUuidParam } from "../utils/validation.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";
import {
  renderNoCompanyPage,
} from "../views/app-ui/app-page-wrap.js";
import {
  renderAppBuySmsPage,
  renderAppDashboardPage,
  renderAppOrdersPage,
  renderAppSendSmsPage,
  renderAppWalletPage,
} from "../views/app-ui/app-pages.js";
import {
  renderAppApiPage,
  renderAppCampaignsPage,
  renderAppContactsPage,
  renderAppInboxPage,
  renderAppInvoicesPage,
  renderAppReportsPage,
  renderAppSettingsPage,
  renderAppSupportPage,
  renderAppTemplatesPage,
} from "../views/app-ui/app-section-pages.js";

function flash(req: Request): { flash?: string; error?: string } {
  return {
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

async function buildAppContext(req: Request): Promise<AppPageContext | null> {
  const profile = req.userProfile;
  if (!profile?.companyId) {
    return null;
  }

  const company = await findCompanyById(profile.companyId);
  if (!company) {
    return null;
  }

  const balance = await getCompanyBalance(profile.companyId);
  return {
    profile,
    company,
    balance,
    ...flash(req),
  };
}

async function withAppContext(
  req: Request,
  res: Response,
  next: NextFunction,
  render: (ctx: AppPageContext) => string | Promise<string>,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      const profile = req.userProfile;
      if (!profile) {
        res.redirect("/admin/login?next=%2Fapp");
        return;
      }
      res.type("html").send(renderNoCompanyPage(profile));
      return;
    }
    res.type("html").send(await render(ctx));
  } catch (error) {
    next(error);
  }
}

export function getAppRoot(_req: Request, res: Response): void {
  res.redirect("/app/dashboard");
}

export async function getAppDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const data = await getClientDashboardData(ctx.company.id);
    return renderAppDashboardPage(ctx, data);
  });
}

export async function getAppBuySms(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const packages = await getClientCatalogPackages(ctx.company.country);
    const created = req.query.created === "1";
    return renderAppBuySmsPage(ctx, packages, created);
  });
}

export async function postAppBuySms(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/app/buy-sms?error=Empresa%20no%20asociada");
      return;
    }

    if (!canOperateClientPanel(ctx.profile.role)) {
      res.redirect("/app/buy-sms?error=No%20tienes%20permiso%20para%20comprar");
      return;
    }

    const packageId = validateUuidParam(
      String(req.body?.package_id ?? ""),
      "package_id",
    );

    await createOrder({
      companyId: ctx.company.id,
      packageId,
      createdBy: ctx.profile.profileId ?? ctx.profile.adminUserId ?? undefined,
      paymentProvider: "pending_checkout",
      paymentReference: `APP-${Date.now()}`,
    });

    res.redirect("/app/buy-sms?created=1&ok=Orden%20creada%20correctamente");
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo crear la orden";
    res.redirect(`/app/buy-sms?error=${encodeURIComponent(msg)}`);
  }
}

export async function getAppWallet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const transactions = await listTransactionsByCompany(ctx.company.id, 50);
    return renderAppWalletPage(ctx, transactions);
  });
}

export async function getAppOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const orders = await listSmsOrdersByCompany(ctx.company.id, 100);
    return renderAppOrdersPage(ctx, orders);
  });
}

export async function getAppSendSms(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppSendSmsPage(ctx));
}

export async function getAppCampaigns(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppCampaignsPage(ctx));
}

export async function getAppInbox(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppInboxPage(ctx));
}

export async function getAppContacts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppContactsPage(ctx));
}

export async function getAppTemplates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppTemplatesPage(ctx));
}

export async function getAppReports(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppReportsPage(ctx));
}

export async function getAppInvoices(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppInvoicesPage(ctx));
}

export async function getAppApi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppApiPage(ctx));
}

export async function getAppSupport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppSupportPage(ctx));
}

export async function getAppSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppSettingsPage(ctx));
}
