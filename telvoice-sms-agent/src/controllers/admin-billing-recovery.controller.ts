import type { NextFunction, Request, Response } from "express";
import { getBalanceByClientId } from "../services/balanceService.js";
import { getTestClientBundle } from "../services/clientService.js";
import { getBillingEmailMode } from "../services/billingEmailService.js";
import {
  BILLING_RECOVERY_EXCLUSION_REASONS,
} from "../types/billing.js";
import {
  findFailedBillingEmails,
  findFailedBillingSyncEvents,
  findInvoicesWithoutSuccessfulEmail,
  findPaidCreditedOrdersWithoutInvoice,
  getBillingRecoverySummary,
  isValidBillingRecoveryReason,
  markEmailLogReviewed,
  markOrderBillingReviewed,
  retryBillingSyncForOrder,
  retryFailedEmailLog,
  retryInvoiceEmail,
  unmarkOrderBillingReviewed,
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
    const showExcluded = req.query.show_excluded === "1";
    const [summary, ordersWithout, ordersExcluded, invoicesWithout, failedEmails, failedSyncs] =
      await Promise.all([
        getBillingRecoverySummary(),
        findPaidCreditedOrdersWithoutInvoice({ limit: 100 }),
        findPaidCreditedOrdersWithoutInvoice({ limit: 100, onlyExcluded: true }),
        findInvoicesWithoutSuccessfulEmail({ limit: 100 }),
        findFailedBillingEmails({ limit: 100 }),
        findFailedBillingSyncEvents({ limit: 50 }),
      ]);

    res.type("html").send(
      renderAdminBillingRecoveryPage(pageOpts(req, smsBalance), {
        summary,
        ordersWithout,
        ordersExcluded,
        showExcluded,
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

export async function postRecoveryOrderMarkReviewed(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const orderId = validateUuidParam(String(req.params.orderId), "orderId");
    const reason = String(req.body?.reason ?? "demo_qa_order").trim();
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : undefined;
    const excluded =
      req.body?.excluded === undefined ||
      req.body?.excluded === "true" ||
      req.body?.excluded === true;

    if (!isValidBillingRecoveryReason(reason)) {
      redirectRecovery(res, {
        ok: false,
        message: `Motivo inválido. Use: ${BILLING_RECOVERY_EXCLUSION_REASONS.join(", ")}`,
      });
      return;
    }

    const admin = req.adminUser;
    const result = await markOrderBillingReviewed({
      orderId,
      reviewedBy: admin?.email ?? "superadmin",
      actor: actorFromReq(req),
      reason,
      notes,
      excluded,
    });
    redirectRecovery(res, result);
  } catch (error) {
    redirectRecovery(res, {
      ok: false,
      message: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function postRecoveryOrderUnmarkReviewed(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const orderId = validateUuidParam(String(req.params.orderId), "orderId");
    const result = await unmarkOrderBillingReviewed(orderId, actorFromReq(req));
    const q = result.ok ? "ok" : "error";
    const show = req.query.show_excluded === "1" ? "&show_excluded=1" : "";
    res.redirect(
      `/admin/invoices/recovery?${q}=${encodeURIComponent(result.message)}${show}`,
    );
  } catch (error) {
    redirectRecovery(res, {
      ok: false,
      message: error instanceof Error ? error.message : "Error",
    });
  }
}
