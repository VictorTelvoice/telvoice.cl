export function matchesCapabilitiesIntent(normalized) {
  if (!normalized) return false;

  if (
    /\b(que puedes hacer|que puedes hacer por mi|en que puedes ayudar|en que puedes ayudarme|en que me puedes ayudar|como puedes ayudar|como me puedes ayudar|que sabes hacer|que funciones tienes|para que sirves|que ofreces|en que me ayudas|cuales son tus funciones|tus capacidades|que haces tu|que me puedes ofrecer)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(que puede hacer|que puede hacer por mi|en que puede ayudar)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  return (
    /\b(ayuda|help)\b/.test(normalized) &&
    /\b(que|como|en que|para que)\b/.test(normalized) &&
    /\b(puedes|puede|hacer|ayudar|asistir|servir)\b/.test(normalized) &&
    !/\b(saldo|enviar|historial|dlr|failed|submitted|api key|whitelist)\b/.test(
      normalized,
    )
  );
}

export const WEB_AGENT_CAPABILITIES_MESSAGE = `Soy el agente comercial de Telvoice.cl en esta web. Puedo asistirte en:

• Cotizar bolsas SMS para Chile (volúmenes en múltiplos de 1.000)
• Mostrar precios por tramo según cantidad
• Explicar casos de uso: OTP, notificaciones, recordatorios, alertas, retail, salud, etc.
• Responder preguntas frecuentes sobre Telvoice, operadores, factura, API y activación
• Guiarte al pago online con MercadoPago
• Indicarte cómo registrarte en el portal cliente
• Orientarte para contactar a un asesor (ventas@telvoice.net)

No envío SMS ni consulto saldo desde aquí: eso corresponde al portal cliente o al bot de Telegram si tu empresa tiene acceso operativo.

¿Qué te gustaría hacer? Prueba: «Cotizar 30000 SMS», «Ver precios» o «Casos de uso».`;
