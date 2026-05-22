export function matchesCapabilitiesIntent(normalized: string): boolean {
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

export function buildTelegramCapabilitiesMessage(
  authorized: boolean,
): string {
  const commercial = `Comercial (disponible para todos):
• Planes, precios y bolsas SMS para Chile
• Cotizar bolsas y pagar con botones (MercadoPago, telvoice.cl o datos en el chat)
• Preguntas sobre bolsa SMS, operadores, factura, API, activación, etc. (base de conocimiento Telvoice)`;

  const operational = authorized
    ? `Operación (tu usuario está autorizado):
• /saldo — balance y saldo aSMSC
• /historial — últimos envíos
• /enviar 569XXXXXXXX mensaje — envío con confirmación
• /buscar tema — temas técnicos (DLR, submitted, delivered, failed…)`
    : `Operación (requiere autorización de tu empresa):
• Consultar saldo, historial y enviar SMS
• Soporte técnico de envíos (DLR, estados, API)
Pide al administrador Telvoice que autorice tu Telegram si necesitas operar.`;

  return `Soy el asesor Telvoice en Telegram. Esto es lo que puedo hacer por ti:

${commercial}

${operational}

Comandos útiles: /planes · /precios · /bolsas · cotizar 30000 sms · /ayuda`;
}
