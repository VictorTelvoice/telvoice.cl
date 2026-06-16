import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { normalizeAuditEmail } from "./adminDataAuditClassifier.js";
import { resolveTransactionalRecipient } from "./transactionalEmailService.js";
import { sendInvoiceEmail } from "./billingEmailService.js";
import {
  claimBillingEmailSend,
  completeBillingEmailSend,
  failBillingEmailSend,
  PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
} from "./billingEmailClaimService.js";
import { getInvoiceByOrderId } from "./billingInvoiceService.js";
import { listActiveCompanyRatePlans } from "./companyRatePlanService.js";
import {
  assessPurchaseActivationNoticeEmail,
  assessPurchaseReceiptEmail,
  assessWelcomeSmsCreditedEmail,
  billingProviderMode,
  type EmailStepAssessment,
  type EmailStepStatus,
  type PostPurchaseEmailKind,
  transactionalProviderMode,
} from "./postPurchaseEmailStatus.js";
import { getOrderById } from "./smsOrderService.js";
import { getCompanyBalance } from "./smsWalletService.js";
import {
  sendTransactionalEmail,
  sendWelcomeAndSmsCreditedEmail,
} from "./transactionalEmailService.js";
import {
  orderRefLabel,
  renderPurchaseActivationNotice,
} from "./transactionalEmailTemplates.js";

export const POST_PURCHASE_SEND_CONFIRM = "ENVIAR NOTIFICACIONES POST COMPRA";

/** @deprecated use POST_PURCHASE_SEND_CONFIRM */
export const PURCHASE_ACTIVATION_SEND_CONFIRM = POST_PURCHASE_SEND_CONFIRM;

export type PostPurchaseNotificationPlan = {
  email: string;
  orderId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  companyId: string | null;
  smsQuantity: number;
  walletBalance: number | null;
  ratePlanName: string | null;
  hasReceipt: boolean;
  hasWelcomeSmsCredited: boolean;
  hasActivationNotice: boolean;
  missingEmails: PostPurchaseEmailKind[];
  wouldSend: PostPurchaseEmailKind[];
  blocked: PostPurchaseEmailKind[];
  reasons: string[];
  emails: {
    receipt: EmailStepAssessment & { label: "receipt" };
    welcome: EmailStepAssessment & { label: "welcome" };
    activation_notice: EmailStepAssessment & { label: "activation_notice" };
  };
  providerModes: {
    billing: string;
    transactional: string;
  };
};

function orderEmail(order: SmsOrderRow): string {
  return normalizeAuditEmail(order.checkout_email ?? order.payer_email);
}

async function resolvePlanEmail(order: SmsOrderRow): Promise<string> {
  const fromOrder = orderEmail(order);
  if (fromOrder) {
    return fromOrder;
  }
  const resolved = await resolveTransactionalRecipient(order);
  return normalizeAuditEmail(resolved.email ?? "");
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

async function resolveRatePlanName(companyId: string): Promise<string> {
  const plans = await listActiveCompanyRatePlans(companyId, "CL");
  const code =
    (plans[0] as { rate_plan_code?: string } | undefined)?.rate_plan_code ??
    plans[0]?.rate_plan_id;
  return code ?? "TELVOICE_CL_RETAIL";
}

function stepToSendList(
  receipt: EmailStepAssessment,
  welcome: EmailStepAssessment,
  activation: EmailStepAssessment,
): {
  missingEmails: PostPurchaseEmailKind[];
  wouldSend: PostPurchaseEmailKind[];
  blocked: PostPurchaseEmailKind[];
  reasons: string[];
} {
  const steps = [
    { key: "purchase_receipt" as const, step: receipt },
    { key: "welcome_sms_credited" as const, step: welcome },
    { key: "purchase_activation_notice" as const, step: activation },
  ];

  const missingEmails: PostPurchaseEmailKind[] = [];
  const wouldSend: PostPurchaseEmailKind[] = [];
  const blocked: PostPurchaseEmailKind[] = [];
  const reasons: string[] = [];

  for (const { key, step } of steps) {
    if (step.status === "missing") missingEmails.push(key);
    if (step.status === "would_send") wouldSend.push(key);
    if (step.status === "blocked") blocked.push(key);
    if (step.status === "would_send" || step.status === "missing") {
      reasons.push(`${key}:${step.reason}`);
    }
    if (step.inconsistency) {
      reasons.push(`${key}:inconsistency:${step.inconsistency}`);
    }
  }

  return { missingEmails, wouldSend, blocked, reasons };
}

async function buildPlanForOrder(
  order: SmsOrderRow,
): Promise<PostPurchaseNotificationPlan> {
  const email = await resolvePlanEmail(order);
  const invoice = await getInvoiceByOrderId(order.id);
  const invoiceNumber = invoice ? documentNumber(invoice) : null;

  let walletBalance: number | null = null;
  let ratePlanName: string | null = null;
  if (order.company_id) {
    const balance = await getCompanyBalance(order.company_id, "CL");
    walletBalance = balance.availableSms;
    ratePlanName = await resolveRatePlanName(order.company_id);
  }

  let eligible = true;
  let blockReason: string | undefined;
  if (!email) {
    eligible = false;
    blockReason = "missing_email";
  } else if (order.payment_status !== "paid") {
    eligible = false;
    blockReason = "not_paid";
  } else if (order.credit_status !== "credited") {
    eligible = false;
    blockReason = "not_credited";
  } else if (!order.company_id) {
    eligible = false;
    blockReason = "missing_company";
  }

  const receipt = await assessPurchaseReceiptEmail(
    invoice?.id ?? null,
    email,
    eligible && Boolean(invoice),
    !invoice ? "missing_invoice" : blockReason,
  );
  const welcome = await assessWelcomeSmsCreditedEmail(
    order.id,
    email,
    eligible,
    blockReason,
  );
  const receiptReady =
    receipt.deliveryConfirmed || receipt.status === "would_send";
  const activation = await assessPurchaseActivationNoticeEmail(
    order.id,
    email,
    invoice?.id ?? null,
    eligible && receiptReady,
    !receiptReady ? "receipt_not_confirmed" : blockReason,
  );

  const lists = stepToSendList(receipt, welcome, activation);

  return {
    email,
    orderId: order.id,
    invoiceId: invoice?.id ?? null,
    invoiceNumber,
    companyId: order.company_id,
    smsQuantity: order.sms_quantity,
    walletBalance,
    ratePlanName,
    hasReceipt: receipt.deliveryConfirmed,
    hasWelcomeSmsCredited: welcome.deliveryConfirmed,
    hasActivationNotice: activation.deliveryConfirmed,
    ...lists,
    emails: {
      receipt: { ...receipt, label: "receipt" },
      welcome: { ...welcome, label: "welcome" },
      activation_notice: { ...activation, label: "activation_notice" },
    },
    providerModes: {
      billing: billingProviderMode(),
      transactional: transactionalProviderMode(),
    },
  };
}

export async function assessPostPurchaseNotifications(
  emailInput: string,
): Promise<PostPurchaseNotificationPlan[]> {
  const email = normalizeAuditEmail(emailInput);
  if (!email) return [];

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("id")
    .eq("payment_status", "paid")
    .eq("credit_status", "credited")
    .or(`checkout_email.ilike.${email},payer_email.ilike.${email}`);

  if (error) wrapSupabaseError(error, "assessPostPurchaseNotifications");

  const plans: PostPurchaseNotificationPlan[] = [];
  for (const raw of data ?? []) {
    const order = await getOrderById(String(raw.id));
    if (order) plans.push(await buildPlanForOrder(order));
  }
  return plans;
}

export async function assessAllPostPurchaseNotifications(): Promise<
  PostPurchaseNotificationPlan[]
> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("id")
    .eq("payment_status", "paid")
    .eq("credit_status", "credited")
    .order("credited_at", { ascending: false })
    .limit(200);

  if (error) wrapSupabaseError(error, "assessAllPostPurchaseNotifications");

  const plans: PostPurchaseNotificationPlan[] = [];
  for (const raw of data ?? []) {
    const order = await getOrderById(String(raw.id));
    if (order) plans.push(await buildPlanForOrder(order));
  }
  return plans;
}

function logPostPurchaseEvent(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      event: `post_purchase_notification.${event}`,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

type SendKindResult = {
  kind: PostPurchaseEmailKind;
  sent?: boolean;
  skipped?: boolean;
  error?: string;
  status?: EmailStepStatus;
};

async function sendReceiptEmail(
  plan: PostPurchaseNotificationPlan,
  options: { isResend?: boolean },
): Promise<SendKindResult> {
  if (!plan.invoiceId) {
    return { kind: "purchase_receipt", skipped: true, error: "missing_invoice" };
  }

  const needsResend =
    options.isResend === true ||
    plan.emails.receipt.logs.some(
      (l) => l.provider === "mock" || !l.provider_message_id,
    );

  const result = await sendInvoiceEmail(plan.invoiceId, {
    source: "post_purchase_notification",
    actorType: "system",
    isResend: needsResend,
  });

  if (result.skipped) {
    return { kind: "purchase_receipt", skipped: true, status: "already_sent" };
  }
  if (!result.success) {
    return {
      kind: "purchase_receipt",
      sent: false,
      error: result.message ?? "send_failed",
    };
  }
  return { kind: "purchase_receipt", sent: true };
}

async function sendWelcomeEmail(
  plan: PostPurchaseNotificationPlan,
  options: { isResend?: boolean },
): Promise<SendKindResult> {
  const result = await sendWelcomeAndSmsCreditedEmail(plan.orderId, {
    skipIdempotency: options.isResend === true,
  });
  if (result.skipped) {
    return { kind: "welcome_sms_credited", skipped: true, status: "already_sent" };
  }
  if (!result.ok) {
    return {
      kind: "welcome_sms_credited",
      sent: false,
      error: result.error ?? "send_failed",
    };
  }
  return { kind: "welcome_sms_credited", sent: true };
}

async function sendActivationNoticeEmail(
  plan: PostPurchaseNotificationPlan,
  options: {
    isResend?: boolean;
    resendReason?: string;
    requestedBy?: string | null;
  },
): Promise<SendKindResult> {
  const order = await getOrderById(plan.orderId);
  if (!order?.company_id || !plan.invoiceId) {
    return {
      kind: "purchase_activation_notice",
      skipped: true,
      error: "missing_data",
    };
  }

  const rendered = renderPurchaseActivationNotice({
    customerName: plan.email.split("@")[0] || "Cliente",
    smsQuantity: plan.smsQuantity,
    walletBalance: plan.walletBalance ?? plan.smsQuantity,
    ratePlanName: plan.ratePlanName ?? "TELVOICE_CL_RETAIL",
    orderId: plan.orderId,
    orderRef: orderRefLabel(
      plan.orderId,
      order.public_checkout_reference ?? null,
    ),
    invoiceNumber: plan.invoiceNumber ?? "—",
    appLoginUrl: `${env.publicAppUrl.replace(/\/$/, "")}/app/dashboard`,
  });

  const claim = await claimBillingEmailSend({
    invoiceId: plan.invoiceId,
    companyId: order.company_id,
    toEmail: plan.email,
    subject: rendered.subject,
    provider: env.transactionalEmail.provider || "resend",
    emailType: PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
    source: "post_purchase_notification",
    metadata: {
      order_id: plan.orderId,
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
    return {
      kind: "purchase_activation_notice",
      skipped: true,
      status: "already_sent",
      error: claim.reason,
    };
  }

  const txResult = await sendTransactionalEmail({
    templateKey: PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
    subject: rendered.subject,
    recipientEmail: plan.email,
    html: rendered.html,
    text: rendered.text,
    orderId: plan.orderId,
    invoiceId: plan.invoiceId,
    companyId: order.company_id,
    skipIdempotency: options.isResend === true,
    metadata: {
      invoice_number: plan.invoiceNumber,
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
    return {
      kind: "purchase_activation_notice",
      sent: false,
      error: txResult.error,
    };
  }

  await completeBillingEmailSend({
    logId: claim.logId,
    providerMessageId: null,
  });

  return {
    kind: "purchase_activation_notice",
    sent: true,
    skipped: txResult.skipped,
  };
}

export type PostPurchaseSendOptions = {
  dryRun?: boolean;
  sendReceipt?: boolean;
  sendWelcome?: boolean;
  sendActivationNotice?: boolean;
  sendAllMissing?: boolean;
  isResend?: boolean;
  resendReason?: string;
  requestedBy?: string | null;
};

export async function sendPostPurchaseNotifications(
  emailInput: string,
  options: PostPurchaseSendOptions = {},
): Promise<{
  plans: PostPurchaseNotificationPlan[];
  sendResults: Array<{
    orderId: string;
    email: string;
    results: SendKindResult[];
  }>;
}> {
  const plans = await assessPostPurchaseNotifications(emailInput);
  const sendResults: Array<{
    orderId: string;
    email: string;
    results: SendKindResult[];
  }> = [];

  if (options.dryRun !== false) {
    return { plans, sendResults };
  }

  for (const plan of plans) {
    const results: SendKindResult[] = [];
    const wantReceipt =
      options.sendReceipt ||
      (options.sendAllMissing &&
        plan.emails.receipt.status === "would_send");
    const wantWelcome =
      options.sendWelcome ||
      (options.sendAllMissing &&
        plan.emails.welcome.status === "would_send");
    const wantActivation =
      options.sendActivationNotice ||
      (options.sendAllMissing &&
        plan.emails.activation_notice.status === "would_send");

    if (wantReceipt) {
      const r = await sendReceiptEmail(plan, { isResend: options.isResend });
      results.push(r);
      logPostPurchaseEvent("receipt", { orderId: plan.orderId, ...r });
    }
    if (wantWelcome) {
      const r = await sendWelcomeEmail(plan, { isResend: options.isResend });
      results.push(r);
      logPostPurchaseEvent("welcome", { orderId: plan.orderId, ...r });
    }
    if (wantActivation) {
      const r = await sendActivationNoticeEmail(plan, options);
      results.push(r);
      logPostPurchaseEvent("activation_notice", { orderId: plan.orderId, ...r });
    }

    if (results.length > 0) {
      sendResults.push({
        orderId: plan.orderId,
        email: plan.email,
        results,
      });
    }
  }

  return { plans, sendResults };
}

export async function sendAllPostPurchaseNotifications(options: {
  dryRun?: boolean;
  confirm?: string;
  sendAllMissing?: boolean;
}): Promise<{ plans: PostPurchaseNotificationPlan[] }> {
  if (
    options.dryRun === false &&
    options.confirm !== POST_PURCHASE_SEND_CONFIRM
  ) {
    throw new Error(
      `Apply masivo requiere --confirm="${POST_PURCHASE_SEND_CONFIRM}".`,
    );
  }

  const plans = await assessAllPostPurchaseNotifications();
  if (options.dryRun !== false) {
    return { plans };
  }

  for (const plan of plans) {
    if (plan.wouldSend.length === 0) continue;
    await sendPostPurchaseNotifications(plan.email, {
      dryRun: false,
      sendAllMissing: true,
    });
  }

  return { plans };
}

// Backwards-compatible aliases
export type PurchaseActivationNoticeRow = PostPurchaseNotificationPlan;
export const assessPurchaseActivationNotice = assessPostPurchaseNotifications;
export const assessAllPurchaseActivationNotices = assessAllPostPurchaseNotifications;
export async function sendPurchaseActivationNotice(
  emailInput: string,
  options: { dryRun?: boolean; isResend?: boolean } = {},
) {
  const out = await sendPostPurchaseNotifications(emailInput, {
    ...options,
    sendActivationNotice: options.dryRun === false,
  });
  return {
    results: out.plans.map((p) => ({
      ...p,
      wouldSend: p.wouldSend.includes("purchase_activation_notice"),
      hasReceiptSent: p.hasReceipt,
      hasActivationNoticeSent: p.hasActivationNotice,
      reason: p.reasons[0] ?? "ok",
    })),
  };
}
export const sendAllPurchaseActivationNotices = sendAllPostPurchaseNotifications;
