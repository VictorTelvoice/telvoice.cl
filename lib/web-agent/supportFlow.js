import { normalizeIntentText } from "./intent.js";
import { handleLandingContactLead } from "../landing-contact-lead.js";

const SUPPORT_CAPTURE_STEPS = ["support_name", "support_email", "support_issue"];

const SUPPORT_FAQ_PATTERN =
  /\b(tienen|hay|ofrecen|cuentan con|disponen de)\b.*\b(soporte|atencion|ayuda)\b/;

const SUPPORT_ACTION_PATTERN =
  /\b(soporte|suporte|support|ayuda tecnica|problema tecnico|tengo un problema|no funciona|no me funciona|reportar problema|incidencia|falla|error en|necesito ayuda|contactar soporte|hablar con soporte|ticket de soporte|soporte telvoice|soporte tecnico|atencion al cliente|atencion cliente)\b/;

export function isSupportCaptureStep(step) {
  return Boolean(step && String(step).startsWith("support_"));
}

export function isSupportRequest(text) {
  const normalized = normalizeIntentText(text);
  if (!normalized) {
    return false;
  }
  if (SUPPORT_FAQ_PATTERN.test(normalized)) {
    return false;
  }
  return SUPPORT_ACTION_PATTERN.test(normalized);
}

export function getSupportStepPrompt(step) {
  switch (step) {
    case "support_name":
      return "¿Cuál es tu nombre?";
    case "support_email":
      return "¿Tu correo de contacto?";
    case "support_issue":
      return "Cuéntanos brevemente el problema o consulta de soporte.";
    default:
      return null;
  }
}

export function nextSupportStep(current) {
  const idx = SUPPORT_CAPTURE_STEPS.indexOf(current);
  if (idx < 0 || idx >= SUPPORT_CAPTURE_STEPS.length - 1) {
    return null;
  }
  return SUPPORT_CAPTURE_STEPS[idx + 1];
}

export function parseSupportStepInput(step, value, leadData) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Por favor escribe una respuesta válida." };
  }

  const next = { ...leadData, support_flow: true };

  switch (step) {
    case "support_name":
      if (trimmed.length < 2) {
        return { ok: false, error: "Indica tu nombre." };
      }
      next.name = trimmed;
      break;
    case "support_email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return { ok: false, error: "Email inválido. Ejemplo: nombre@empresa.cl" };
      }
      next.email = trimmed.toLowerCase();
      break;
    case "support_issue":
      if (trimmed.length < 10) {
        return {
          ok: false,
          error: "Describe el problema con un poco más de detalle (mínimo 10 caracteres).",
        };
      }
      next.issue = trimmed;
      next.message = trimmed;
      break;
    default:
      break;
  }

  return { ok: true, leadData: next };
}

export async function submitSupportRequest({
  name,
  email,
  issue,
  pageUrl,
  sessionId,
}) {
  const message = `[Soporte vía agente comercial Telvoice.cl]\n\n${issue}`;
  const note = sessionId ? `Sesión agente: ${sessionId}` : null;

  return handleLandingContactLead({
    name,
    email,
    message,
    page_url: pageUrl,
    current_url: pageUrl,
    nota: note,
    source: "web_agent_support",
  });
}
