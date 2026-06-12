import type { BillingEmailLog, BillingEmailStatus } from "../types/billing.js";
import { getSupabase } from "../database/supabaseClient.js";
import { recordBillingEvent } from "./billingEventService.js";
import { isDuplicateKeyError } from "../utils/supabase-errors.js";

export const INVOICE_RECEIPT_EMAIL_TYPE = "purchase_receipt";
export const PURCHASE_ACTIVATION_NOTICE_EMAIL_TYPE = "purchase_activation_notice";

export function normalizeBillingRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isResendMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.is_resend === true;
}

/** Envío automático en curso o ya entregado (excluye reenvíos manuales). */
export async function hasActiveOrSentBillingEmail(
  invoiceId: string,
  toEmail?: string,
  emailType: string = INVOICE_RECEIPT_EMAIL_TYPE,
): Promise<boolean> {
  let query = getSupabase()
    .from("billing_email_logs")
    .select("id, metadata")
    .eq("invoice_id", invoiceId)
    .eq("email_type", emailType)
    .in("status", ["sending", "sent"]);

  if (toEmail) {
    query = query.eq("to_email_normalized", normalizeBillingRecipientEmail(toEmail));
  }

  const { data, error } = await query.limit(5);

  if (error) {
    console.warn("[billing-email-claim] hasActiveOrSentBillingEmail failed", error);
    return false;
  }

  return (data ?? []).some((row) => !isResendMetadata(row.metadata as Record<string, unknown>));
}

export type ClaimBillingEmailResult =
  | { claimed: true; logId: string; log: BillingEmailLog }
  | { claimed: false; reason: "duplicate" | "already_active" };

export async function claimBillingEmailSend(input: {
  invoiceId: string;
  companyId: string;
  toEmail: string;
  subject: string;
  provider: string;
  emailType?: string;
  source: string;
  metadata?: Record<string, unknown>;
}): Promise<ClaimBillingEmailResult> {
  const emailType = input.emailType ?? INVOICE_RECEIPT_EMAIL_TYPE;
  const normalized = normalizeBillingRecipientEmail(input.toEmail);

  const isResend = input.metadata?.is_resend === true;
  if (
    !isResend &&
    (await hasActiveOrSentBillingEmail(input.invoiceId, input.toEmail, emailType))
  ) {
    return { claimed: false, reason: "already_active" };
  }

  const { data, error } = await getSupabase()
    .from("billing_email_logs")
    .insert({
      invoice_id: input.invoiceId,
      company_id: input.companyId,
      to_email: input.toEmail,
      to_email_normalized: normalized,
      email_type: emailType,
      subject: input.subject,
      status: "sending" satisfies BillingEmailStatus,
      provider: input.provider,
      metadata: {
        source: input.source,
        is_resend: isResend,
        email_type: emailType,
        ...input.metadata,
      },
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" || isDuplicateKeyError(error)) {
      return { claimed: false, reason: "duplicate" };
    }
    console.warn("[billing-email-claim] claim insert failed", error);
    return { claimed: false, reason: "duplicate" };
  }

  return {
    claimed: true,
    logId: String(data.id),
    log: data as BillingEmailLog,
  };
}

export async function completeBillingEmailSend(input: {
  logId: string;
  providerMessageId?: string | null;
  sentAt?: string;
}): Promise<void> {
  const sentAt = input.sentAt ?? new Date().toISOString();
  const { error } = await getSupabase()
    .from("billing_email_logs")
    .update({
      status: "sent",
      provider_message_id: input.providerMessageId ?? null,
      sent_at: sentAt,
      error_message: null,
    })
    .eq("id", input.logId)
    .eq("status", "sending");

  if (error) {
    console.warn("[billing-email-claim] completeBillingEmailSend failed", error);
  }
}

export async function failBillingEmailSend(input: {
  logId: string;
  errorMessage: string;
}): Promise<void> {
  const { error } = await getSupabase()
    .from("billing_email_logs")
    .update({
      status: "failed",
      error_message: input.errorMessage,
    })
    .eq("id", input.logId)
    .in("status", ["sending", "pending"]);

  if (error) {
    console.warn("[billing-email-claim] failBillingEmailSend failed", error);
  }
}

export async function recordBillingEmailSkippedDuplicate(input: {
  invoiceId: string;
  companyId: string;
  toEmail: string | null;
  emailType?: string;
  source: string;
  reason: "duplicate" | "already_active";
  actorType?: string;
  actorId?: string | null;
}): Promise<void> {
  await recordBillingEvent({
    invoiceId: input.invoiceId,
    companyId: input.companyId,
    eventType: "invoice.email_skipped_duplicate",
    description:
      input.reason === "already_active"
        ? "Comprobante ya enviado o en envío; omitido por idempotencia."
        : "Envío de comprobante omitido: reserva duplicada (race condition).",
    actorType: input.actorType ?? "system",
    actorId: input.actorId ?? null,
    metadata: {
      source: input.source,
      to_email: input.toEmail,
      email_type: input.emailType ?? INVOICE_RECEIPT_EMAIL_TYPE,
      reason: input.reason,
    },
  });
}
