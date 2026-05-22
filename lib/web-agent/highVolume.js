export function matchesHighVolumeIntent(normalized) {
  if (!normalized) return false;

  if (
    /\b(alto volumen|cotiza alto volumen|cotizar alto volumen|volumen alto|bolsa grande|gran volumen)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(mas de|más de|superior a|mayor a|encima de|sobre|mas de 120|más de 120)\b/.test(
      normalized,
    ) &&
    /\b(120000|120 000|100000|100 000|sms|cotizar|cotiza|bolsa)\b/.test(normalized)
  ) {
    return true;
  }

  return (
    /\b(cotizar|cotiza)\b/.test(normalized) &&
    /\b(alto|empresa|empresarial|personalizada)\b/.test(normalized)
  );
}

export function isHighVolumeQualifierOnly(normalized, quantity) {
  if (quantity === null) return true;
  return /\b(mas de|más de|superior|mayor|encima|sobre)\b/.test(normalized);
}

export const HIGH_VOLUME_AGENT_MESSAGE = `Perfecto, te ayudo con una cotización de alto volumen para Chile.

Las bolsas se cotizan en múltiplos de 1.000 SMS. En el sitio puedes comprar online hasta 120.000 SMS; por encima de eso también puedo cotizarte aquí (desde $5 + IVA por SMS según volumen).

¿Cuántos SMS necesitas aproximadamente? Puedes escribir solo el número, por ejemplo:
250000

O escribir: cotizar 250000 sms`;
