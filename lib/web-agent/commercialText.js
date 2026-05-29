/** Normalización comercial: mensajes → SMS (landing telvoice.cl). */

export function normalizeIntentText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCommercialText(text) {
  let n = normalizeIntentText(text);
  const replacements = [
    [/\benviar mensajes masivos\b/g, "enviar sms masivos"],
    [/\bmensajes masivos\b/g, "sms masivos"],
    [/\bcomprar mas mensajes\b/g, "comprar mas sms"],
    [/\bcomprar mensajes\b/g, "comprar sms"],
    [/\bnecesito mensajes\b/g, "necesito sms"],
    [/\bquiero mensajes\b/g, "quiero sms"],
    [/\bmas mensajes\b/g, "mas sms"],
    [/\bmensajes\b/g, "sms"],
    [/\bmensaje\b/g, "sms"],
    [/\bpaquetes\b/g, "bolsas sms"],
    [/\bpaquete\b/g, "bolsa sms"],
    [/\bcargar saldo\b/g, "comprar sms"],
    [/\brecargar\b/g, "comprar"],
    [/\bcreditos\b/g, "saldo"],
    [/\bcredito\b/g, "saldo"],
  ];
  for (const [re, rep] of replacements) {
    n = n.replace(re, rep);
  }
  return n.replace(/\s+/g, " ").trim();
}

export function extractQuantityFromCommercialText(text) {
  const normalized = normalizeCommercialText(text);
  const patterns = [
    /cotizar\s+(\d[\d\s]*)\s*sms?/i,
    /comprar\s+(\d[\d\s]*)\s*sms?/i,
    /quiero\s+comprar\s+(\d[\d\s]*)\s*sms?/i,
    /quiero\s+(\d[\d\s]*)\s*sms?/i,
    /necesito\s+(\d[\d\s]*)\s*sms?/i,
    /cuanto\s+cuesta\s+(\d[\d\s]*)\s*sms?/i,
    /(\d[\d\s]*)\s*sms?/i,
    /(\d[\d\s]*)\s*mensajes?/i,
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
