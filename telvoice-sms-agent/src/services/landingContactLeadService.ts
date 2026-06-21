import { getSupabase } from "../database/supabaseClient.js";
import { env } from "../config/env.js";
import { sendTransactionalEmail } from "./transactionalEmailService.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const TEMPLATE_KEY = "landing_contact_lead_admin_alert";

function parseNotifyList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;]/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes("@")),
    ),
  ];
}

export function resolveContactLeadNotifyEmails(): string[] {
  const configured =
    env.admin.superadminEmail?.trim() ||
    process.env.ORDER_NOTIFY_EMAIL?.trim() ||
    process.env.BILLING_NOTIFY_EMAIL?.trim() ||
    "victor@telvoice.net";
  return parseNotifyList(configured);
}

function splitContactValue(value: string): { email: string | null; phone: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { email: null, phone: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { email: trimmed.toLowerCase(), phone: null };
  }
  if (trimmed.includes("@")) {
    return { email: trimmed.toLowerCase(), phone: null };
  }
  return { email: null, phone: trimmed };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAlert(input: {
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  pageUrl: string | null;
}): { subject: string; text: string; html: string } {
  const subject = `[Telvoice] Consulta landing — ${input.name}`;
  const text = [
    "Nueva consulta desde telvoice.cl",
    "",
    `Nombre o empresa: ${input.name}`,
    `Correo: ${input.email || "—"}`,
    `Teléfono: ${input.phone || "—"}`,
    input.pageUrl ? `Página: ${input.pageUrl}` : null,
    "",
    "Mensaje:",
    input.message || "—",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
    <p><strong>Nueva consulta desde telvoice.cl</strong></p>
    <ul>
      <li><strong>Nombre o empresa:</strong> ${escapeHtml(input.name)}</li>
      <li><strong>Correo:</strong> ${escapeHtml(input.email || "—")}</li>
      <li><strong>Teléfono:</strong> ${escapeHtml(input.phone || "—")}</li>
      ${input.pageUrl ? `<li><strong>Página:</strong> ${escapeHtml(input.pageUrl)}</li>` : ""}
    </ul>
    <p><strong>Mensaje</strong></p>
    <p style="white-space:pre-wrap">${escapeHtml(input.message || "—")}</p>
  </body></html>`;

  return { subject, text, html };
}

export async function handlePublicContactLead(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  contact?: string;
  message?: string;
  pageUrl?: string | null;
}): Promise<{ ok: true; message: string }> {
  const name = input.name.trim();
  const message = String(input.message || "").trim();
  const phoneRaw = String(input.phone || "").trim();
  let email = String(input.email || "").trim().toLowerCase();
  let phone = phoneRaw || null;

  if (!email && input.contact) {
    const legacy = splitContactValue(input.contact);
    email = legacy.email || "";
    if (!phone) phone = legacy.phone;
  }

  if (name.length < 2) {
    throw new Error("Indique su nombre o el nombre de su empresa.");
  }
  if (!email) {
    throw new Error("Indique un correo de contacto.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Indique un correo válido.");
  }
  if (!message) {
    throw new Error("Indique un mensaje.");
  }

  const { error } = await getSupabase().from("web_agent_leads").insert({
    name,
    company: name,
    email,
    phone,
    message: message || null,
    source: "landing_contact",
    status: "new",
  });

  if (error) {
    wrapSupabaseError(error, "handlePublicContactLead");
  }

  const rendered = renderAlert({
    name,
    email,
    phone,
    message,
    pageUrl: input.pageUrl || null,
  });

  const recipients = resolveContactLeadNotifyEmails();
  if (!recipients.length) {
    throw new Error("No hay destinatarios configurados para alertas de contacto.");
  }

  let sent = 0;
  for (const recipientEmail of recipients) {
    const result = await sendTransactionalEmail({
      templateKey: TEMPLATE_KEY,
      subject: rendered.subject,
      recipientEmail,
      html: rendered.html,
      text: rendered.text,
      skipIdempotency: true,
      metadata: {
        source: "landing_contact",
        lead_name: name,
        lead_email: email,
        lead_phone: phone,
      },
    });
    if (result.ok && !result.skipped) sent += 1;
  }

  if (sent === 0) {
    throw new Error("No se pudo enviar la notificación interna del formulario.");
  }

  return {
    ok: true,
    message:
      "Consulta enviada. Te contactaremos pronto para revisar tu requerimiento.",
  };
}
