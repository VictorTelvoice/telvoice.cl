#!/usr/bin/env node
/**
 * Casos de intención landing (saludo + comercial).
 * node scripts/verify-web-agent-intent.mjs
 */
import { classifyWebAgentIntent } from "../lib/web-agent/webAgentIntentService.js";
import { hasCommercialIntent } from "../lib/web-agent/commercialText.js";
import { calculateQuote } from "../lib/web-agent/telvoiceQuoteService.js";

const cases = [
  { text: "hola quiero comprar mensajes", intent: "purchase", commercial: true },
  { text: "hola, quiero comprar mensajes", intent: "purchase", commercial: true },
  { text: "hola quiero comprar 30000 mensajes", intent: "quote", commercial: true, qty: 30000 },
  { text: "buenas necesito mensajes", intent: "purchase", commercial: true },
  { text: "hola cuánto cuesta 70000 sms", intent: "quote", commercial: true, qty: 70000 },
  { text: "hola", intent: "greeting", commercial: false },
  { text: "buenas", intent: "greeting", commercial: false },
  { text: "hola, qué tal", intent: "greeting", commercial: false },
  { text: "portal", intent: "portal", commercial: false },
  { text: "ir al portal", intent: "portal", commercial: false },
];

let failed = 0;
for (const c of cases) {
  const classified = classifyWebAgentIntent(c.text);
  const commercial = hasCommercialIntent(c.text);
  const okIntent = classified.intent === c.intent;
  const okCommercial = commercial === c.commercial;
  const okQty =
    c.qty == null || classified.quantity === c.qty;
  if (!okIntent || !okCommercial || !okQty) {
    failed++;
    console.error("FAIL:", c.text);
    console.error("  expected intent", c.intent, "got", classified.intent);
    console.error("  expected commercial", c.commercial, "got", commercial);
    if (c.qty != null) {
      console.error("  expected qty", c.qty, "got", classified.quantity);
    }
  } else {
    console.log("OK:", c.text, "→", classified.intent);
  }
}

const q30 = calculateQuote(30000);
const q70 = calculateQuote(70000);
if (q30.total_with_iva !== 249900 || q70.total_with_iva !== 499800) {
  failed++;
  console.error("FAIL: quote totals", q30.total_with_iva, q70.total_with_iva);
} else {
  console.log("OK: quote 30k →", q30.total_with_iva, "70k →", q70.total_with_iva);
}

if (failed) {
  process.exit(1);
}
console.log("\nTodos los casos OK.");
