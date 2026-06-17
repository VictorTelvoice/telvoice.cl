import { env } from "../config/env.js";
import type { ClientSupportTicketRow } from "../types/support-tickets.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import { findCompanyById } from "./companyService.js";
import { resolveSupportTeamAlertEmails } from "./supportTicketNotificationService.js";
import { sendTransactionalEmail } from "./transactionalEmailService.js";
import { renderSupportTicketClientReplyToAdmin } from "./transactionalEmailTemplates.js";

export const SUPPORT_TICKET_CLIENT_REPLY_TEMPLATE_KEY =
  "support_ticket_client_reply_to_admin";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function adminSupportTicketUrl(ticketId: string): string {
  const base = (env.publicAdminUrl || env.publicAppUrl || "https://agent.telvoice.cl").replace(
    /\/$/,
    "",
  );
  return `${base}/admin/support?ticket=${encodeURIComponent(ticketId)}`;
}

function clientReplyIdempotencyKey(ticketId: string, replyId: string): string {
  return `support-ticket-client-reply:${ticketId}:${replyId}`;
}

async function hasSentSupportTicketClientReplyEmail(
  ticketId: string,
  replyId: string,
  recipientEmail: string,
): Promise<boolean> {
  const key = clientReplyIdempotencyKey(ticketId, replyId);
  const { data, error } = await getSupabase()
    .from("email_logs")
    .select("id")
    .eq("template_key", SUPPORT_TICKET_CLIENT_REPLY_TEMPLATE_KEY)
    .eq("recipient_email", normalizeEmail(recipientEmail))
    .filter("metadata->>idempotency_key", "eq", key)
    .in("status", ["sent", "pending"])
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return false;
    console.warn(
      "[support-client-reply-email] hasSentSupportTicketClientReplyEmail",
      error.message,
    );
    return false;
  }
  return Boolean(data);
}

async function resolveClientContactForTicket(
  row: ClientSupportTicketRow,
): Promise<{ email: string; name: string }> {
  if (row.user_id) {
    const { data } = await getSupabase()
      .from("user_profiles")
      .select("email, full_name")
      .eq("id", row.user_id)
      .maybeSingle();
    const email = data?.email?.trim();
    if (email?.includes("@")) {
      const name =
        (typeof data?.full_name === "string" && data.full_name.trim()) ||
        email.split("@")[0] ||
        "Cliente";
      return { email: normalizeEmail(email), name };
    }
  }

  const company = await findCompanyById(row.company_id);
  const billing = company?.billing_email?.trim();
  if (billing?.includes("@")) {
    return {
      email: normalizeEmail(billing),
      name: company?.name?.trim() || billing.split("@")[0] || "Cliente",
    };
  }

  const companyName = company?.name?.trim() || "Cliente";
  return { email: "—", name: companyName };
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

export async function sendSupportTicketClientReplyEmail(input: {
  ticketRow: ClientSupportTicketRow;
  replyId: string;
  replyMessage: string;
  authorName?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const { ticketRow, replyId, replyMessage } = input;
  const text = replyMessage.trim();
  if (!text) {
    return { ok: false, error: "empty_message" };
  }

  const recipients = resolveSupportTeamAlertEmails();
  if (!recipients.length) {
    console.warn(
      "[support-client-reply-email] sin destinatarios equipo",
      ticketRow.ticket_code,
      ticketRow.id,
    );
    return { ok: false, error: "no_recipients" };
  }

  const pendingRecipients: string[] = [];
  for (const recipient of recipients) {
    if (!(await hasSentSupportTicketClientReplyEmail(ticketRow.id, replyId, recipient))) {
      pendingRecipients.push(recipient);
    }
  }

  if (!pendingRecipients.length) {
    return { ok: true, skipped: true };
  }

  const company = await findCompanyById(ticketRow.company_id);
  const companyName = company?.name?.trim() || "Cliente";
  const clientContact = await resolveClientContactForTicket(ticketRow);
  const authorName =
    input.authorName?.trim() || clientContact.name || companyName || "Cliente";
  const statusLabel = STATUS_LABELS[ticketRow.status] ?? ticketRow.status;
  const panelUrl = adminSupportTicketUrl(ticketRow.id);
  const content = renderSupportTicketClientReplyToAdmin({
    ticketCode: ticketRow.ticket_code,
    subject: ticketRow.subject,
    statusLabel,
    companyName,
    clientEmail: clientContact.email,
    clientName: authorName,
    replyMessage: text,
    panelUrl,
    updatedAt: new Date().toISOString(),
  });

  let anySent = false;
  let lastError: string | undefined;

  for (const recipientEmail of pendingRecipients) {
    const result = await sendTransactionalEmail({
      templateKey: SUPPORT_TICKET_CLIENT_REPLY_TEMPLATE_KEY,
      subject: content.subject,
      recipientEmail,
      html: content.html,
      text: content.text,
      companyId: ticketRow.company_id,
      userId: ticketRow.user_id ?? undefined,
      skipIdempotency: true,
      metadata: {
        idempotency_key: clientReplyIdempotencyKey(ticketRow.id, replyId),
        ticket_id: ticketRow.id,
        ticket_code: ticketRow.ticket_code,
        reply_id: replyId,
        company_id: ticketRow.company_id,
        recipient_source: "support_team_alert",
        reference_type: "support_ticket_client_reply",
        reference_id: replyId,
        event_type: SUPPORT_TICKET_CLIENT_REPLY_TEMPLATE_KEY,
      },
    });

    if (result.ok || result.skipped) {
      anySent = true;
    } else {
      lastError = result.error ?? "unknown";
      console.warn(
        "[support-client-reply-email] envío fallido",
        ticketRow.ticket_code,
        recipientEmail,
        lastError,
      );
    }
  }

  if (!anySent && lastError) {
    return { ok: false, error: lastError };
  }

  return { ok: true };
}

export async function sendSupportTicketClientReplyEmailBestEffort(input: {
  ticketRow: ClientSupportTicketRow;
  replyId: string;
  replyMessage: string;
  authorName?: string | null;
}): Promise<void> {
  try {
    await sendSupportTicketClientReplyEmail(input);
  } catch (error) {
    console.warn(
      "[support-client-reply-email] sendSupportTicketClientReplyEmailBestEffort",
      input.ticketRow.ticket_code,
      error instanceof Error ? error.message : error,
    );
  }
}
