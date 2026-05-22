import { LANDING_FAQ } from "../landing-faq-data.js";
import {
  LANDING_USE_CASES,
  formatAllUseCasesForChat,
} from "../landing-use-cases-data.js";
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
    normalizeIntentText(item.question || item.tagline || item.sector || "")
      .replace(/[?¿]/g, "")
      .trim(),
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

function matchFromEntries(n, entries) {
  let best = null;
  let bestScore = 0;

  for (const item of entries) {
    const score = scoreFaqMatch(n, item);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= 4 ? best : null;
}

export function matchLandingUseCase(text) {
  const n = normalizeIntentText(text);
  if (!n || n.length < 3) {
    return null;
  }

  if (
    /\b(casos de uso|caso de uso|para que sirve|que puedo enviar|tipos de mensaje|mensajeria|mensajería|a2p)\b/.test(
      n,
    ) &&
    !/\b(cotizar|comprar|precio|pagar)\b/.test(n)
  ) {
    return { overview: true };
  }

  const matched = matchFromEntries(n, LANDING_USE_CASES);
  if (matched) {
    return { item: matched };
  }

  return null;
}

export function matchLandingFaq(text) {
  const n = normalizeIntentText(text);
  if (!n || n.length < 4) {
    return null;
  }

  const useCase = matchLandingUseCase(text);
  if (useCase?.item) {
    return {
      answer: `${useCase.item.sector} — ${useCase.item.tagline}.\n\n${useCase.item.answer}`,
    };
  }

  return matchFromEntries(n, LANDING_FAQ);
}

export function answerFaq(text) {
  const useCase = matchLandingUseCase(text);
  if (useCase?.overview) {
    return formatAllUseCasesForChat();
  }

  const matched = matchLandingFaq(text);
  if (matched) {
    return matched.answer;
  }
  return FALLBACK;
}

export function isLandingFaqQuestion(text) {
  const n = normalizeIntentText(text);
  if (matchLandingUseCase(text)) {
    return true;
  }
  return matchFromEntries(n, LANDING_FAQ) !== null;
}
