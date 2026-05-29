import type { CommercialQuoteResult } from "../../types/commercial.js";
import type { AgentPersona } from "./agentPersona.js";
import type { ConversationMemory } from "./agentConversationMemory.js";
import type { AgentChannel, AgentIntent } from "./types.js";

export type ComposeInput = {
  persona: AgentPersona;
  channel: AgentChannel;
  intent: AgentIntent | string;
  rawReply: string;
  memory: ConversationMemory;
  confidence: number;
  quote?: CommercialQuoteResult | null;
  userName?: string | null;
  acknowledgment?: string;
};

function trimParagraphs(text: string, maxLines = 12): string {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= maxLines) {
    return text.trim();
  }
  return `${lines.slice(0, maxLines).join("\n")}\n\n(Si necesitas más detalle, dímelo.)`;
}

function formatQuoteSummary(quote: CommercialQuoteResult): string {
  return (
    `**${quote.quoted_quantity.toLocaleString("es-CL")} SMS** · ` +
    `${quote.tier_label} · $${quote.unit_price}+IVA/SMS\n` +
    `Total: **$${quote.total_with_iva.toLocaleString("es-CL")}** IVA incluido`
  );
}

function intentAck(intent: string, channel: AgentChannel): string | null {
  const map: Record<string, string> = {
    commercial: "Perfecto, te cotizo.",
    quote_purchase: "Perfecto, revisemos el precio.",
    balance: "Reviso tu saldo.",
    recent_messages: "Voy con tus últimos envíos.",
    dlr_help: "Te explico el estado del SMS.",
    campaign_draft: "Armamos tu campaña paso a paso.",
    copy_help: "Reviso tu mensaje para optimizarlo.",
    send_sms: "Preparo el envío con confirmación.",
    lead_capture: "Genial, avancemos con tus datos.",
    payment: "Te indico cómo pagar.",
    frustration: "Entiendo, vamos a resolverlo.",
    confusion: "",
    greeting: "",
  };
  if (intent === "greeting") {
    return null;
  }
  if (intent === "confusion") {
    return null;
  }
  if (channel === "telegram" && map[intent]) {
    return map[intent].replace(/\.$/, "");
  }
  return map[intent] ?? null;
}

export function composeAgentResponse(input: ComposeInput): string {
  const {
    persona,
    channel,
    intent,
    rawReply,
    memory,
    confidence,
    quote,
    userName,
    acknowledgment,
  } = input;

  if (!rawReply.trim() && intent === "greeting") {
    return persona.greetingReply;
  }

  if (intent === "confusion") {
    return persona.confusionReply;
  }

  if (intent === "greeting") {
    const name = userName?.trim();
    if (name && channel === "web_client") {
      return `Hola ${name}, soy el asistente operativo Telvoice. ${persona.defaultCTA}`;
    }
    return persona.greetingReply;
  }

  const parts: string[] = [];

  if (acknowledgment) {
    parts.push(acknowledgment);
  } else {
    const ack = intentAck(intent, channel);
    if (
    ack &&
    confidence >= 0.55 &&
    !rawReply.startsWith(ack) &&
    !rawReply.toLowerCase().includes(ack.toLowerCase().slice(0, 12))
  ) {
      parts.push(ack);
    }
  }

  if (quote && (intent === "commercial" || intent === "quote_purchase")) {
    parts.push(formatQuoteSummary(quote));
    if (channel === "landing") {
      parts.push(
        "¿Quieres avanzar? Puedo tomar tus datos o puedes registrarte en el portal Telvoice.",
      );
    } else if (channel === "web_client") {
      parts.push("Puedes comprar más SMS en /app/buy-sms cuando quieras.");
    }
  }

  const body = rawReply.trim();
  if (body) {
    if (channel === "telegram" && body.length > 600) {
      parts.push(trimParagraphs(body, 8));
    } else if (body.length > 1200) {
      parts.push(trimParagraphs(body, 10));
    } else {
      parts.push(body);
    }
  }

  if (confidence < 0.45 && intent !== "commercial" && intent !== "knowledge") {
    parts.push(persona.defaultCTA);
  }

  const ctx = summarizeContextLine(memory);
  if (
    intent === "follow_up" &&
    ctx &&
    !body.toLowerCase().includes(ctx.toLowerCase().slice(0, 20))
  ) {
    parts.unshift(`Sobre lo anterior (${ctx}):`);
  }

  return parts.filter(Boolean).join("\n\n");
}

function summarizeContextLine(memory: ConversationMemory): string {
  if (memory.lastQuote?.quoted_quantity) {
    return `${memory.lastQuote.quoted_quantity.toLocaleString("es-CL")} SMS cotizados`;
  }
  if (memory.lastQuantity) {
    return `${memory.lastQuantity.toLocaleString("es-CL")} SMS`;
  }
  return memory.lastTopic ?? "";
}

export function composeLowConfidenceReply(
  persona: AgentPersona,
  channel: AgentChannel,
): string {
  if (channel === "landing") {
    return (
      "No tengo una respuesta exacta todavía, pero puedo cotizar SMS, explicar precios o tomar tus datos.\n\n" +
      persona.defaultCTA
    );
  }
  return (
    "No tengo una respuesta exacta todavía, pero puedo ayudarte a revisar saldo, campañas, DLR, precios o compra de SMS.\n\n" +
    persona.defaultCTA
  );
}
