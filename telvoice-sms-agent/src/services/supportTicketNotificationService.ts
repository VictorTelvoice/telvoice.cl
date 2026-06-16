import { env } from "../config/env.js";
import type { SupportTicket } from "../types/support-tickets.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import { findCompanyById } from "./companyService.js";
import { sendTransactionalEmail } from "./transactionalEmailService.js";

const TEMPLATE_KEY = "support_ticket_created_admin_alert";

function supportAlertEmails(): string[] {
  const configured = env.support.alertEmail?.trim();
  if (configured && configured.includes("@")) {
    return [configured];
  }
  const ops =
    process.env.ORDER_NOTIFY_EMAIL?.trim() ||
    process.env.BILLING_NOTIFY_EMAIL?.trim() ||
    "victor@telvoice.net";
  return ops
    .split(/[,;]/)
    .map((email) => email.trim())
    .filter((email) => email.includes("@"));
}

function summarizeMessage(message: string, max = 400): string {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function adminSupportTicketUrl(): string {
  const base = env.publicAdminUrl || env.publicAppUrl || "https://agent.telvoice.cl";
  return `${base.replace(/\/$/, "")}/admin/support`;
}

export function renderSupportTicketCreatedAdminAlert(input: {
  companyName: string;
  clientEmail: string;
  ticket: Pick<SupportTicket, "code" | "subject" | "priority" | "category" | "message" | "createdAt">;
}): { subject: string; text: string; html: string } {
  const subject = `Nuevo ticket de soporte Telvoice: ${input.ticket.code}`;
  const summary = summarizeMessage(input.ticket.message);
  const text = [
    "Nuevo ticket de soporte recibido.",
    "",
    `Empresa: ${input.companyName}`,
    `Cliente: ${input.clientEmail}`,
    `Ticket: ${input.ticket.code}`,
    `Asunto: ${input.ticket.subject}`,
    `Prioridad: ${input.ticket.priority}`,
    `Categoría: ${input.ticket.category}`,
    "Mensaje:",
    `"${summary}"`,
    "",
    `Fecha: ${input.ticket.createdAt}`,
    "",
    "Ver en Superadmin:",
    adminSupportTicketUrl(),
  ].join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
    <p><strong>Nuevo ticket de soporte recibido.</strong></p>
    <ul>
      <li><strong>Empresa:</strong> ${escapeHtml(input.companyName)}</li>
      <li><strong>Cliente:</strong> ${escapeHtml(input.clientEmail)}</li>
      <li><strong>Ticket:</strong> ${escapeHtml(input.ticket.code)}</li>
      <li><strong>Asunto:</strong> ${escapeHtml(input.ticket.subject)}</li>
      <li><strong>Prioridad:</strong> ${escapeHtml(input.ticket.priority)}</li>
      <li><strong>Categoría:</strong> ${escapeHtml(input.ticket.category)}</li>
    </ul>
    <p><strong>Mensaje:</strong><br>${escapeHtml(summary)}</p>
    <p><a href="${escapeHtml(adminSupportTicketUrl())}">Ver en Superadmin</a></p>
  </body></html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function hasSentSupportTicketAdminAlert(
  ticketId: string,
  recipientEmail: string,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("email_logs")
    .select("id")
    .eq("template_key", TEMPLATE_KEY)
    .eq("recipient_email", recipientEmail)
    .filter("metadata->>ticket_id", "eq", ticketId)
    .in("status", ["sent", "pending"])
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return false;
    console.warn("[support-alert] hasSentSupportTicketAdminAlert", error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Notificación interna al crear ticket desde panel cliente.
 * Implementación actual: email (Resend). Extensible a Telegram/webhook.
 */
export async function notifyInternalSupportTicketCreated(
  ticket: SupportTicket,
  companyId: string,
): Promise<void> {
  const company = await findCompanyById(companyId);
  const companyName = company?.name?.trim() || "Cliente";
  const clientEmail = company?.billing_email?.trim() || "—";
  const content = renderSupportTicketCreatedAdminAlert({
    companyName,
    clientEmail,
    ticket,
  });

  for (const recipientEmail of supportAlertEmails()) {
    if (await hasSentSupportTicketAdminAlert(ticket.id, recipientEmail)) {
      continue;
    }

    const result = await sendTransactionalEmail({
      templateKey: TEMPLATE_KEY,
      subject: content.subject,
      recipientEmail,
      html: content.html,
      text: content.text,
      companyId,
      skipIdempotency: true,
      metadata: {
        ticket_id: ticket.id,
        ticket_code: ticket.code,
        reference_type: "support_ticket",
        reference_id: ticket.id,
        event_type: TEMPLATE_KEY,
      },
    });

    if (!result.ok && !result.skipped) {
      console.warn(
        "[support-alert] notifyInternalSupportTicketCreated failed",
        ticket.code,
        result.error ?? "unknown",
      );
    }
  }
}

export async function notifyInternalSupportTicketCreatedBestEffort(
  ticket: SupportTicket,
  companyId: string,
  source?: string | null,
): Promise<void> {
  if (source && source !== "client_panel") return;
  try {
    await notifyInternalSupportTicketCreated(ticket, companyId);
  } catch (error) {
    console.warn(
      "[support-alert] notifyInternalSupportTicketCreatedBestEffort",
      ticket.code,
      error instanceof Error ? error.message : error,
    );
  }
}
