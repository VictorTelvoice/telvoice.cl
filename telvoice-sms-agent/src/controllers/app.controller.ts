import type { NextFunction, Request, Response } from "express";
import { canOperateClientPanel } from "../types/roles.js";
import {
  getClientCatalogPackages,
  getClientDashboardData,
} from "../services/clientDashboardService.js";
import { findCompanyById } from "../services/companyService.js";
import {
  createOrder,
  getOrderWithDetailsForCompany,
  listSmsOrdersByCompany,
} from "../services/smsOrderService.js";
import { getCompanyBalance } from "../services/smsWalletService.js";
import { listTransactionsByCompany } from "../services/walletTransactionService.js";
import { isMercadoPagoConfigured } from "../config/env.js";
import { parseOrderListFilter } from "../utils/order-display.js";
import { validateUuidParam } from "../utils/validation.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";
import {
  renderNoCompanyPage,
} from "../views/app-ui/app-page-wrap.js";
import {
  renderAppDashboardPage,
  renderAppWalletPage,
} from "../views/app-ui/app-pages.js";
import {
  renderAppCampaignsPage,
  renderAppInboxPage,
  renderAppReportsPage,
  renderAppSendSmsPage,
} from "../views/app-ui/app-sms-pages.js";
import {
  renderAppBuySmsPage,
  renderAppOrderDetailPage,
  renderAppOrderNotFoundPage,
  renderAppOrdersPage,
} from "../views/app-ui/app-order-pages.js";
import {
  renderAppApiPage,
  renderAppContactsPage,
  renderAppInvoicesPage,
  renderAppSettingsPage,
  renderAppSupportPage,
  renderAppTemplatesPage,
} from "../views/app-ui/app-section-pages.js";
import { listCampaignsByCompany } from "../services/smsCampaignService.js";
import { listPanelMessagesByCompany } from "../services/panelSmsMessageService.js";
import { getClientSmsReportData } from "../services/smsPanelReportsService.js";
import { getLiveTestSendPageStatus } from "../services/smsLiveTestLimiterService.js";
import { canCompanyUseLiveTestUi } from "../services/smsProviderStatusService.js";
import {
  getSendControlPanelView,
  resolveVerifyTestSend,
} from "../services/smsSendControlPanelService.js";
import { sendPanelSms } from "../services/smsSendService.js";
import { AppError } from "../utils/errors.js";

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
    return renderAppBuySmsPage(ctx, packages, isMercadoPagoConfigured());
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

    const order = await createOrder({
      companyId: ctx.company.id,
      packageId,
      createdBy: ctx.profile.profileId ?? ctx.profile.adminUserId ?? undefined,
      paymentProvider: "pending_checkout",
      paymentReference: `APP-${Date.now()}`,
    });

    res.redirect(`/app/orders/${order.id}?created=1`);
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
    const filter = parseOrderListFilter(
      typeof req.query.filter === "string" ? req.query.filter : undefined,
    );
    return renderAppOrdersPage(ctx, orders, filter);
  });
}

export async function getAppOrderDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const orderId = validateUuidParam(String(req.params.id), "id");
    const order = await getOrderWithDetailsForCompany(
      orderId,
      ctx.company.id,
    );
    if (!order) {
      return renderAppOrderNotFoundPage(ctx);
    }
    const showCreatedBanner = req.query.created === "1";
    return renderAppOrderDetailPage(ctx, order, {
      showCreatedBanner: showCreatedBanner,
    });
  });
}

export async function getAppSendSms(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;
    const sendEnabled = canCompanyUseLiveTestUi(ctx.company.id);
    const liveTestStatus = sendEnabled
      ? await getLiveTestSendPageStatus(ctx.company.id)
      : null;
    const controlPanel = sendEnabled
      ? await getSendControlPanelView(ctx.company.id)
      : null;
    return renderAppSendSmsPage(ctx, {
      error,
      sendEnabled,
      liveTestStatus,
      controlPanel,
    });
  });
}

export async function postAppSendSms(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/app/send-sms?error=Empresa%20no%20asociada");
      return;
    }

    if (!canOperateClientPanel(ctx.profile.role)) {
      res.redirect(
        "/app/send-sms?error=No%20tienes%20permiso%20para%20enviar%20SMS",
      );
      return;
    }

    const isVerifyTest =
      req.body?.quick_verify === "1" ||
      (typeof req.body?.verify_id === "string" && req.body.verify_id.trim());

    let to = String(req.body?.to ?? "");
    let message = String(req.body?.message ?? "");
    let campaignName =
      typeof req.body?.campaign_name === "string"
        ? req.body.campaign_name
        : undefined;

    if (isVerifyTest && typeof req.body?.verify_id === "string") {
      const resolved = resolveVerifyTestSend({
        verifyId: req.body.verify_id.trim(),
        message: req.body?.message,
      });
      if (!resolved) {
        res.redirect(
          "/app/send-sms?error=" +
            encodeURIComponent("Número de verificación no encontrado."),
        );
        return;
      }
      to = resolved.to;
      message = resolved.message;
      campaignName = `QA Verify — ${resolved.label}`;
    }

    const result = await sendPanelSms({
      companyId: ctx.company.id,
      senderId: String(req.body?.sender_id ?? "TELVOICE"),
      to,
      message,
      campaignName,
      createdBy:
        ctx.profile.profileId ?? ctx.profile.adminUserId ?? undefined,
      sendSource: isVerifyTest
        ? "app_send_sms_verify_test"
        : "app_send_sms_live_test",
    });

    const sendEnabled = canCompanyUseLiveTestUi(ctx.company.id);
    const liveTestStatus = sendEnabled
      ? await getLiveTestSendPageStatus(ctx.company.id)
      : null;
    const controlPanel = sendEnabled
      ? await getSendControlPanelView(ctx.company.id)
      : null;
    const html = renderAppSendSmsPage(ctx, {
      sendResult: result,
      sendEnabled,
      liveTestStatus,
      controlPanel,
    });
    res.type("html").send(html);
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo enviar el SMS";
    res.redirect(`/app/send-sms?error=${encodeURIComponent(msg)}`);
  }
}

export async function getAppCampaigns(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const campaigns = await listCampaignsByCompany(ctx.company.id, 100);
    return renderAppCampaignsPage(ctx, campaigns);
  });
}

export async function getAppInbox(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const messages = await listPanelMessagesByCompany(ctx.company.id, 100);
    return renderAppInboxPage(ctx, messages);
  });
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
  await withAppContext(req, res, next, async (ctx) => {
    const report = await getClientSmsReportData(ctx.company.id);
    return renderAppReportsPage(ctx, report);
  });
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
  await withAppContext(req, res, next, async (ctx) => {
    let relatedOrder = null;
    const orderParam = req.query.order;
    if (typeof orderParam === "string" && orderParam.trim()) {
      try {
        const orderId = validateUuidParam(orderParam.trim(), "order");
        relatedOrder = await getOrderWithDetailsForCompany(
          orderId,
          ctx.company.id,
        );
      } catch {
        relatedOrder = null;
      }
    }
    return renderAppSupportPage(ctx, relatedOrder);
  });
}

export async function getAppSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppSettingsPage(ctx));
}
