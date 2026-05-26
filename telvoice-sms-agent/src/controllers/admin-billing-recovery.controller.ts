import type { NextFunction, Request, Response } from "express";
import { getBalanceByClientId } from "../services/balanceService.js";
import { getTestClientBundle } from "../services/clientService.js";
import { getBillingEmailMode } from "../services/billingEmailService.js";
import {
  findFailedBillingEmails,
  findFailedBillingSyncEvents,
  findInvoicesWithoutSuccessfulEmail,
  findPaidCreditedOrdersWithoutInvoice,
  getBillingRecoverySummary,
  markEmailLogReviewed,
  retryBillingSyncForOrder,
  retryFailedEmailLog,
  retryInvoiceEmail,
} from "../services/billingRecoveryService.js";
import { validateUuidParam } from "../utils/validation.js";
import { renderAdminBillingRecoveryPage } from "../views/admin-ui/sections/admin-billing-recovery-pages.js";

async function loadSmsBalance(): Promise<string | undefined> {
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

function actorFromReq(req: Request) {
  return {
    actorType: "superadmin",
    actorId: req.adminUser?.id ?? null,
  };
}

function redirectRecovery(res: Response, result: { ok: boolean; message: string }): void {
  const q = result.ok ? "ok" : "error";
  res.redirect(`/admin/invoices/recovery?${q}=${encodeURIComponent(result.message)}`);
}

export async function getAdminBillingRecoveryPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    const [summary, ordersWithout, invoicesWithout, failedEmails, failedSyncs] =
      await Promise.all([
        getBillingRecoverySummary(),
        findPaidCreditedOrdersWithoutInvoice({ limit: 100 }),
        findInvoicesWithoutSuccessfulEmail({ limit: 100 }),
        findFailedBillingEmails({ limit: 100 }),
        findFailedBillingSyncEvents({ limit: 50 }),
      ]);

    res.type("html").send(
      renderAdminBillingRecoveryPage(pageOpts(req, smsBalance), {
        summary,
        ordersWithout,
        invoicesWithout,
        failedEmails,
        failedSyncs,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postRecoveryOrderSync(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const orderId = validateUuidParam(String(req.params.orderId), "orderId");
    const result = await retryBillingSyncForOrder(orderId, actorFromReq(req));
    redirectRecovery(res, result);
  } catch (error) {
    redirectRecovery(res, {
      ok: false,
      message: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function postRecoveryInvoiceSendEmail(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const invoiceId = validateUuidParam(String(req.params.invoiceId), "invoiceId");
    const result = await retryInvoiceEmail(invoiceId, actorFromReq(req), {
      forceResend: false,
    });
    redirectRecovery(res, result);
  } catch (error) {
    redirectRecovery(res, {
      ok: false,
      message: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function postRecoveryEmailRetry(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const emailLogId = validateUuidParam(String(req.params.emailLogId), "emailLogId");
    const result = await retryFailedEmailLog(emailLogId, actorFromReq(req));
    redirectRecovery(res, result);
  } catch (error) {
    redirectRecovery(res, {
      ok: false,
      message: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function postRecoveryEmailMarkReviewed(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const emailLogId = validateUuidParam(String(req.params.emailLogId), "emailLogId");
    const result = await markEmailLogReviewed(emailLogId, actorFromReq(req));
    redirectRecovery(res, result);
  } catch (error) {
    redirectRecovery(res, {
      ok: false,
      message: error instanceof Error ? error.message : "Error",
    });
  }
}
