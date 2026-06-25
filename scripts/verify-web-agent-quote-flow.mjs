#!/usr/bin/env node
/**
 * Valida copy y CTAs del flujo de cotización del agente web (landing).
 * node scripts/verify-web-agent-quote-flow.mjs
 */
import { classifyWebAgentIntent } from "../lib/web-agent/webAgentIntentService.js";
import {
  calculateQuote,
  formatPricesCatalogMessage,
  formatQuoteForChat,
} from "../lib/web-agent/telvoiceQuoteService.js";
import { buildCtas } from "../lib/web-agent/conversation.js";

const FORBIDDEN = [
  "¿Quieres registrarte para comprar o dejar tus datos para que Telvoice te contacte?",
  "Tramo aplicado:",
  "Puedes cotizar cualquier volumen en múltiplos de 1.000 SMS",
  "múltiplos de 1.000 SMS (si pides otro número",
];

function assertNoForbidden(text, label) {
  for (const phrase of FORBIDDEN) {
    if (text.includes(phrase)) {
      throw new Error(`${label}: contiene texto prohibido: "${phrase}"`);
    }
  }
}

function assertIncludes(text, phrase, label) {
  if (!text.includes(phrase)) {
    throw new Error(`${label}: falta "${phrase}"`);
  }
}

let failed = 0;

function runCase(name, fn) {
  try {
    fn();
    console.log(`OK: ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  ${err.message}`);
  }
}

runCase("Caso A — precios sms", () => {
  const classified = classifyWebAgentIntent("precios sms");
  if (classified.intent !== "prices") {
    throw new Error(`intent esperado prices, got ${classified.intent}`);
  }
  const reply = formatPricesCatalogMessage();
  assertNoForbidden(reply, "precios");
  assertIncludes(
    reply,
    "Indica cuántos SMS necesitas y te preparo la cotización con botón Ir a pagar.",
    "precios",
  );
  if (!reply.includes("• Desde")) {
    throw new Error("precios: falta lista de tramos");
  }
});

runCase("Caso B — 20000", () => {
  const classified = classifyWebAgentIntent("20000");
  const qty = classified.quantity ?? 20000;
  const quote = calculateQuote(qty);
  const reply = formatQuoteForChat(quote);
  const ctas = buildCtas(quote);

  assertNoForbidden(reply, "20000");
  assertIncludes(reply, "Cantidad solicitada:", "20000");
  assertIncludes(reply, "Total IVA incluido:", "20000");
  assertIncludes(reply, "MercadoPago", "20000");

  const pay = ctas.find((c) => c.label === "Ir a pagar");
  if (!pay || pay.type !== "pay") {
    throw new Error("20000: falta CTA Ir a pagar");
  }
  if (pay.calc_sms !== quote.quoted_quantity) {
    throw new Error("20000: calc_sms no coincide con quoted_quantity");
  }
});

runCase("Caso C — 12500", () => {
  const quote = calculateQuote(12500);
  const reply = formatQuoteForChat(quote);
  const ctas = buildCtas(quote);

  assertNoForbidden(reply, "12500");
  assertIncludes(reply, "Te cotizo 13.000 SMS para Chile.", "12500");
  assertIncludes(reply, "Cantidad solicitada: 13.000 SMS", "12500");

  const pay = ctas.find((c) => c.label === "Ir a pagar");
  if (!pay) {
    throw new Error("12500: falta CTA Ir a pagar");
  }
});

if (failed) {
  process.exit(1);
}
console.log("\nFlujo de cotización OK (3 casos).");
