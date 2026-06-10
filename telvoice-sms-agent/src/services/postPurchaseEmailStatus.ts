import { env, isBillingEmailMock, isTransactionalEmailMock } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import {
  hasActiveOrSentBillingEmail,
  INVOICE_RECEIPT_EMAIL_TYPE,
  normalizeBillingRecipientEmail,
  PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
} from "./billingEmailClaimService.js";

export type PostPurchaseEmailKind =
  | "purchase_receipt"
  | "welcome_sms_credited"
  | "purchase_activation_notice";

export type EmailStepStatus =
  | "already_sent"
  | "missing"
  | "would_send"
  | "blocked";

const ACTIVE_EMAIL_LOG_STATUSES = ["pending", "sent"] as const;
const ACTIVE_BILLING_STATUSES = ["sending", "sent"] as const;

export type EmailLogSnapshot = {
  id: string;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  created_at?: string;
  sent_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type EmailStepAssessment = {
  kind: PostPurchaseEmailKind;
  status: EmailStepStatus;
  reason: string;
  deliveryConfirmed: boolean;
  inconsistency: string | null;
  providerMessageId: string | null;
  logs: EmailLogSnapshot[];
};

function requiresBillingProviderConfirmation(): boolean {
  return !isBillingEmailMock();
}

function requiresTransactionalProviderConfirmation(): boolean {
  return !isTransactionalEmailMock();
}

export function isDeliveryConfirmed(
  log: EmailLogSnapshot,
  requiresRealProvider: boolean,
): boolean {
  if (!ACTIVE_EMAIL_LOG_STATUSES.includes(log.status as (typeof ACTIVE_EMAIL_LOG_STATUSES)[number])) {
    if (log.status === "skipped") return true;
    return false;
  }

  if (!requiresRealProvider) {
    return log.status === "sent" || log.status === "pending";
  }

  if (log.provider === "mock" || log.metadata?.mode === "mock") {
    return false;
  }

  return Boolean(log.provider_message_id?.trim());
}

/** Comprobante billing: mock nunca cuenta como entrega real (reconciliación). */
export function isBillingReceiptDeliveryConfirmed(log: EmailLogSnapshot): boolean {
  if (
    !ACTIVE_BILLING_STATUSES.includes(log.status as (typeof ACTIVE_BILLING_STATUSES)[number])
  ) {
    return false;
  }
  if (log.provider === "mock" || log.metadata?.mode === "mock") {
    return false;
  }
  if (requiresBillingProviderConfirmation()) {
    return Boolean(log.provider_message_id?.trim());
  }
  return log.status === "sent";
}

type BillingLogRow = EmailLogSnapshot & {
  email_type?: string;
  metadata?: Record<string, unknown>;
};

export function describeDeliveryInconsistency(
  log: EmailLogSnapshot,
  requiresRealProvider: boolean,
  kind?: PostPurchaseEmailKind,
): string | null {
  const active =
    kind === "purchase_receipt"
      ? ACTIVE_BILLING_STATUSES.includes(log.status as (typeof ACTIVE_BILLING_STATUSES)[number])
      : ACTIVE_EMAIL_LOG_STATUSES.includes(log.status as (typeof ACTIVE_EMAIL_LOG_STATUSES)[number]);
  if (!active) return null;
  if (log.provider_message_id?.trim()) return null;
  if (log.provider === "mock" || log.metadata?.mode === "mock") {
    return "Marcado sent en DB con provider mock; no aparece en Resend.";
  }
  if (!requiresRealProvider) return null;
  return "Marcado sent en DB sin provider_message_id; entrega real no confirmada.";
}

async function fetchBillingLogsForInvoice(
  invoiceId: string,
  emailType: string,
  toEmail: string,
): Promise<BillingLogRow[]> {
  const normalized = normalizeBillingRecipientEmail(toEmail);
  const { data, error } = await getSupabase()
    .from("billing_email_logs")
    .select(
      "id,status,provider,provider_message_id,sent_at,created_at,email_type,metadata",
    )
    .eq("invoice_id", invoiceId)
    .eq("email_type", emailType)
    .eq("to_email_normalized", normalized)
    .in("status", [...ACTIVE_BILLING_STATUSES])
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[post-purchase-email] billing logs query failed", error);
    return [];
  }

  return (data ?? []) as BillingLogRow[];
}

async function fetchEmailLogsForOrder(
  orderId: string,
  templateKey: string,
  toEmail: string,
): Promise<EmailLogSnapshot[]> {
  const normalized = normalizeBillingRecipientEmail(toEmail);
  const { data, error } = await getSupabase()
    .from("email_logs")
    .select("id,status,provider,provider_message_id,sent_at,created_at,metadata")
    .eq("order_id", orderId)
    .eq("template_key", templateKey)
    .eq("recipient_email", normalized)
    .in("status", [...ACTIVE_EMAIL_LOG_STATUSES])
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[post-purchase-email] email_logs query failed", error);
    return [];
  }

  return (data ?? []) as EmailLogSnapshot[];
}

function assessBillingStep(
  kind: PostPurchaseEmailKind,
  logs: BillingLogRow[],
  requiresReal: boolean,
  eligible: boolean,
  blockReason?: string,
): EmailStepAssessment {
  const nonResend = logs.filter(
    (l) => (l.metadata as Record<string, unknown> | null)?.is_resend !== true,
  );
  const confirmFn =
    kind === "purchase_receipt"
      ? isBillingReceiptDeliveryConfirmed
      : (l: EmailLogSnapshot) => isDeliveryConfirmed(l, requiresReal);
  const confirmed = nonResend.find((l) => confirmFn(l));
  const inconsistencyLog = nonResend.find(
    (l) => describeDeliveryInconsistency(l, requiresReal, kind) !== null,
  );
  const inconsistency = inconsistencyLog
    ? describeDeliveryInconsistency(inconsistencyLog, requiresReal, kind)
    : null;

  if (!eligible && blockReason) {
    return {
      kind,
      status: "blocked",
      reason: blockReason,
      deliveryConfirmed: Boolean(confirmed),
      inconsistency,
      providerMessageId: confirmed?.provider_message_id ?? null,
      logs: nonResend,
    };
  }

  if (confirmed) {
    return {
      kind,
      status: "already_sent",
      reason: "delivery_confirmed",
      deliveryConfirmed: true,
      inconsistency,
      providerMessageId: confirmed.provider_message_id,
      logs: nonResend,
    };
  }

  if (nonResend.length > 0 && inconsistency) {
    return {
      kind,
      status: "would_send",
      reason: "mock_or_unconfirmed_delivery",
      deliveryConfirmed: false,
      inconsistency,
      providerMessageId: null,
      logs: nonResend,
    };
  }

  return {
    kind,
    status: "missing",
    reason: "no_log",
    deliveryConfirmed: false,
    inconsistency: null,
    providerMessageId: null,
    logs: [],
  };
}

function assessTransactionalStep(
  kind: PostPurchaseEmailKind,
  logs: EmailLogSnapshot[],
  requiresReal: boolean,
  eligible: boolean,
  blockReason?: string,
): EmailStepAssessment {
  const confirmed = logs.find((l) => isDeliveryConfirmed(l, requiresReal));
  const inconsistencyLog = logs.find(
    (l) => describeDeliveryInconsistency(l, requiresReal) !== null,
  );
  const inconsistency = inconsistencyLog
    ? describeDeliveryInconsistency(inconsistencyLog, requiresReal)
    : null;

  if (!eligible && blockReason) {
    return {
      kind,
      status: "blocked",
      reason: blockReason,
      deliveryConfirmed: Boolean(confirmed),
      inconsistency,
      providerMessageId: confirmed?.provider_message_id ?? null,
      logs,
    };
  }

  if (confirmed) {
    return {
      kind,
      status: "already_sent",
      reason: "delivery_confirmed",
      deliveryConfirmed: true,
      inconsistency,
      providerMessageId: confirmed.provider_message_id,
      logs,
    };
  }

  if (logs.length > 0 && inconsistency) {
    return {
      kind,
      status: "would_send",
      reason: "unconfirmed_delivery",
      deliveryConfirmed: false,
      inconsistency,
      providerMessageId: null,
      logs,
    };
  }

  return {
    kind,
    status: "missing",
    reason: "no_log",
    deliveryConfirmed: false,
    inconsistency: null,
    providerMessageId: null,
    logs: [],
  };
}

export async function assessPurchaseReceiptEmail(
  invoiceId: string | null,
  toEmail: string,
  eligible: boolean,
  blockReason?: string,
): Promise<EmailStepAssessment> {
  if (!invoiceId) {
    return {
      kind: "purchase_receipt",
      status: "blocked",
      reason: "missing_invoice",
      deliveryConfirmed: false,
      inconsistency: null,
      providerMessageId: null,
      logs: [],
    };
  }

  const requiresReal = requiresBillingProviderConfirmation();
  const billingLogs = await fetchBillingLogsForInvoice(
    invoiceId,
    INVOICE_RECEIPT_EMAIL_TYPE,
    toEmail,
  );

  const step = assessBillingStep(
    "purchase_receipt",
    billingLogs,
    requiresReal,
    eligible,
    blockReason,
  );

  if (
    step.status === "missing" &&
    eligible &&
    (await hasActiveOrSentBillingEmail(invoiceId, toEmail, INVOICE_RECEIPT_EMAIL_TYPE))
  ) {
    return {
      ...step,
      status: "would_send",
      reason: "billing_claim_without_confirmed_delivery",
    };
  }

  if (step.status === "missing" && eligible) {
    return { ...step, status: "would_send", reason: "receipt_missing" };
  }

  return step;
}

export async function assessWelcomeSmsCreditedEmail(
  orderId: string,
  toEmail: string,
  eligible: boolean,
  blockReason?: string,
): Promise<EmailStepAssessment> {
  const requiresReal = requiresTransactionalProviderConfirmation();
  const logs = await fetchEmailLogsForOrder(
    orderId,
    "welcome_sms_credited",
    toEmail,
  );
  const step = assessTransactionalStep(
    "welcome_sms_credited",
    logs,
    requiresReal,
    eligible,
    blockReason,
  );
  if (step.status === "missing" && eligible) {
    return { ...step, status: "would_send", reason: "welcome_missing" };
  }
  return step;
}

export async function assessPurchaseActivationNoticeEmail(
  orderId: string,
  toEmail: string,
  invoiceId: string | null,
  eligible: boolean,
  blockReason?: string,
): Promise<EmailStepAssessment> {
  const requiresRealTx = requiresTransactionalProviderConfirmation();
  const requiresRealBilling = requiresBillingProviderConfirmation();

  const txLogs = await fetchEmailLogsForOrder(
    orderId,
    PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
    toEmail,
  );
  const billingLogs = invoiceId
    ? await fetchBillingLogsForInvoice(
        invoiceId,
        PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE,
        toEmail,
      )
    : [];

  const txStep = assessTransactionalStep(
    "purchase_activation_notice",
    txLogs,
    requiresRealTx,
    eligible,
    blockReason,
  );
  const billingStep = assessBillingStep(
    "purchase_activation_notice",
    billingLogs,
    requiresRealBilling,
    eligible,
    blockReason,
  );

  if (
    txStep.deliveryConfirmed ||
    billingStep.deliveryConfirmed ||
    txStep.status === "already_sent" ||
    billingStep.status === "already_sent"
  ) {
    const confirmed =
      txStep.deliveryConfirmed ? txStep : billingStep;
    return {
      kind: "purchase_activation_notice",
      status: "already_sent",
      reason: "delivery_confirmed",
      deliveryConfirmed: true,
      inconsistency: confirmed.inconsistency ?? txStep.inconsistency ?? billingStep.inconsistency,
      providerMessageId: confirmed.providerMessageId,
      logs: [...txStep.logs, ...billingStep.logs],
    };
  }

  if (txStep.status === "blocked" || billingStep.status === "blocked") {
    return txStep.status === "blocked" ? txStep : billingStep;
  }

  if (
    txStep.status === "would_send" ||
    billingStep.status === "would_send" ||
    txStep.status === "missing" ||
    billingStep.status === "missing"
  ) {
    return {
      kind: "purchase_activation_notice",
      status: eligible ? "would_send" : "missing",
      reason:
        txStep.inconsistency || billingStep.inconsistency
          ? "mock_or_unconfirmed_delivery"
          : "activation_notice_missing",
      deliveryConfirmed: false,
      inconsistency: txStep.inconsistency ?? billingStep.inconsistency,
      providerMessageId: null,
      logs: [...txStep.logs, ...billingStep.logs],
    };
  }

  return txStep;
}

export function billingProviderMode(): string {
  return env.billingEmail.mode;
}

export function transactionalProviderMode(): string {
  return env.transactionalEmail.mode;
}
