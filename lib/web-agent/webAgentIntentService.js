import { extractQuantityFromText } from "./telvoiceQuoteService.js";
import { isLandingFaqQuestion } from "./faq.js";

export function normalizeIntentText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMMERCIAL_HINT =
  /\b(comprar|bolsa|bolsas|cotizar|precios|planes|sms|mercadopago|chile|empresa|ecommerce|retail|otp|campaña|campana|mas sms|necesito sms)\b/;

export function classifyWebAgentIntent(text) {
  const normalized = normalizeIntentText(text);
  const quantity = extractQuantityFromText(text);

  if (!normalized) {
    return { intent: "fallback", quantity };
  }

  if (
    /^(hola|buenos dias|buenas tardes|buenas noches|hey)\b/.test(normalized) ||
    (/\bhola\b/.test(normalized) && !COMMERCIAL_HINT.test(normalized))
  ) {
    return { intent: "greeting", quantity };
  }

  if (/\b(registr|crear cuenta|abrir cuenta|portal cliente)\b/.test(normalized)) {
    return { intent: "register", quantity };
  }

  if (/\b(pagar|pago|mercadopago|link de pago|checkout)\b/.test(normalized)) {
    return { intent: "payment", quantity };
  }

  if (/\b(asesor|ejecutivo|humano|contactar|ventas)\b/.test(normalized)) {
    return { intent: "advisor", quantity };
  }

  if (isLandingFaqQuestion(text)) {
    return { intent: "faq", quantity };
  }

  if (quantity !== null || /\b(cotizar|cotiza|cuanto cuesta)\b/.test(normalized)) {
    return { intent: "quote", quantity };
  }

  if (
    /\b(quiero comprar|comprar sms|comprar bolsa|necesito sms|necesito enviar|mas sms)\b/.test(
      normalized,
    )
  ) {
    return { intent: "purchase", quantity };
  }

  if (/\b(precios|planes|tarifas|ver precios)\b/.test(normalized)) {
    return { intent: "prices", quantity };
  }

  if (
    /\b(como funciona|que es telvoice|ayuda|faq|otp|api|operadores|factura|despues de comprar|activar|bolsa sms)\b/.test(
      normalized,
    ) ||
    /\b(que es|como se|sirve para)\b/.test(normalized)
  ) {
    return { intent: "faq", quantity };
  }

  if (COMMERCIAL_HINT.test(normalized)) {
    return { intent: "purchase", quantity };
  }

  return { intent: "fallback", quantity };
}

export function isCommercialPriorityIntent(intent) {
  return [
    "purchase",
    "quote",
    "prices",
    "payment",
    "register",
  ].includes(intent);
}
