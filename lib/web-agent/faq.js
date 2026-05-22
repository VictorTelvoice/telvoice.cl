import { LANDING_FAQ } from "../landing-faq-data.js";
import { normalizeIntentText } from "./intent.js";

const FALLBACK =
  "Telvoice.cl ayuda a empresas en Chile con SMS masivos: bolsas prepago, panel, API y soporte local. " +
  "Puedo cotizar una bolsa, mostrarte precios por volumen o conectarte con un asesor. ¿Qué necesitas?";

function tokenize(text) {
  return normalizeIntentText(text)
    .replace(/[?¿!.,;:]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreFaqMatch(userNorm, item) {
  let score = 0;
  const keys = [
    ...(item.keys || []),
    normalizeIntentText(item.question).replace(/[?¿]/g, "").trim(),
  ];

  for (const key of keys) {
    const k = normalizeIntentText(key);
    if (!k) continue;
    if (userNorm.includes(k)) {
      score += Math.min(12, 4 + k.split(/\s+/).length);
    }
  }

  const userTokens = tokenize(userNorm);
  const qTokens = tokenize(item.question);
  for (const qt of qTokens) {
    if (userTokens.includes(qt)) {
      score += 2;
    }
  }

  if (userNorm.includes("?") && qTokens.some((t) => userTokens.includes(t))) {
    score += 3;
  }

  return score;
}

export function matchLandingFaq(text) {
  const n = normalizeIntentText(text);
  if (!n || n.length < 4) {
    return null;
  }

  let best = null;
  let bestScore = 0;

  for (const item of LANDING_FAQ) {
    const score = scoreFaqMatch(n, item);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= 4 ? best : null;
}

export function answerFaq(text) {
  const matched = matchLandingFaq(text);
  if (matched) {
    return matched.answer;
  }
  return FALLBACK;
}

export function isLandingFaqQuestion(text) {
  return matchLandingFaq(text) !== null;
}
