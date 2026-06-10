import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { normalizeAuditEmail } from "./adminDataAuditClassifier.js";
import {
  claimBillingEmailSend,
  completeBillingEmailSend,
  failBillingEmailSend,
  hasActiveOrSentBillingEmail,
  INVOICE_RECEIPT_EMAIL_TYPE,
  normalizeBillingRecipientEmail,
  PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
} from "./billingEmailClaimService.js";
import { getInvoiceByOrderId } from "./billingInvoiceService.js";
import { listActiveCompanyRatePlans } from "./companyRatePlanService.js";
import { getOrderById } from "./smsOrderService.js";
import { getCompanyBalance } from "./smsWalletService.js";
import { sendTransactionalEmail } from "./transactionalEmailService.js";
import {
  orderRefLabel,
  renderPurchaseActivationNotice,
} from "./transactionalEmailTemplates.js";

export const PURCHASE_ACTIVATION_SEND_CONFIRM = "ENVIAR AVISO BOLSA ACTIVA";

export type PurchaseActivationNoticeRow = {
  email: string;
  orderId: string;
  companyId: string | null;
  smsQuantity: number;
  walletBalance: number | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  ratePlanName: string | null;
  hasReceiptSent: boolean;
  hasActivationNoticeSent: boolean;
  wouldSend: boolean;
  reason: string;
};

function orderEmail(order: SmsOrderRow): string {
  return normalizeAuditEmail(order.checkout_email ?? order.payer_email);
}

function documentNumber(invoice: {
  id: string;
  invoice_number: string | null;
}): string {
  return (
    invoice.invoice_number?.trim() ||
    `DOC-${invoice.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`
  );
}

export async function hasActiveOrSentPurchaseActivationNotice(
  orderId: string,
  toEmail: string,
  invoiceId?: string | null,
): Promise<boolean> {
  const normalized = normalizeBillingRecipientEmail(toEmail);

  const { data: emailLogs, error: elErr } = await getSupabase()
    .from("email_logs")
    .select("id, status")
    .eq("order_id", orderId)
    .eq("template_key", PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE)
    .eq("recipient_email", normalized)
    .in("status", ["pending", "sent"]);

  if (elErr) {
    console.warn("[purchase-activation] email_logs check failed", elErr);
  } else if ((emailLogs ?? []).length > 0) {
    return true;
  }

  if (invoiceId) {
    if (
      await hasActiveOrSentBillingEmail(
        invoiceId,
        toEmail,
        PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
      )
    ) {
      return true;
    }
  }

  const { data: billingLogs, error: blErr } = await getSupabase()
    .from("billing_email_logs")
    .select("id, metadata")
    .eq("email_type", PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE)
    .eq("to_email_normalized", normalized)
    .in("status", ["sending", "sent"]);

  if (blErr) {
    console.warn("[purchase-activation] billing_email_logs check failed", blErr);
    return false;
  }

  return (billingLogs ?? []).some(
    (row) =>
      (row.metadata as Record<string, unknown> | null)?.order_id === orderId,
  );
}

async function resolveRatePlanName(companyId: string): Promise<string> {
  const plans = await listActiveCompanyRatePlans(companyId, "CL");
  const code =
    (plans[0] as { rate_plan_code?: string } | undefined)?.rate_plan_code ??
    plans[0]?.rate_plan_id;
  return code ?? "TELVOICE_CL_RETAIL";
}

async function buildRowForOrder(
  order: SmsOrderRow,
  options?: { isResend?: boolean },
): Promise<PurchaseActivationNoticeRow> {
  const email = orderEmail(order);
  const invoice = await getInvoiceByOrderId(order.id);
  const invoiceNumber = invoice ? documentNumber(invoice) : null;

  let walletBalance: number | null = null;
  let ratePlanName: string | null = null;
  if (order.company_id) {
    const balance = await getCompanyBalance(order.company_id, "CL");
    walletBalance = balance.availableSms;
    ratePlanName = await resolveRatePlanName(order.company_id);
  }

  const hasReceiptSent = invoice
    ? await hasActiveOrSentBillingEmail(
        invoice.id,
        email,
        INVOICE_RECEIPT_EMAIL_TYPE,
      )
    : false;

  const hasActivationNoticeSent =
    !options?.isResend &&
    (await hasActiveOrSentPurchaseActivationNotice(
      order.id,
      email,
      invoice?.id,
    ));

  let wouldSend = false;
  let reason = "ok";

  if (!email) {
    reason = "missing_email";
  } else if (order.payment_status !== "paid") {
    reason = "not_paid";
  } else if (order.credit_status !== "credited") {
    reason = "not_credited";
  } else if (!order.company_id) {
    reason = "missing_company";
  } else if (!invoice) {
    reason = "missing_invoice";
  } else if (!hasReceiptSent) {
    reason = "receipt_not_sent";
  } else if (hasActivationNoticeSent) {
    reason = "activation_notice_already_sent";
  } else {
    wouldSend = true;
    reason = "eligible";
  }

  return {
    email,
    orderId: order.id,
    companyId: order.company_id,
    smsQuantity: order.sms_quantity,
    walletBalance,
    invoiceId: invoice?.id ?? null,
    invoiceNumber,
    ratePlanName,
    hasReceiptSent,
    hasActivationNoticeSent,
    wouldSend,
    reason,
  };
}

export async function assessPurchaseActivationNotice(
  emailInput: string,
): Promise<PurchaseActivationNoticeRow[]> {
  const email = normalizeAuditEmail(emailInput);
  if (!email) return [];

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("id")
    .eq("payment_status", "paid")
    .eq("credit_status", "credited")
    .or(`checkout_email.ilike.${email},payer_email.ilike.${email}`);

  if (error) wrapSupabaseError(error, "assessPurchaseActivationNotice");

  const rows: PurchaseActivationNoticeRow[] = [];
  for (const raw of data ?? []) {
    const order = await getOrderById(String(raw.id));
    if (order) rows.push(await buildRowForOrder(order));
  }
  return rows;
}

export async function assessAllPurchaseActivationNotices(): Promise<
  PurchaseActivationNoticeRow[]
> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("id")
    .eq("payment_status", "paid")
    .eq("credit_status", "credited")
    .order("credited_at", { ascending: false })
    .limit(200);

  if (error) wrapSupabaseError(error, "assessAllPurchaseActivationNotices");

  const rows: PurchaseActivationNoticeRow[] = [];
  for (const raw of data ?? []) {
    const order = await getOrderById(String(raw.id));
    if (order) rows.push(await buildRowForOrder(order));
  }
  return rows;
}

function logActivationEvent(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      event: `purchase_activation_notice.${event}`,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

export async function sendPurchaseActivationNotice(
  emailInput: string,
  options: {
    dryRun?: boolean;
    isResend?: boolean;
    resendReason?: string;
    requestedBy?: string | null;
  } = {},
): Promise<{
  results: Array<
    PurchaseActivationNoticeRow & {
      sent?: boolean;
      skipped?: boolean;
      error?: string;
    }
  >;
}> {
  const assessments = await assessPurchaseActivationNotice(emailInput);
  const results: Array<
    PurchaseActivationNoticeRow & {
      sent?: boolean;
      skipped?: boolean;
      error?: string;
    }
  > = [];

  for (const row of assessments) {
    if (options.dryRun !== false) {
      results.push(row);
      continue;
    }

    if (!row.wouldSend && !options.isResend) {
      results.push({ ...row, skipped: true });
      continue;
    }

    const order = await getOrderById(row.orderId);
    if (!order?.company_id || !row.invoiceId) {
      results.push({ ...row, skipped: true, error: "missing_data" });
      continue;
    }

    const rendered = renderPurchaseActivationNotice({
      customerName: row.email.split("@")[0] || "Cliente",
      smsQuantity: row.smsQuantity,
      walletBalance: row.walletBalance ?? row.smsQuantity,
      ratePlanName: row.ratePlanName ?? "TELVOICE_CL_RETAIL",
      orderId: row.orderId,
      orderRef: orderRefLabel(
        row.orderId,
        order.public_checkout_reference ?? null,
      ),
      invoiceNumber: row.invoiceNumber ?? "—",
      appLoginUrl: `${env.publicAppUrl.replace(/\/$/, "")}/app/dashboard`,
    });

    const claim = await claimBillingEmailSend({
      invoiceId: row.invoiceId,
      companyId: order.company_id,
      toEmail: row.email,
      subject: rendered.subject,
      provider: env.transactionalEmail.provider || "resend",
      emailType: PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
      source: "purchase_activation_notice",
      metadata: {
        order_id: row.orderId,
        ...(options.isResend === true
          ? {
              is_resend: true,
              resend_reason: options.resendReason ?? null,
              requested_by: options.requestedBy ?? null,
            }
          : {}),
      },
    });

    if (!claim.claimed) {
      logActivationEvent("skipped_duplicate", {
        orderId: row.orderId,
        email: row.email,
        reason: claim.reason,
      });
      results.push({
        ...row,
        skipped: true,
        hasActivationNoticeSent: true,
        reason: claim.reason,
      });
      continue;
    }

    const txResult = await sendTransactionalEmail({
      templateKey: PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
      subject: rendered.subject,
      recipientEmail: row.email,
      html: rendered.html,
      text: rendered.text,
      orderId: row.orderId,
      invoiceId: row.invoiceId,
      companyId: order.company_id,
      skipIdempotency: options.isResend === true,
      metadata: {
        invoice_number: row.invoiceNumber,
        is_resend: options.isResend === true,
        resend_reason: options.resendReason ?? null,
        requested_by: options.requestedBy ?? null,
      },
    });

    if (!txResult.ok) {
      await failBillingEmailSend({
        logId: claim.logId,
        errorMessage: txResult.error ?? "send_failed",
      });
      logActivationEvent("failed", {
        orderId: row.orderId,
        email: row.email,
        error: txResult.error,
      });
      results.push({ ...row, sent: false, error: txResult.error });
      continue;
    }

    await completeBillingEmailSend({
      logId: claim.logId,
      providerMessageId: null,
    });

    logActivationEvent("sent", {
      orderId: row.orderId,
      email: row.email,
      invoiceId: row.invoiceId,
      is_resend: options.isResend === true,
    });

    results.push({ ...row, sent: true, skipped: txResult.skipped });
  }

  return { results };
}

export async function sendAllPurchaseActivationNotices(options: {
  dryRun?: boolean;
  confirm?: string;
  isResend?: boolean;
}): Promise<{ results: PurchaseActivationNoticeRow[] }> {
  if (options.dryRun === false && options.confirm !== PURCHASE_ACTIVATION_SEND_CONFIRM) {
    throw new Error(
      `Apply masivo requiere --confirm="${PURCHASE_ACTIVATION_SEND_CONFIRM}".`,
    );
  }

  const rows = await assessAllPurchaseActivationNotices();
  const results: PurchaseActivationNoticeRow[] = [];

  for (const row of rows.filter((r) => r.wouldSend)) {
    if (options.dryRun !== false) {
      results.push(row);
      continue;
    }
    const sent = await sendPurchaseActivationNotice(row.email, {
      dryRun: false,
      isResend: options.isResend,
    });
    results.push(...sent.results);
  }

  return { results };
}
