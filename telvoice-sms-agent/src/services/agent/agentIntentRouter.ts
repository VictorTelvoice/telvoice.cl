import {
  classifyTelegramIntent,
  detectCommercialIntent,
  isExplicitKnowledgeQuestion,
  matchesCommercialBuyIntent,
  normalizeIntentText,
} from "../telegramIntentService.js";
import { matchesCapabilitiesIntent } from "../telegramCapabilities.js";
import { extractSmsQuantityFromText } from "../commercialQuoteService.js";
import {
  extractCommercialQuantity,
  isLikelyCommercialPhrase,
  matchesCommercialBuyIntentNormalized,
  normalizeCommercialText,
} from "./agentCommercialText.js";
import {
  matchesSendSmsFlowIntent,
  parseFollowUpSmsBody,
} from "./agentSendSmsIntent.js";
import { matchesInboundSmsKnowledgeIntent } from "./agentInboundSmsIntent.js";
import type { ConversationMemory } from "./agentConversationMemory.js";
import type { AgentChannel, AgentIntent } from "./types.js";
import {
  isOperationalFlowActive,
  shouldTreatUserTextAsSmsMessage,
} from "./agentOperationalState.js";
import { isSupportTicketIntent } from "./agentSupportTicketIntent.js";
import { SEND_SMS_FLOW_STEP } from "./agentSendSmsFlowUi.js";

export type RoutedIntent = {
  intent: AgentIntent;
  confidence: number;
  commercialQuantity: number | null;
  requiresAuth: boolean;
  operationalCommand: string | null;
};

const CONFIRM_RE =
  /^(confirmo|si confirmo|sí confirmo|confirmar|ok confirmo|si confirmar|sí confirmar|confirmar envio|confirmar envío|confirmar campaña|confirmar campana|confirmar envío|enviar ahora|sí, confirmar|si, confirmar|confirmo envio|confirmo envío)\b/i;
const CANCEL_RE =
  /^(cancelar|cancelo|no confirmo|anular|detener|salir|cerrar|terminar)\b/i;

export function matchesConfirmIntent(message: string): boolean {
  return CONFIRM_RE.test(normalizeIntentText(message.trim()));
}

export function matchesCancelIntent(message: string): boolean {
  return CANCEL_RE.test(normalizeIntentText(message.trim()));
}

function requiresCompanyIntent(intent: AgentIntent): boolean {
  return [
    "balance",
    "recent_messages",
    "recent_campaigns",
    "campaign_draft",
    "campaign_cost",
    "contact_list",
    "send_sms",
    "send_sms_flow",
    "launch_campaign",
    "reports",
    "invoices",
    "wallet",
  ].includes(intent);
}

export function detectFollowUpIntent(
  message: string,
  memory: ConversationMemory,
): RoutedIntent | null {
  const n = normalizeIntentText(message);
  if (
    !/\b(y eso|y el total|cuanto era|cuánto era|otra vez|de nuevo|lo anterior|esa cotizacion|esa cotización)\b/.test(
      n,
    )
  ) {
    return null;
  }
  if (memory.lastQuote) {
    return {
      intent: "follow_up",
      confidence: 0.82,
      commercialQuantity: memory.lastQuote.quoted_quantity,
      requiresAuth: false,
      operationalCommand: null,
    };
  }
  if (memory.lastIntent) {
    return {
      intent: "follow_up",
      confidence: 0.75,
      commercialQuantity: memory.lastQuantity ?? null,
      requiresAuth: false,
      operationalCommand: null,
    };
  }
  return null;
}

export function routeAgentIntent(
  message: string,
  channel: AgentChannel,
  options?: {
    command?: string;
    authorized?: boolean;
    memory?: ConversationMemory;
  },
): RoutedIntent {
  const normalized = normalizeIntentText(message);
  const text = message.trim();
  const memory = options?.memory ?? {};

  const followUp = detectFollowUpIntent(text, memory);
  if (followUp) {
    return followUp;
  }

  if (CONFIRM_RE.test(normalized)) {
    return { intent: "confirm", confidence: 0.99, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }
  if (CANCEL_RE.test(normalized)) {
    return { intent: "cancel", confidence: 0.99, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (shouldTreatUserTextAsSmsMessage(memory, text)) {
    return {
      intent: "send_sms_flow",
      confidence: 0.98,
      commercialQuantity: null,
      requiresAuth: true,
      operationalCommand: null,
    };
  }

  if (isOperationalFlowActive(memory)) {
    const step = memory.sendSmsFlowStep;
    if (
      step === SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV ||
      step === SEND_SMS_FLOW_STEP.NEED_CSV_FILE ||
      memory.waitingForRecipient ||
      memory.waitingForCsv
    ) {
      const followPhone = text.match(/^(?:al\s+)?(\+?56[\s-]?9[\d\s-]{8,}|9[\d\s-]{8,})\s*$/i);
      if (followPhone || /^(adjuntar|csv|planilla)\b/i.test(normalized)) {
        return {
          intent: "send_sms_flow",
          confidence: 0.9,
          commercialQuantity: null,
          requiresAuth: true,
          operationalCommand: null,
        };
      }
    }
  }

  if (
    /\b(no me sirvio|no me sirvió|respuesta incorrecta|mal respuesta|mala respuesta|no entendiste|no entendi|eso no era)\b/.test(
      normalized,
    ) &&
    !isLikelyCommercialPhrase(text)
  ) {
    return {
      intent: "negative_feedback",
      confidence: 0.9,
      commercialQuantity: null,
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (
    /\b(no entiendo|no entendi|no comprendo|que significa esto|no me queda claro)\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "confusion",
      confidence: 0.88,
      commercialQuantity: null,
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (
    /\b(frustrad|mal servicio|esto no funciona|no funciona bien|pésimo|pesimo)\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "frustration",
      confidence: 0.85,
      commercialQuantity: null,
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (
    /\b(hablar con|ejecutivo|persona humana|humano|vendedor|contactar a alguien)\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "human_contact",
      confidence: 0.84,
      commercialQuantity: null,
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (/\b(mercadopago|mercado pago|como pago|cómo pago|link de pago|pagar ahora)\b/.test(normalized)) {
    return {
      intent: "payment",
      confidence: 0.86,
      commercialQuantity: extractSmsQuantityFromText(text),
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (
    /\b(sirve para|funciona para|se puede usar para|otp|verificacion|verificación)\b/.test(
      normalized,
    ) &&
    channel === "landing"
  ) {
    return {
      intent: "commercial_doubt",
      confidence: 0.8,
      commercialQuantity: null,
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  const tg = channel === "telegram" ? classifyTelegramIntent(text, options?.command ?? "") : null;
  const op = tg?.operationalCommand ?? null;

  if (op === "saldo") {
    return { intent: "balance", confidence: 0.92, commercialQuantity: null, requiresAuth: true, operationalCommand: op };
  }
  if (op === "historial") {
    return { intent: "recent_messages", confidence: 0.92, commercialQuantity: null, requiresAuth: true, operationalCommand: op };
  }
  if (op === "enviar") {
    return { intent: "send_sms", confidence: 0.9, commercialQuantity: null, requiresAuth: true, operationalCommand: op };
  }

  if (channel !== "telegram" && matchesSendSmsFlowIntent(text)) {
    if (channel === "landing") {
      return {
        intent: "send_sms_flow",
        confidence: 0.92,
        commercialQuantity: null,
        requiresAuth: false,
        operationalCommand: null,
      };
    }
    return {
      intent: "send_sms_flow",
      confidence: 0.92,
      commercialQuantity: null,
      requiresAuth: true,
      operationalCommand: null,
    };
  }

  if (
    channel !== "telegram" &&
    (memory.sendSmsFlowActive ||
      memory.sendSmsFlowStep ||
      memory.pendingSmsMessage ||
      memory.pendingCsvUploadId)
  ) {
    const followPhone = text.match(/^(?:al\s+)?(\+?56[\s-]?9[\d\s-]{8,}|9[\d\s-]{8,})\s*$/i);
    const followBody =
      parseFollowUpSmsBody(text, {
        waitingForMessage:
          memory.waitingForMessage === true ||
          memory.sendSmsFlowStep === "need_message",
      }) != null &&
      !CONFIRM_RE.test(normalized) &&
      !CANCEL_RE.test(normalized);
    if (followPhone || followBody || /^(adjuntar|csv|planilla)\b/i.test(normalized)) {
      return {
        intent: "send_sms_flow",
        confidence: 0.88,
        commercialQuantity: null,
        requiresAuth: true,
        operationalCommand: null,
      };
    }
  }

  if (op === "ayuda") {
    return { intent: "capabilities", confidence: 0.9, commercialQuantity: null, requiresAuth: false, operationalCommand: op };
  }
  if (op === "planes" || op === "precios" || op === "bolsas") {
    return { intent: "commercial", confidence: 0.88, commercialQuantity: extractSmsQuantityFromText(text), requiresAuth: false, operationalCommand: op };
  }

  if (channel === "web_client" && isSupportTicketIntent(text)) {
    return {
      intent: "support_ticket",
      confidence: 0.95,
      commercialQuantity: null,
      requiresAuth: true,
      operationalCommand: null,
    };
  }

  const commercial = detectCommercialIntent(text);
  const commercialBuy =
    matchesCommercialBuyIntent(normalized) ||
    matchesCommercialBuyIntentNormalized(text) ||
    isLikelyCommercialPhrase(text);

  if (commercial || commercialBuy) {
    const qty =
      commercial?.quantity ??
      extractCommercialQuantity(text) ??
      memory.lastQuantity ??
      null;
    return {
      intent: "commercial",
      confidence: qty != null ? 0.92 : 0.88,
      commercialQuantity: qty,
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (matchesCapabilitiesIntent(normalizeCommercialText(text))) {
    return { intent: "capabilities", confidence: 0.85, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (
    /\b(saldo|balance|cuanto tengo|cuánto tengo|sms disponibles|mi saldo)\b/.test(normalized) &&
    !/\b(comprar|cargar|cotizar|necesito mas)\b/.test(normalized)
  ) {
    return { intent: "balance", confidence: 0.88, commercialQuantity: null, requiresAuth: true, operationalCommand: null };
  }

  if (matchesInboundSmsKnowledgeIntent(normalized)) {
    if (isOperationalFlowActive(memory)) {
      return {
        intent: "send_sms_flow",
        confidence: 0.85,
        commercialQuantity: null,
        requiresAuth: true,
        operationalCommand: null,
      };
    }
    if (matchesSendSmsFlowIntent(text)) {
      return {
        intent: "send_sms_flow",
        confidence: 0.9,
        commercialQuantity: null,
        requiresAuth: true,
        operationalCommand: null,
      };
    }
    return {
      intent: "inbound_sms_knowledge",
      confidence: 0.9,
      commercialQuantity: null,
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (/\b(ultimos envios|últimos envíos|historial|bandeja|ultimos sms)\b/.test(normalized)) {
    return { intent: "recent_messages", confidence: 0.86, commercialQuantity: null, requiresAuth: true, operationalCommand: null };
  }

  if (/\b(campanas|campañas|ultima campana|última campaña)\b/.test(normalized)) {
    return { intent: "recent_campaigns", confidence: 0.84, commercialQuantity: null, requiresAuth: true, operationalCommand: null };
  }

  if (/\b(factura|facturas|boleta)\b/.test(normalized)) {
    return { intent: "invoices", confidence: 0.8, commercialQuantity: null, requiresAuth: true, operationalCommand: null };
  }

  if (/\b(reporte|reportes|metricas|métricas)\b/.test(normalized)) {
    return { intent: "reports", confidence: 0.8, commercialQuantity: null, requiresAuth: true, operationalCommand: null };
  }

  if (/\b(wallet|movimientos saldo)\b/.test(normalized)) {
    return { intent: "wallet", confidence: 0.78, commercialQuantity: null, requiresAuth: true, operationalCommand: null };
  }

  if (/\b(optimiza|optimizar|mejora copy|mejorar mensaje|reducir segmentos)\b/.test(normalized)) {
    return { intent: "copy_help", confidence: 0.82, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (/\b(segmento|segmentos|caracteres|encoding|gsm|ucs)\b/.test(normalized)) {
    return { intent: "segments", confidence: 0.8, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (
    /\b(estrategia|buenas practicas|buenas prácticas|retail|ecommerce|restaurante|fintech)\b/.test(normalized)
  ) {
    return { intent: "strategy", confidence: 0.75, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (
    /\b(dlr|submitted|delivered|failed|provider_status|no llega|por que no llega|por qué no llega)\b/.test(
      normalized,
    )
  ) {
    if (isOperationalFlowActive(memory)) {
      return {
        intent: "send_sms_flow",
        confidence: 0.82,
        commercialQuantity: null,
        requiresAuth: true,
        operationalCommand: null,
      };
    }
    return { intent: "dlr_help", confidence: 0.82, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (
    /\b(no esta autorizado|no está autorizado|numero.*autorizado|número.*autorizado|destino.*autorizado|no autorizado|whitelist|ip no autorizada)\b/.test(
      normalized,
    )
  ) {
    return { intent: "dlr_help", confidence: 0.88, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (/\b(cotizar|comprar|quiero \d+.*sms)\b/.test(normalized)) {
    return {
      intent: "quote_purchase",
      confidence: 0.85,
      commercialQuantity: extractSmsQuantityFromText(text),
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (/\b(borrador\s+de\s+campana|borrador\s+de\s+campaña|solo\s+borrador|crear\s+borrador)\b/.test(normalized)) {
    return { intent: "campaign_draft", confidence: 0.88, commercialQuantity: null, requiresAuth: true, operationalCommand: null };
  }

  if (/\b(enviar campana|lanzar campaña)\b/.test(normalized)) {
    return { intent: "launch_campaign", confidence: 0.78, commercialQuantity: null, requiresAuth: true, operationalCommand: null };
  }

  if (/\b(registro|registrarme|crear cuenta|portal)\b/.test(normalized) && channel === "landing") {
    return { intent: "register", confidence: 0.75, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (/\b(lead|contacto|ejecutivo|vendedor)\b/.test(normalized) && channel === "landing") {
    return { intent: "lead_capture", confidence: 0.7, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (
    /\b(api|integrar|integracion|integración|smpp|whitelist|ip |encoding|segmento tecnico)\b/.test(
      normalized,
    ) &&
    !commercial &&
    !commercialBuy
  ) {
    return {
      intent: "technical_doubt",
      confidence: 0.78,
      commercialQuantity: null,
      requiresAuth: false,
      operationalCommand: null,
    };
  }

  if (isExplicitKnowledgeQuestion(normalized) || tg?.route === "knowledge") {
    if (isOperationalFlowActive(memory)) {
      return {
        intent: "send_sms_flow",
        confidence: 0.85,
        commercialQuantity: null,
        requiresAuth: true,
        operationalCommand: null,
      };
    }
    if (commercialBuy || /\b(comprar|cotizar|precio|bolsa)\b/.test(normalized)) {
      return {
        intent: "commercial",
        confidence: 0.85,
        commercialQuantity: extractSmsQuantityFromText(text),
        requiresAuth: false,
        operationalCommand: null,
      };
    }
    return { intent: "knowledge", confidence: 0.72, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  if (/^(hola|buenas|hey|buenos dias|buenas tardes)\b/.test(normalized)) {
    return { intent: "greeting", confidence: 0.7, commercialQuantity: null, requiresAuth: false, operationalCommand: null };
  }

  const intent: AgentIntent = "unknown";
  return {
    intent,
    confidence: 0.35,
    commercialQuantity: null,
    requiresAuth: requiresCompanyIntent(intent),
    operationalCommand: null,
  };
}

export const UNAUTHORIZED_PRIVATE_MSG =
  "Esta consulta requiere una cuenta Telvoice autorizada. Puedes cotizar bolsas SMS o dejar tus datos para que te contactemos.";

export const LOW_CONFIDENCE_FALLBACK =
  "No tengo una respuesta exacta todavía, pero puedo ayudarte con saldo, campañas, DLR, precios, compras, reportes o uso del panel.";
