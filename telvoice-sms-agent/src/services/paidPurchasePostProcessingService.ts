import type { SmsOrderRow } from "../types/wallet.js";
import {
  emailLooksQa,
  normalizeAuditEmail,
  orderLooksQa,
} from "./adminDataAuditClassifier.js";
import { markEntityAsProdReal } from "./adminDataAuditService.js";
import { isExplicitTestPurchaseEmail } from "./adminProductionScopeService.js";
import {
  reconcilePaidPurchase,
  type ReconcilePaidPurchaseResult,
} from "./billingPurchaseReconciliationService.js";
import { ensureInvoiceForOrder, getInvoiceByOrderId } from "./billingInvoiceService.js";
import {
  assessPurchaseActivationNoticeEmail,
  assessPurchaseReceiptEmail,
  assessWelcomeSmsCreditedEmail,
  type EmailStepAssessment,
} from "./postPurchaseEmailStatus.js";
import {
  assessPostPurchaseNotifications,
  sendPostPurchaseNotifications,
  type PostPurchaseNotificationPlan,
} from "./postPurchaseNotificationService.js";
import { getOrderById } from "./smsOrderService.js";
import { hasPurchaseCreditForOrder } from "./walletTransactionService.js";
import { resolveTransactionalRecipient } from "./transactionalEmailService.js";
import { getSupabase } from "../database/supabaseClient.js";

export type PaidPurchasePostProcessingAction =
  | "skipped"
  | "qa_blocked"
  | "not_paid"
  | "not_credited"
  | "would_process"
  | "processed"
  | "already_processed"
  | "reconcile_failed";

export type PaidPurchaseEmailSnapshot = {
  receipt: EmailStepAssessment;
  welcome: EmailStepAssessment;
  activation_notice: EmailStepAssessment;
  payment_received_pending_claim_sent: boolean;
};

export type PaidPurchasePostProcessingResult = {
  orderId: string;
  dryRun: boolean;
  action: PaidPurchasePostProcessingAction;
  buyerEmail: string | null;
  companyId: string | null;
  walletCreditExists: boolean;
  invoiceExists: boolean;
  credited: boolean;
  reconcile?: ReconcilePaidPurchaseResult;
  emails: PaidPurchaseEmailSnapshot;
  missingSteps: string[];
  wouldSendEmails: string[];
  risk: string[];
  prodRealMarked: boolean;
  notifications?: PostPurchaseNotificationPlan;
  reason?: string;
};

export type PaidPurchasePostProcessingOptions = {
  dryRun?: boolean;
  source?: string;
  actorUserId?: string | null;
  /** Si la orden ya fue acreditada (p. ej. panel cliente), omitir reconcile. */
  skipReconcile?: boolean;
  /** No enviar correos (auditoría / simulación). */
  skipEmails?: boolean;
  /** No marcar PROD_REAL (auditoría). */
  skipProdRealMark?: boolean;
};

async function orderBuyerEmail(order: SmsOrderRow): Promise<string> {
  const resolved = await resolveTransactionalRecipient(order);
  return normalizeAuditEmail(resolved.email ?? "");
}

function isQaPurchaseBlocked(order: SmsOrderRow, email: string): boolean {
  if (isExplicitTestPurchaseEmail(email)) return true;
  if (emailLooksQa(email)) return true;
  if (orderLooksQa(order as unknown as Record<string, unknown>)) return true;
  return false;
}

async function hasPaymentClaimEmailSent(orderId: string, email: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from("email_logs")
    .select("id, status, provider_message_id")
    .eq("order_id", orderId)
    .eq("template_key", "payment_received_pending_claim")
    .eq("recipient_email", email)
    .eq("status", "sent")
    .limit(1);
  return (data ?? []).some((r) => Boolean(r.provider_message_id?.trim()));
}

async function buildEmailSnapshot(
  order: SmsOrderRow,
  email: string,
  eligible: boolean,
): Promise<PaidPurchaseEmailSnapshot> {
  const invoice = await getInvoiceByOrderId(order.id);
  const receipt = await assessPurchaseReceiptEmail(
    invoice?.id ?? null,
    email,
    eligible,
    !invoice ? "missing_invoice" : undefined,
  );
  const welcome = await assessWelcomeSmsCreditedEmail(
    order.id,
    email,
    eligible,
  );
  const activation = await assessPurchaseActivationNoticeEmail(
    order.id,
    email,
    invoice?.id ?? null,
    eligible && (receipt.deliveryConfirmed || receipt.status === "would_send"),
    !receipt.deliveryConfirmed && receipt.status !== "would_send"
      ? "receipt_not_confirmed"
      : undefined,
  );
  const payment_received_pending_claim_sent = await hasPaymentClaimEmailSent(
    order.id,
    email,
  );
  return {
    receipt,
    welcome,
    activation_notice: activation,
    payment_received_pending_claim_sent,
  };
}

function collectMissingAndRisk(
  order: SmsOrderRow,
  emails: PaidPurchaseEmailSnapshot,
): { missingSteps: string[]; wouldSendEmails: string[]; risk: string[] } {
  const missingSteps: string[] = [];
  const wouldSendEmails: string[] = [];
  const risk: string[] = [];

  if (order.payment_status !== "paid") missingSteps.push("not_paid");
  if (order.credit_status !== "credited") missingSteps.push("not_credited");
  if (!order.company_id) missingSteps.push("missing_company");

  for (const [key, step] of [
    ["purchase_receipt", emails.receipt],
    ["welcome_sms_credited", emails.welcome],
    ["purchase_activation_notice", emails.activation_notice],
  ] as const) {
    if (step.status === "missing" || step.status === "would_send") {
      missingSteps.push(`email:${key}`);
      if (step.status === "would_send") wouldSendEmails.push(key);
    }
    if (step.inconsistency) {
      risk.push(`${key}:inconsistency:${step.inconsistency}`);
    }
    if (step.logs.some((l) => l.status === "pending")) {
      risk.push(`${key}:pending_in_logs`);
    }
  }

  if (
    emails.payment_received_pending_claim_sent &&
    missingSteps.some((s) => s.startsWith("email:"))
  ) {
    risk.push("claim_sent_but_post_purchase_emails_incomplete");
  }

  return { missingSteps, wouldSendEmails, risk };
}

function logPostProcessing(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      event: `paid_purchase_post_processing.${event}`,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

/**
 * Post-crédito: invoice + 3 correos transaccionales + PROD_REAL.
 * Idempotente: no duplica créditos ni correos con entrega real confirmada.
 */
export async function runPostCreditPurchaseFlow(
  orderId: string,
  options: PaidPurchasePostProcessingOptions = {},
): Promise<PaidPurchasePostProcessingResult> {
  const dryRun = options.dryRun === true;
  const order = await getOrderById(orderId);
  if (!order) {
    return {
      orderId,
      dryRun,
      action: "skipped",
      buyerEmail: null,
      companyId: null,
      walletCreditExists: false,
      invoiceExists: false,
      credited: false,
      emails: {
        receipt: {
          kind: "purchase_receipt",
          status: "blocked",
          reason: "order_not_found",
          deliveryConfirmed: false,
          inconsistency: null,
          providerMessageId: null,
          logs: [],
        },
        welcome: {
          kind: "welcome_sms_credited",
          status: "blocked",
          reason: "order_not_found",
          deliveryConfirmed: false,
          inconsistency: null,
          providerMessageId: null,
          logs: [],
        },
        activation_notice: {
          kind: "purchase_activation_notice",
          status: "blocked",
          reason: "order_not_found",
          deliveryConfirmed: false,
          inconsistency: null,
          providerMessageId: null,
          logs: [],
        },
        payment_received_pending_claim_sent: false,
      },
      missingSteps: ["order_not_found"],
      wouldSendEmails: [],
      risk: [],
      prodRealMarked: false,
      reason: "order_not_found",
    };
  }

  const email = await orderBuyerEmail(order);
  const walletCreditExists = await hasPurchaseCreditForOrder(orderId);
  const invoiceBefore = await getInvoiceByOrderId(orderId);

  if (order.payment_status !== "paid") {
    return {
      orderId,
      dryRun,
      action: "skipped",
      buyerEmail: email || null,
      companyId: order.company_id,
      walletCreditExists,
      invoiceExists: Boolean(invoiceBefore),
      credited: order.credit_status === "credited",
      emails: await buildEmailSnapshot(order, email, false),
      missingSteps: ["not_paid"],
      wouldSendEmails: [],
      risk: [],
      prodRealMarked: false,
      reason: "not_paid",
    };
  }

  if (isQaPurchaseBlocked(order, email)) {
    return {
      orderId,
      dryRun,
      action: "qa_blocked",
      buyerEmail: email || null,
      companyId: order.company_id,
      walletCreditExists,
      invoiceExists: Boolean(invoiceBefore),
      credited: order.credit_status === "credited",
      emails: await buildEmailSnapshot(order, email, false),
      missingSteps: ["qa_blocked"],
      wouldSendEmails: [],
      risk: ["qa_or_test_purchase"],
      prodRealMarked: false,
      reason: "qa_blocked",
    };
  }

  if (order.credit_status !== "credited") {
    const emails = await buildEmailSnapshot(order, email, false);
    const { missingSteps, wouldSendEmails, risk } = collectMissingAndRisk(
      order,
      emails,
    );
    return {
      orderId,
      dryRun,
      action: "not_credited",
      buyerEmail: email || null,
      companyId: order.company_id,
      walletCreditExists,
      invoiceExists: Boolean(invoiceBefore),
      credited: false,
      emails,
      missingSteps,
      wouldSendEmails,
      risk,
      prodRealMarked: false,
      reason: "awaiting_credit",
    };
  }

  const emails = await buildEmailSnapshot(order, email, true);
  const { missingSteps, wouldSendEmails, risk } = collectMissingAndRisk(
    order,
    emails,
  );
  const notifications = (await assessPostPurchaseNotifications(email)).find(
    (p) => p.orderId === orderId,
  );

  if (dryRun || options.skipEmails) {
    const action =
      wouldSendEmails.length > 0 ? "would_process" : "already_processed";
    return {
      orderId,
      dryRun,
      action,
      buyerEmail: email || null,
      companyId: order.company_id,
      walletCreditExists,
      invoiceExists: Boolean(invoiceBefore),
      credited: true,
      emails,
      missingSteps,
      wouldSendEmails,
      risk,
      prodRealMarked: false,
      notifications,
    };
  }

  await ensureInvoiceForOrder(orderId);

  if (wouldSendEmails.length > 0 && email) {
    await sendPostPurchaseNotifications(email, {
      dryRun: false,
      sendAllMissing: true,
    });
    logPostProcessing("emails_sent", {
      orderId,
      wouldSendEmails,
      source: options.source,
    });
  }

  let prodRealMarked = false;
  if (!options.skipProdRealMark) {
    if (order.company_id) {
      await markEntityAsProdReal({
        entityType: "company",
        entityId: order.company_id,
        actorEmail: null,
      });
    }
    await markEntityAsProdReal({
      entityType: "sms_order",
      entityId: orderId,
      actorEmail: null,
    });
    prodRealMarked = true;
    logPostProcessing("prod_real_marked", { orderId, companyId: order.company_id });
  }

  const refreshedEmails = await buildEmailSnapshot(
    (await getOrderById(orderId)) ?? order,
    email,
    true,
  );
  const after = collectMissingAndRisk(order, refreshedEmails);

  return {
    orderId,
    dryRun: false,
    action: after.wouldSendEmails.length > 0 ? "processed" : "already_processed",
    buyerEmail: email || null,
    companyId: order.company_id,
    walletCreditExists: true,
    invoiceExists: true,
    credited: true,
    emails: refreshedEmails,
    missingSteps: after.missingSteps,
    wouldSendEmails: after.wouldSendEmails,
    risk: after.risk,
    prodRealMarked,
    notifications,
  };
}

/**
 * Orquestador completo post-compra MercadoPago: reconcile + post-crédito.
 */
function reconcileAllowsPostCredit(reconcile: ReconcilePaidPurchaseResult): boolean {
  if (reconcile.action === "reconciled" || reconcile.action === "already_credited") {
    return true;
  }
  if (reconcile.action === "skipped" && reconcile.status === "already_credited") {
    return true;
  }
  if (reconcile.action === "would_reconcile" && reconcile.wouldReconcile) {
    return true;
  }
  return false;
}

export async function handlePaidPurchasePostProcessing(
  orderId: string,
  options: PaidPurchasePostProcessingOptions = {},
): Promise<PaidPurchasePostProcessingResult> {
  const dryRun = options.dryRun === true;
  const source = options.source ?? "paid_purchase_post_processing";
  let reconcile: ReconcilePaidPurchaseResult | undefined;

  if (!options.skipReconcile) {
    reconcile = await reconcilePaidPurchase(orderId, {
      dryRun,
      actorUserId: options.actorUserId ?? null,
      source,
    });

    if (!reconcileAllowsPostCredit(reconcile)) {
      const order = await getOrderById(orderId);
      const email = order ? await orderBuyerEmail(order) : "";
      const isQa =
        reconcile.status === "test_email" || reconcile.status === "qa_blocked";
      return {
        orderId,
        dryRun,
        action: isQa ? "qa_blocked" : "reconcile_failed",
        buyerEmail: email || null,
        companyId: order?.company_id ?? null,
        walletCreditExists: await hasPurchaseCreditForOrder(orderId),
        invoiceExists: Boolean(await getInvoiceByOrderId(orderId)),
        credited: order?.credit_status === "credited",
        reconcile,
        emails: order
          ? await buildEmailSnapshot(order, email, order.credit_status === "credited")
          : {
              receipt: {
                kind: "purchase_receipt",
                status: "blocked",
                reason: "reconcile_failed",
                deliveryConfirmed: false,
                inconsistency: null,
                providerMessageId: null,
                logs: [],
              },
              welcome: {
                kind: "welcome_sms_credited",
                status: "blocked",
                reason: "reconcile_failed",
                deliveryConfirmed: false,
                inconsistency: null,
                providerMessageId: null,
                logs: [],
              },
              activation_notice: {
                kind: "purchase_activation_notice",
                status: "blocked",
                reason: "reconcile_failed",
                deliveryConfirmed: false,
                inconsistency: null,
                providerMessageId: null,
                logs: [],
              },
              payment_received_pending_claim_sent: false,
            },
        missingSteps: [reconcile.reason ?? reconcile.status],
        wouldSendEmails: [],
        risk: isQa ? ["qa_or_test_purchase"] : [],
        prodRealMarked: false,
        reason: reconcile.reason ?? reconcile.status,
      };
    }
  }

  const postCredit = await runPostCreditPurchaseFlow(orderId, {
    ...options,
    dryRun,
    source,
  });
  return { ...postCredit, reconcile };
}

/** Indica si conviene enviar el correo de claim (solo si sigue pending_claim sin crédito). */
export async function shouldSendPaymentClaimEmail(
  orderId: string,
): Promise<boolean> {
  const order = await getOrderById(orderId);
  if (!order) return false;
  if (order.credit_status === "credited") return false;
  if (order.credit_status !== "pending_claim") return false;
  const email = await orderBuyerEmail(order);
  if (!email) return false;
  if (await hasPaymentClaimEmailSent(orderId, email)) return false;
  return true;
}
