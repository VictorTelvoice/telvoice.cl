import { matchesCapabilitiesIntent } from "../telegramCapabilities.js";
import {
  detectCommercialIntent,
  isExplicitKnowledgeQuestion,
  normalizeIntentText,
} from "../telegramIntentService.js";
import { extractSmsQuantityFromText } from "../commercialQuoteService.js";
import type { AgentChannel, AgentIntent } from "./types.js";

export function classifyAgentIntent(
  message: string,
  channel: AgentChannel,
): AgentIntent {
  const normalized = normalizeIntentText(message);

  if (/^(confirmo|si confirmo|sí confirmo|confirmar|ok confirmo)\b/.test(normalized)) {
    return "confirm";
  }
  if (/^(cancelar|cancelo|no confirmo|anular)\b/.test(normalized)) {
    return "cancel";
  }

  if (matchesCapabilitiesIntent(normalized)) {
    return "capabilities";
  }

  if (
    isExplicitKnowledgeQuestion(normalized) ||
    /\b(dlr|submitted|delivered|failed|whitelist|sender id|tipo p|tipo t|encoding|segmento)\b/.test(
      normalized,
    )
  ) {
    return "knowledge";
  }

  if (channel === "landing" || channel === "admin") {
    const commercial = detectCommercialIntent(message);
    if (commercial) {
      return "commercial";
    }
  }

  if (
    /\b(saldo|balance|cuanto tengo|cuánto tengo|sms disponibles|creditos|créditos)\b/.test(
      normalized,
    )
  ) {
    return "balance";
  }

  if (
    /\b(ultimos envios|últimos envíos|ultimos sms|últimos sms|historial|bandeja)\b/.test(
      normalized,
    )
  ) {
    return "recent_messages";
  }

  if (
    /\b(ultimas campanas|últimas campañas|mis campanas|mis campañas|campaña reciente)\b/.test(
      normalized,
    )
  ) {
    return "recent_campaigns";
  }

  if (
    /\b(cotizar|comprar|quiero)\b/.test(normalized) &&
    (extractSmsQuantityFromText(message) !== null ||
      /\bsms\b/.test(normalized))
  ) {
    return "quote_purchase";
  }

  if (/\b(dlr|entregado|submitted|failed|fallido|estado del sms)\b/.test(normalized)) {
    return "dlr_help";
  }

  if (
    /\b(segmento|segmentos|cuantos sms consume|cuántos sms consume|caracteres)\b/.test(
      normalized,
    )
  ) {
    return "segments";
  }

  if (
    /\b(optimiza|optimizar|mejora|mejorar|copy|mensaje mas corto|reducir segmentos)\b/.test(
      normalized,
    )
  ) {
    return "copy_help";
  }

  if (
    /\b(costo|costar|cuanto cuesta enviar|cuánto cuesta enviar)\b/.test(normalized) &&
    /\b(lista|contactos|campaña|campaña)\b/.test(normalized)
  ) {
    return "campaign_cost";
  }

  if (
    /\b(lista|contactos en|cuantos contactos|cuántos contactos)\b/.test(normalized)
  ) {
    return "contact_list";
  }

  if (
    /\b(crear campana|crear campaña|nueva campana|nueva campaña|borrador)\b/.test(
      normalized,
    )
  ) {
    return "campaign_draft";
  }

  if (
    /\b(enviar campana|enviar campaña|lanzar campana|lanzar campaña)\b/.test(
      normalized,
    )
  ) {
    return "launch_campaign";
  }

  if (
    /\b(enviar sms|enviar mensaje|mandar sms|mandar mensaje)\b/.test(normalized)
  ) {
    return "send_sms";
  }

  if (/^(hola|buenas|buenos dias|buenas tardes|hey)\b/.test(normalized)) {
    return "greeting";
  }

  const commercial = detectCommercialIntent(message);
  if (commercial && channel === "web_client") {
    return "quote_purchase";
  }

  return "unknown";
}
