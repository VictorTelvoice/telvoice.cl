import type { NextFunction, Request, Response } from "express";
import { getBootstrapStatus } from "../config/bootstrap-status.js";
import { env } from "../config/env.js";
import { getBalanceByClientId } from "../services/balanceService.js";
import { getTestClientBundle } from "../services/clientService.js";
import { listCompanies } from "../services/companyService.js";
import {
  getAdminInvoiceById,
  listAdminInvoices,
  summarizeAdminInvoices,
} from "../services/billingInvoiceService.js";
import { getOrderById } from "../services/smsOrderService.js";
import {
  getInvoiceDocumentPreview,
  wrapAdminDocumentPreview,
} from "../services/billingDocumentService.js";
import {
  getBillingEmailMode,
  resendInvoiceEmail,
  sendInvoiceEmail,
} from "../services/billingEmailService.js";
import { validateUuidParam } from "../utils/validation.js";
import { renderContactsPage } from "../views/admin-ui/sections/contacts-page.js";
import { renderChatPage } from "../views/admin-ui/sections/chat-page.js";
import {
  parseAdminInvoiceFilters,
  renderAdminInvoiceDetailPage,
  renderAdminInvoiceNotFoundPage,
  renderAdminInvoicesPage,
} from "../views/admin-ui/sections/admin-invoices-pages.js";
import { renderReportsPage } from "../views/admin-ui/sections/reports-page.js";
import { renderTemplatesPage } from "../views/admin-ui/sections/templates-page.js";
import type { SmsOrderRow } from "../types/wallet.js";

async function loadSmsBalance(): Promise<string | undefined> {
  const bootstrap = getBootstrapStatus();
  if (!env.supabase.url || !env.supabase.serviceRoleKey || bootstrap.pgrestSchemaCacheIssue) {
    return undefined;
  }
  try {
    const testClient = await getTestClientBundle();
    const balance = await getBalanceByClientId(testClient.client.id);
    return balance ? String(balance.available_units) : undefined;
  } catch {
    return undefined;
  }
}

function pageOpts(req: Request, smsBalance?: string) {
  return {
    admin: req.adminUser!,
    smsBalance,
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
    billingEmailMode: getBillingEmailMode(),
  };
}

export async function getReportsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderReportsPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getContactsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderContactsPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getInvoicesPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    const filters = parseAdminInvoiceFilters(
      req.query as Record<string, string | string[] | undefined>,
    );

    const [invoices, companies] = await Promise.all([
      listAdminInvoices({
        status: filters.status,
        documentType: filters.documentType,
        companyId: filters.companyId,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        search: filters.search,
        limit: 300,
      }),
      listCompanies(200),
    ]);

    const orderById = new Map<string, SmsOrderRow>();
    const orderIds = [...new Set(invoices.map((i) => i.order_id))];
    await Promise.all(
      orderIds.map(async (orderId) => {
        const order = await getOrderById(orderId);
        if (order) {
          orderById.set(orderId, order);
        }
      }),
    );

    const summary = summarizeAdminInvoices(invoices, orderById);

    res.type("html").send(
      renderAdminInvoicesPage(pageOpts(req, smsBalance), {
        invoices,
        filters,
        summary,
        companies,
        orderById,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getAdminInvoiceDetailPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    const invoiceId = validateUuidParam(String(req.params.id), "id");
    const detail = await getAdminInvoiceById(invoiceId);

    if (!detail) {
      res.type("html").send(renderAdminInvoiceNotFoundPage(pageOpts(req, smsBalance)));
      return;
    }

    res.type("html").send(
      renderAdminInvoiceDetailPage(pageOpts(req, smsBalance), detail),
    );
  } catch (error) {
    next(error);
  }
}

function redirectInvoiceEmailResult(
  res: Response,
  invoiceId: string,
  result: { success: boolean; message: string },
): void {
  const q = result.success ? "ok" : "error";
  res.redirect(
    `/admin/invoices/${invoiceId}?${q}=${encodeURIComponent(result.message)}`,
  );
}

export async function postAdminInvoiceSendEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const invoiceId = validateUuidParam(String(req.params.id), "id");
    const result = await sendInvoiceEmail(invoiceId, {
      actorType: "superadmin",
      actorId: req.adminUser?.id ?? null,
      source: "admin_invoice_send_email",
    });
    redirectInvoiceEmailResult(res, invoiceId, result);
  } catch (error) {
    next(error);
  }
}

export async function postAdminInvoiceResendEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const invoiceId = validateUuidParam(String(req.params.id), "id");
    const result = await resendInvoiceEmail(invoiceId, {
      actorType: "superadmin",
      actorId: req.adminUser?.id ?? null,
      source: "admin_invoice_resend_email",
    });
    redirectInvoiceEmailResult(res, invoiceId, result);
  } catch (error) {
    next(error);
  }
}

export async function getAdminInvoicePreviewPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const invoiceId = validateUuidParam(String(req.params.id), "id");
    const preview = await getInvoiceDocumentPreview(invoiceId);

    if (!preview) {
      res
        .status(404)
        .type("html")
        .send(
          "<!DOCTYPE html><html lang=\"es\"><body style=\"font-family:system-ui;padding:2rem\"><h1>Documento no encontrado</h1><p><a href=\"/admin/invoices\">Volver a facturación</a></p></body></html>",
        );
      return;
    }

    const html = wrapAdminDocumentPreview(preview.html, {
      invoiceId,
      documentNumber: preview.documentNumber,
      backHref: `/admin/invoices/${invoiceId}`,
    });

    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
}

export async function getTemplatesPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderTemplatesPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getChatPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderChatPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

/** Alias amigable sin romper /admin/sms/send-test */
export function redirectSendSmsAlias(_req: Request, res: Response): void {
  res.redirect(301, "/admin/sms/send-test");
}
