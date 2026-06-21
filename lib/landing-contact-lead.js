import { sendLeadNotificationEmail } from "./email.js";
import { isSupabaseConfigured } from "./web-agent/supabase-rest.js";
import { saveLeadRecord } from "./web-agent/session.js";

function splitContactValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return { email: null, phone: null };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { email: trimmed.toLowerCase(), phone: null };
  }
  if (trimmed.includes("@")) {
    return { email: trimmed.toLowerCase(), phone: null };
  }
  return { email: null, phone: trimmed };
}

function buildLeadMessage(body) {
  const parts = [];
  const mensaje = String(body.message || body.mensaje || "").trim();
  const nota = String(body.nota || body.context || "").trim();

  if (mensaje) parts.push(mensaje);
  if (nota && nota !== mensaje) {
    parts.push(nota);
  }
  return parts.join("\n\n").trim();
}

function agentApiOrigin() {
  return (
    process.env.AGENT_API_ORIGIN ||
    process.env.PRICING_API_ORIGIN ||
    "https://agent.telvoice.cl"
  ).replace(/\/$/, "");
}

async function forwardToAgent(body) {
  const res = await fetch(`${agentApiOrigin()}/api/public/contact-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: body.name || body.nombre_empresa,
      contact: body.contact || body.contacto,
      message: buildLeadMessage(body),
      page_url: body.page_url || body.current_url || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const msg =
      (data && (data.error || data.message)) ||
      `Agent contact-lead HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function handleLandingContactLead(body) {
  try {
    return await forwardToAgent(body);
  } catch (err) {
    console.warn("[landing-contact-lead] agent forward failed:", err.message);
  }

  const name = String(body.name || body.nombre_empresa || "").trim();
  const contactRaw = String(body.contact || body.contacto || "").trim();
  const message = buildLeadMessage(body || {});

  if (name.length < 2) {
    throw new Error("Indique su nombre o el nombre de su empresa.");
  }
  if (!contactRaw) {
    throw new Error("Indique un WhatsApp o correo de contacto.");
  }

  const { email, phone } = splitContactValue(contactRaw);
  if (!email && !phone) {
    throw new Error("Indique un WhatsApp o correo de contacto válido.");
  }

  const lead = {
    name,
    company: name,
    email,
    phone: phone || contactRaw,
    message: message || null,
    use_case: message || null,
  };

  let saved = false;
  if (isSupabaseConfigured()) {
    await saveLeadRecord(null, lead, { source: "landing_contact" });
    saved = true;
  }

  const notify = await sendLeadNotificationEmail({
    name,
    email,
    phone: phone || contactRaw,
    message,
    pageUrl: body.page_url || body.current_url || null,
  });

  if (!notify.ok) {
    if (notify.skipped) {
      throw new Error(
        "No pudimos enviar la notificación (falta RESEND_API_KEY o CONTACT_LEAD_NOTIFY_EMAIL en el servidor).",
      );
    }
    throw new Error(
      "No pudimos enviar la notificación por correo. Intenta nuevamente en unos minutos.",
    );
  }

  if (!saved && !notify.ok) {
    throw new Error("No pudimos registrar tu consulta. Intenta nuevamente.");
  }

  return {
    ok: true,
    message:
      "Consulta enviada. Te contactaremos pronto para revisar tu requerimiento.",
  };
}
