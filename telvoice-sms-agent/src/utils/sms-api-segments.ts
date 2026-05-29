/**
 * Regla simple documentada para Fase 3 sandbox API.
 * 1 segmento ≤160 chars; 2 segmentos 161–306; luego 153 chars/segmento.
 */
export function calculateSimpleApiSmsSegments(message: string): number {
  const len = message.length;
  if (len === 0) {
    return 0;
  }
  if (len <= 160) {
    return 1;
  }
  if (len <= 306) {
    return 2;
  }
  return Math.ceil(len / 153);
}
