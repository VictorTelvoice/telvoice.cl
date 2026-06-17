import { env } from "../config/env.js";
import type { ClientSupportTicketRow } from "../types/support-tickets.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import { findCompanyById } from "./companyService.js";
import { sendTransactionalEmail } from "./transactionalEmailService.js";
import { renderSupportTicketReplyToClient } from "./transactionalEmailTemplates.js";

export const SUPPORT_TICKET_REPLY_TEMPLATE_KEY = "support_ticket_reply_to_client";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function supportTicketPanelUrl(ticketCode: string): string {
  const base = env.publicAppUrl.replace(/\/$/, "");
  return `${base}/app/support?ticket=${encodeURIComponent(ticketCode)}`;
}

function idempotencyKey(ticketId: string, replyId: string): string {
  return `support-ticket-reply:${ticketId}:${replyId}`;
}

async function hasSentSupportTicketReplyEmail(
  ticketId: string,
  replyId: string,
  recipientEmail: string,
): Promise<boolean> {
  const key = idempotencyKey(ticketId, replyId);
  const { data, error } = await getSupabase()
    .from("email_logs")
    .select("id")
    .eq("template_key", SUPPORT_TICKET_REPLY_TEMPLATE_KEY)
    .eq("recipient_email", normalizeEmail(recipientEmail))
    .filter("metadata->>idempotency_key", "eq", key)
    .in("status", ["sent", "pending"])
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return false;
    console.warn("[support-reply-email] hasSentSupportTicketReplyEmail", error.message);
    return false;
  }
  return Boolean(data);
}

async function isTicketReplyEmailEnabled(companyId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("client_company_settings")
    .select("notification_settings")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return true;
  const nt = data.notification_settings as Record<string, unknown> | null;
  if (nt && typeof nt.newTicketMessage === "boolean") {
    return nt.newTicketMessage;
  }
  return true;
}

async function resolveTicketRecipientEmail(
  row: ClientSupportTicketRow,
): Promise<{ email: string | null; source: string | null }> {
  if (row.user_id) {
    const { data } = await getSupabase()
      .from("user_profiles")
      .select("email")
      .eq("id", row.user_id)
      .maybeSingle();
    const email = data?.email?.trim();
    if (email?.includes("@")) {
      return { email: normalizeEmail(email), source: "ticket_creator" };
    }
  }

  const company = await findCompanyById(row.company_id);
  const billing = company?.billing_email?.trim();
  if (billing?.includes("@")) {
    return { email: normalizeEmail(billing), source: "company.billing_email" };
  }

  const { data: settingsRow } = await getSupabase()
    .from("client_company_settings")
    .select("company_data, billing_data")
    .eq("company_id", row.company_id)
    .maybeSingle();

  if (settingsRow) {
    const companyData = settingsRow.company_data as Record<string, unknown> | null;
    const contact = typeof companyData?.contactEmail === "string" ? companyData.contactEmail.trim() : "";
    if (contact.includes("@")) {
      return { email: normalizeEmail(contact), source: "company.contact_email" };
    }
    const billingData = settingsRow.billing_data as Record<string, unknown> | null;
    const bill = typeof billingData?.billingEmail === "string" ? billingData.billingEmail.trim() : "";
    if (bill.includes("@")) {
      return { email: normalizeEmail(bill), source: "billing.email" };
    }
  }

  return { email: null, source: null };
}

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  in_review: "En revisión",
  waiting: "Esperando respuesta",
  resolved: "Resuelto",
  Abierto: "Abierto",
  "En revisión": "En revisión",
  "Esperando respuesta": "Esperando respuesta",
  Resuelto: "Resuelto",
};

export async function sendSupportTicketReplyEmail(input: {
  ticketRow: ClientSupportTicketRow;
  replyId: string;
  replyMessage: string;
  authorName: string;
  companyName?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const { ticketRow, replyId, replyMessage } = input;
  const companyName =
    input.companyName?.trim() ||
    (await findCompanyById(ticketRow.company_id))?.name?.trim() ||
    "Tu empresa";

  if (!(await isTicketReplyEmailEnabled(ticketRow.company_id))) {
    return { ok: true, skipped: true };
  }

  const { email: recipient, source } = await resolveTicketRecipientEmail(ticketRow);
  if (!recipient) {
    console.warn(
      "[support-reply-email] sin destinatario",
      ticketRow.ticket_code,
      ticketRow.id,
    );
    return { ok: false, error: "no_recipient" };
  }

  if (await hasSentSupportTicketReplyEmail(ticketRow.id, replyId, recipient)) {
    return { ok: true, skipped: true };
  }

  const statusLabel = STATUS_LABELS[ticketRow.status] ?? ticketRow.status;
  const panelUrl = supportTicketPanelUrl(ticketRow.ticket_code);
  const content = renderSupportTicketReplyToClient({
    ticketCode: ticketRow.ticket_code,
    subject: ticketRow.subject,
    statusLabel,
    companyName,
    replyMessage,
    authorName: input.authorName,
    panelUrl,
    updatedAt: new Date().toISOString(),
  });

  const result = await sendTransactionalEmail({
    templateKey: SUPPORT_TICKET_REPLY_TEMPLATE_KEY,
    subject: content.subject,
    recipientEmail: recipient,
    html: content.html,
    text: content.text,
    companyId: ticketRow.company_id,
    userId: ticketRow.user_id ?? undefined,
    skipIdempotency: true,
    metadata: {
      idempotency_key: idempotencyKey(ticketRow.id, replyId),
      ticket_id: ticketRow.id,
      ticket_code: ticketRow.ticket_code,
      reply_id: replyId,
      recipient_source: source,
      reference_type: "support_ticket_reply",
      reference_id: replyId,
      event_type: SUPPORT_TICKET_REPLY_TEMPLATE_KEY,
    },
  });

  if (!result.ok && !result.skipped) {
    console.warn(
      "[support-reply-email] envío fallido",
      ticketRow.ticket_code,
      result.error ?? "unknown",
    );
  }

  return result;
}

export async function sendSupportTicketReplyEmailBestEffort(input: {
  ticketRow: ClientSupportTicketRow;
  replyId: string;
  replyMessage: string;
  authorName: string;
  companyName?: string | null;
}): Promise<void> {
  try {
    await sendSupportTicketReplyEmail(input);
  } catch (error) {
    console.warn(
      "[support-reply-email] sendSupportTicketReplyEmailBestEffort",
      input.ticketRow.ticket_code,
      error instanceof Error ? error.message : error,
    );
  }
}
