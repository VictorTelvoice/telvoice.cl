import { sendLeadNotificationEmail, sendLeadClientConfirmationEmail } from "./email.js";
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
  const origin = agentApiOrigin();
  const message = buildLeadMessage(body);
  const payload = {
    name: body.name || body.nombre_empresa,
    email: lead.email,
    phone: lead.phone,
    message,
    page_url: body.page_url || body.current_url || null,
  };

  const attempts = [
    { path: "/api/public/contact-lead", body: payload },
    {
      path: "/api/public/lead",
      body: { ...payload, source: "landing_contact" },
    },
  ];

  let lastError = "Agent contact-lead no disponible";
  for (const attempt of attempts) {
    const res = await fetch(`${origin}${attempt.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attempt.body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      lastError =
        (data && (data.error?.message || data.message || data.error)) ||
        `Agent ${attempt.path} HTTP 404`;
      continue;
    }
    if (!res.ok || data.ok === false || data.success === false) {
      const msg =
        (data && (data.error?.message || data.error || data.message)) ||
        `Agent ${attempt.path} HTTP ${res.status}`;
      throw new Error(typeof msg === "string" ? msg : lastError);
    }
    return data;
  }
  throw new Error(lastError);
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
  if (!message) {
    throw new Error("Indique un mensaje.");
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
        "No pudimos enviar la notificación (el agente no está disponible o falta RESEND_API_KEY en el servidor).",
      );
    }
    throw new Error(
      "No pudimos enviar la notificación por correo. Intenta nuevamente en unos minutos.",
    );
  }

  const clientNotify = await sendLeadClientConfirmationEmail({
    name,
    email,
    message,
  });
  if (!clientNotify.ok && !clientNotify.skipped) {
    console.warn("[landing-contact-lead] client confirmation failed:", clientNotify.error);
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
