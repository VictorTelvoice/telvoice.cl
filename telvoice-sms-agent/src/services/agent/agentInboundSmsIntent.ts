/**
 * Desambiguación mínima: SMS entrantes / recibidos vs bandeja saliente y campañas outbound.
 * Solo knowledge — no ejecuta tools ni lee inbound_sms_messages.
 */
export function matchesInboundSmsKnowledgeIntent(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  // Consultas claramente salientes: no desviar a inbound knowledge.
  if (
    /\b(ultimos envios|ultimos sms enviados|sms enviados|bandeja de envios|resumen de campanas|como van mis campanas|estado de mis campanas|ver dlr de mis envios|dlr de mis envios)\b/.test(
      normalized,
    ) &&
    !/\b(recibidos|entrantes|respuestas|responden|me responden)\b/.test(normalized)
  ) {
    return false;
  }

  if (
    /\b(sms entrantes|sms recibidos|mensajes recibidos|bandeja entrante|bandeja sms entrantes|app sms inbox)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(recibir sms|me responden|respuestas sms|webhook inbound|recibir sms por api|leer sms entrantes|mostrar sms recibidos|integrar sms recibidos|mensajes recibidos webhook)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(ultimos sms recibidos|ultimos mensajes recibidos|mostrar ultimos sms recibidos)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(respuestas de campanas|respuestas a mis campanas|respuestas de mis campanas|clientes responden|campana con respuesta|campanas con sms entrantes|recibir respuestas de mis campanas|recibir respuestas campana)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(bandeja)\b/.test(normalized) &&
    /\b(entrantes|sms entrantes|recibidos|mismo que|no es lo mismo|diferencia)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(recibido)\b/.test(normalized) &&
    /\b(entregado|enviado|dlr|diferencia)\b/.test(normalized)
  ) {
    return true;
  }

  if (/\b(responder este sms|responder sms recibido|puedes responder este sms)\b/.test(normalized)) {
    return true;
  }

  if (
    /\b(conectar|integrar)\b/.test(normalized) &&
    /\b(sms entrantes|webhook|inbound|recibidos)\b/.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(donde veo|donde reviso)\b/.test(normalized) &&
    /\b(responden|recibidos|recib)\b/.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(agente|asistente)\b/.test(normalized) &&
    /\b(ultimos sms recibidos|sms recibidos|sms entrantes|leer|mostrar).*\b(recibid|entrantes)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(puedo tener varios numeros|varios numeros para recibir|recibir sms en varios numeros|varias numeraciones para recibir|multiples numeros para recibir)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (/\b(simulacion|simular)\b/.test(normalized) && /\b(reales|real)\b/.test(normalized)) {
    return true;
  }

  if (/\b(sim real)\b/.test(normalized) && /\b(recibir|recib)\b/.test(normalized)) {
    return true;
  }

  return false;
}
