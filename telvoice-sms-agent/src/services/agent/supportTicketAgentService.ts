import { createSupportTicket } from "../clientSupportTicketService.js";
import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
} from "../../types/support-tickets.js";
import { SUPPORT_CATEGORIES } from "../../types/support-tickets.js";

const PRIORITY_LABEL: Record<SupportTicketPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export function inferSupportTicketCategory(text: string): SupportTicketCategory {
  const n = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/\b(compra|pago|acredit|mercadopago|bolsa|orden)\b/.test(n)) {
    return "Compra y pago";
  }
  if (/\b(saldo|credito|crédito|sms disponibles|wallet)\b/.test(n)) {
    return "Saldo SMS";
  }
  if (/\b(envio|envío|campana|campaña|mandar sms|no llega el sms)\b/.test(n)) {
    return "Campañas y envíos";
  }
  if (/\b(dlr|reporte|entregabilidad|delivered|submitted|no entregado)\b/.test(n)) {
    return "Entregabilidad SMS";
  }
  if (/\b(api|webhook|integracion|integración|smpp)\b/.test(n)) {
    return "API / Webhook";
  }
  if (/\b(factura|boleta|dte)\b/.test(n)) {
    return "Facturación";
  }
  if (/\b(cuenta|acceso|login|sesion|sesión|usuario)\b/.test(n)) {
    return "Configuración de cuenta";
  }
  if (/\b(alto volumen|smpp)\b/.test(n)) {
    return "SMPP / Alto volumen";
  }
  return "Otro";
}

export function inferSupportTicketPriority(text: string): SupportTicketPriority {
  const n = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    /\b(no puedo enviar|saldo desapareci|pago realizado|no se acredit|no acredit|api caida|api caída|error critico|error crítico|produccion detenida|producción detenida|urgente)\b/.test(
      n,
    )
  ) {
    return "high";
  }
  if (/\b(consulta|duda|informacion|información)\b/.test(n) && n.length < 40) {
    return "low";
  }
  return "medium";
}

export function inferSupportTicketSubject(
  message: string,
  category: SupportTicketCategory,
): string {
  const trimmed = message.trim();
  if (trimmed.length <= 72) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() ?? trimmed;
  if (firstSentence.length <= 72) {
    return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
  }
  const byCategory: Partial<Record<SupportTicketCategory, string>> = {
    "Compra y pago": "Consulta sobre compra o pago",
    "Saldo SMS": "Consulta sobre saldo SMS",
    "Campañas y envíos": "Consulta sobre envíos SMS",
    "Entregabilidad SMS": "Consulta sobre DLR o entregabilidad",
    "API / Webhook": "Consulta sobre API o integración",
    "Configuración de cuenta": "Consulta sobre cuenta",
    Otro: "Consulta de soporte",
  };
  return byCategory[category] ?? "Consulta de soporte Telvoice";
}

export function mapQuickActionToCategory(message: string): SupportTicketCategory | null {
  const n = normalizeIntentText(message);
  if (/problema con compra|compra o saldo|compra y pago/.test(n)) {
    return "Compra y pago";
  }
  if (/problema con envio|envio sms|envío sms/.test(n)) {
    return "Campañas y envíos";
  }
  if (/problema con dlr|dlr|reportes/.test(n)) {
    return "Entregabilidad SMS";
  }
  if (/problema con api|api/.test(n)) {
    return "API / Webhook";
  }
  if (/otro problema/.test(n)) {
    return "Otro";
  }
  return null;
}

function normalizeIntentText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSupportTicketReviewReply(input: {
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  message: string;
}): string {
  return (
    "Preparé este ticket:\n\n" +
    `Asunto: ${input.subject}\n` +
    `Categoría: ${input.category}\n` +
    `Prioridad: ${PRIORITY_LABEL[input.priority]}\n` +
    `Mensaje: ${input.message}\n\n` +
    "¿Quieres que lo cree ahora?"
  );
}

export function buildSupportTicketDisplayCode(ticket: SupportTicket): string {
  return ticket.code;
}

export async function createSupportTicketForCompany(input: {
  companyId: string;
  userId?: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: true; ticket: SupportTicket } | { ok: false; error: string }> {
  if (!SUPPORT_CATEGORIES.includes(input.category)) {
    return { ok: false, error: "Categoría no válida." };
  }
  const result = await createSupportTicket({
    companyId: input.companyId,
    userId: input.userId,
    subject: input.subject,
    category: input.category,
    priority: input.priority,
    message: input.message,
    source: "agent_chat",
    metadata: input.metadata,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, ticket: result.data };
}
