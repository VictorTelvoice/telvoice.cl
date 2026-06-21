import { sendLeadNotificationEmail } from "./email.js";
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

export async function handleLandingContactLead(body) {
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

  await saveLeadRecord(null, lead, { source: "landing_contact" });

  try {
    await sendLeadNotificationEmail({
      name,
      email,
      phone: phone || contactRaw,
      message,
      pageUrl: body.page_url || body.current_url || null,
    });
  } catch (err) {
    console.error("[landing-contact-lead] notify:", err.message);
  }

  return {
    ok: true,
    message:
      "Consulta enviada. Te contactaremos pronto para revisar tu requerimiento.",
  };
}
