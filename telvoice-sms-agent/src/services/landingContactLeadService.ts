import { getSupabase } from "../database/supabaseClient.js";
import { env } from "../config/env.js";
import { sendTransactionalEmail } from "./transactionalEmailService.js";
import { renderLandingContactLeadAdminAlert } from "./transactionalEmailTemplates.js";
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

  const rendered = renderLandingContactLeadAdminAlert({
    contactName: name,
    contactEmail: email,
    contactPhone: phone,
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
