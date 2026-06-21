import { sendLeadNotificationEmail } from "./email.js";
import { isSupabaseConfigured } from "./web-agent/supabase-rest.js";
import { saveLeadRecord } from "./web-agent/session.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitContactValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return { email: null, phone: null };
  }
  if (EMAIL_RE.test(trimmed)) {
    return { email: trimmed.toLowerCase(), phone: null };
  }
  if (trimmed.includes("@")) {
    return { email: trimmed.toLowerCase(), phone: null };
  }
  return { email: null, phone: trimmed };
}

function parseLeadContact(body) {
  const emailRaw = String(
    body.email || body.correo || "",
  ).trim();
  const phoneRaw = String(
    body.phone || body.telefono || "",
  ).trim();

  if (emailRaw) {
    return {
      email: emailRaw.toLowerCase(),
      phone: phoneRaw || null,
    };
  }

  const legacy = splitContactValue(body.contact || body.contacto || "");
  return {
    email: legacy.email,
    phone: phoneRaw || legacy.phone,
  };
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

async function forwardToAgent(body, lead) {
  const res = await fetch(`${agentApiOrigin()}/api/public/contact-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: body.name || body.nombre_empresa,
      email: lead.email,
      phone: lead.phone,
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
  const name = String(body.name || body.nombre_empresa || "").trim();
  const message = buildLeadMessage(body || {});
  const { email, phone } = parseLeadContact(body || {});

  if (name.length < 2) {
    throw new Error("Indique su nombre o el nombre de su empresa.");
  }
  if (!email) {
    throw new Error("Indique un correo de contacto.");
  }
  if (!EMAIL_RE.test(email)) {
    throw new Error("Indique un correo válido.");
  }

  const lead = {
    name,
    company: name,
    email,
    phone,
    message: message || null,
    use_case: message || null,
  };

  try {
    return await forwardToAgent(body, lead);
  } catch (err) {
    console.warn("[landing-contact-lead] agent forward failed:", err.message);
  }

  let saved = false;
  if (isSupabaseConfigured()) {
    await saveLeadRecord(null, lead, { source: "landing_contact" });
    saved = true;
  }

  const notify = await sendLeadNotificationEmail({
    name,
    email,
    phone,
    message,
    pageUrl: body.page_url || body.current_url || null,
  });

  if (!notify.ok) {
    if (notify.skipped) {
      throw new Error(
        "No pudimos enviar la notificación (falta RESEND_API_KEY o ORDER_NOTIFY_EMAIL en el servidor).",
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
