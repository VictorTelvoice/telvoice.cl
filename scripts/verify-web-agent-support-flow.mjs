#!/usr/bin/env node
/**
 * Valida detección y pasos del flujo de soporte del agente web.
 * node scripts/verify-web-agent-support-flow.mjs
 */
import {
  isSupportRequest,
  parseSupportStepInput,
  nextSupportStep,
  getSupportStepPrompt,
} from "../lib/web-agent/supportFlow.js";
import { isLandingFaqQuestion } from "../lib/web-agent/faq.js";

const cases = [
  { text: "soporte", support: true, faq: false },
  { text: "necesito soporte", support: true, faq: false },
  { text: "tengo un problema con el envio", support: true, faq: false },
  { text: "ayuda tecnica", support: true, faq: false },
  { text: "tienen soporte tecnico en chile", support: false, faq: true },
  { text: "que operadores moviles incluye", support: false, faq: true },
];

let failed = 0;

for (const c of cases) {
  const support = isSupportRequest(c.text);
  const faq = isLandingFaqQuestion(c.text);
  if (support !== c.support || faq !== c.faq) {
    failed++;
    console.error("FAIL:", c.text);
    console.error("  support expected", c.support, "got", support);
    console.error("  faq expected", c.faq, "got", faq);
  } else {
    console.log("OK:", c.text);
  }
}

let data = { support_flow: true };
const steps = ["support_name", "support_email", "support_issue"];
const values = ["María López", "maria@empresa.cl", "No puedo enviar SMS desde el panel"];

for (let i = 0; i < steps.length; i++) {
  const parsed = parseSupportStepInput(steps[i], values[i], data);
  if (!parsed.ok) {
    failed++;
    console.error("FAIL parse", steps[i], parsed.error);
    continue;
  }
  data = parsed.leadData;
  const next = nextSupportStep(steps[i]);
  const expectedNext = i < steps.length - 1 ? steps[i + 1] : null;
  if (next !== expectedNext) {
    failed++;
    console.error("FAIL next step", steps[i], "expected", expectedNext, "got", next);
  }
}

if (!data.name || !data.email || !data.issue) {
  failed++;
  console.error("FAIL: datos finales incompletos", data);
} else {
  console.log("OK: captura nombre, email y problema");
}

const prompt = getSupportStepPrompt("support_email");
if (!prompt || !prompt.includes("correo")) {
  failed++;
  console.error("FAIL: prompt email");
} else {
  console.log("OK: prompts de soporte");
}

if (failed) {
  process.exit(1);
}
console.log("\nFlujo de soporte OK.");
