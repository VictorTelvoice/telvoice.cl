function baseNormalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mensaje estándar cuando hay intención de compra sin cantidad. */
export const AGENT_COMMERCIAL_ASK_QUANTITY_MESSAGE = `Perfecto, te ayudo a comprar una bolsa de SMS para Chile.

Telvoice.cl vende bolsas en múltiplos de 1.000 SMS y el precio baja según volumen.

¿Cuántos SMS quieres comprar?
Por ejemplo: 5.000, 15.000, 30.000, 50.000 o 100.000 SMS.`;

const COMMERCIAL_TOKEN_HINTS =
  /\b(comprar|necesito|quiero|cotizar|cotiza|cuesta|precio|bolsa|paquete|sms|saldo|recargar|recarga|mensaje|mensajes|campana|campaña|masivos)\b/;

/**
 * Normaliza lenguaje comercial chileno: mensajes → sms, bolsa/paquete, recargar, etc.
 */
export function normalizeCommercialText(text: string): string {
  let n = baseNormalize(text);

  const replacements: [RegExp, string][] = [
    [/\benviar mensajes masivos\b/g, "enviar sms masivos"],
    [/\bmensajes masivos\b/g, "sms masivos"],
    [/\bcomprar mas mensajes\b/g, "comprar mas sms"],
    [/\bcomprar mensajes\b/g, "comprar sms"],
    [/\bcomprar mas sms\b/g, "comprar mas sms"],
    [/\bnecesito mensajes\b/g, "necesito sms"],
    [/\bquiero mensajes\b/g, "quiero sms"],
    [/\bmas mensajes\b/g, "mas sms"],
    [/\bmensajes\b/g, "sms"],
    [/\bmensaje\b/g, "sms"],
    [/\bpaquetes sms\b/g, "bolsas sms"],
    [/\bpaquete sms\b/g, "bolsa sms"],
    [/\bpaquetes\b/g, "bolsas sms"],
    [/\bpaquete\b/g, "bolsa sms"],
    [/\bcargar saldo\b/g, "comprar sms"],
    [/\bagregar saldo\b/g, "comprar sms"],
    [/\brecargar mensajes\b/g, "comprar sms"],
    [/\brecargar sms\b/g, "comprar sms"],
    [/\brecargar\b/g, "comprar"],
    [/\bcreditos\b/g, "saldo"],
    [/\bcredito\b/g, "saldo"],
    [/\benviar campanas\b/g, "enviar campanas sms"],
    [/\benviar campaña\b/g, "enviar campana sms"],
    [/\bquiero campanas\b/g, "quiero campanas sms"],
    [/\bquiero campaña\b/g, "quiero campana sms"],
  ];

  for (const [re, rep] of replacements) {
    n = n.replace(re, rep);
  }

  return n.replace(/\s+/g, " ").trim();
}

export function extractCommercialQuantity(text: string): number | null {
  const normalized = normalizeCommercialText(text);

  const patterns = [
    /cotizar\s+(\d[\d\s]*)\s*sms?/i,
    /cotiza\s+(\d[\d\s]*)\s*sms?/i,
    /quiero\s+comprar\s+(\d[\d\s]*)\s*sms?/i,
    /comprar\s+(\d[\d\s]*)\s*sms?/i,
    /quiero\s+(\d[\d\s]*)\s*sms?/i,
    /necesito\s+(\d[\d\s]*)\s*sms?/i,
    /cuanto\s+cuesta\s+(\d[\d\s]*)\s*sms?/i,
    /(\d[\d\s]*)\s*sms?/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match?.[1]) {
      const qty = parseInt(match[1].replace(/\s/g, ""), 10);
      if (Number.isFinite(qty) && qty > 0) {
        return qty;
      }
    }
  }

  return null;
}

/** Indica compra/cotización aunque no matchee knowledge. */
export function isLikelyCommercialPhrase(text: string): boolean {
  const n = normalizeCommercialText(text);
  if (!n) {
    return false;
  }

  if (COMMERCIAL_TOKEN_HINTS.test(n)) {
    if (/\b(comprar|necesito|quiero|cotizar|cotiza|cuanto cuesta|cuesta|recargar|cargar saldo)\b/.test(n)) {
      return true;
    }
    if (/\b(bolsa|paquete|bolsas)\b/.test(n) && /\b(sms|saldo|comprar|necesito|quiero)\b/.test(n)) {
      return true;
    }
    if (/\b\d+[\d\s]*\s*sms\b/.test(n)) {
      return true;
    }
    if (/\bnecesito sms\b/.test(n) || /\bquiero sms\b/.test(n)) {
      return true;
    }
  }

  return false;
}

export function matchesCommercialBuyIntentNormalized(text: string): boolean {
  const normalized = normalizeCommercialText(text);
  if (!normalized) {
    return false;
  }

  if (
    normalized === "comprar" ||
    normalized === "cotizar" ||
    normalized === "precios" ||
    normalized === "planes" ||
    normalized === "bolsas" ||
    normalized === "bolsas sms"
  ) {
    return true;
  }

  const patterns = [
    /\bquiero comprar\b/,
    /\bme gustaria comprar\b/,
    /\bcomprar mas sms\b/,
    /\bcomprar sms\b/,
    /\bcomprar\b.*\bbolsa\b/,
    /\bcomprar una bolsa\b/,
    /\bnecesito comprar\b/,
    /\bnecesito mas sms\b/,
    /\bnecesito sms\b/,
    /\bnecesito una bolsa\b/,
    /\bquiero mas sms\b/,
    /\bquiero sms\b/,
    /\bquiero una bolsa\b/,
    /\bmas sms\b/,
    /\bcomprar sms\b/,
    /\bcargar saldo\b/,
    /\bcomprar sms\b/,
    /\bnecesito cotizar\b/,
    /\bquiero cotizar\b/,
    /\bcuanto cuesta\b/,
    /\bcotizar\b/,
    /\bcotiza\b/,
    /\bnecesito \d+[\d\s]* sms\b/,
    /\bquiero \d+[\d\s]* sms\b/,
    /\bcomprar \d+[\d\s]* sms\b/,
    /\bcuanto cuesta \d+[\d\s]* sms\b/,
    /\bquiero sms para\b/,
    /\bnecesito sms para\b/,
    /\benviar campanas\b/,
    /\benviar campana\b/,
    /\bquiero campanas\b/,
    /\bquiero campana\b/,
    /\bsms masivos\b/,
    /\benviar sms masivos\b/,
    /\bprecios\b/,
    /\bplanes\b/,
    /\bbolsas sms\b/,
    /\bbolsa sms\b/,
  ];

  return patterns.some((p) => p.test(normalized));
}
