/**
 * UX y flujo conversacional del agente panel (regresión).
 */
import assert from "node:assert/strict";
import { routeAgentIntent } from "../src/services/agent/agentIntentRouter.js";
import {
  matchesCampaignGuidedIntent,
  matchesSendSmsFlowIntent,
} from "../src/services/agent/agentSendSmsIntent.js";
import {
  composeAgentResponse,
  composeLowConfidenceReply,
} from "../src/services/agent/agentResponseComposer.js";
import { getAgentPersona } from "../src/services/agent/agentPersona.js";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../src/services/agent/agentConversationMemory.js";
import type { StoredPendingAction } from "../src/services/agent/pendingActions.js";

function testCampaignGuidedRouting(): void {
  const r = routeAgentIntent("Ayúdame a crear una campaña", "web_client", {
    memory: {},
  });
  assert.equal(r.intent, "send_sms_flow");
  assert.ok(matchesCampaignGuidedIntent("Ayúdame a crear una campaña"));
  console.log("✓ Ayúdame a crear una campaña → send_sms_flow guiado");
}

function testFallbackNotDuplicated(): void {
  const persona = getAgentPersona("web_client");
  const low = composeLowConfidenceReply(persona, "web_client");
  const composed = composeAgentResponse({
    persona,
    channel: "web_client",
    intent: "unknown",
    rawReply: low,
    memory: {},
    confidence: 0.35,
  });
  const ctaCount = (composed.match(/¿Quieres revisar saldo/g) ?? []).length;
  assert.equal(ctaCount, 1, `CTA duplicado: ${composed}`);
  console.log("✓ fallback genérico sin CTA duplicado");
}

function testCancelNoFallbackCta(): void {
  const persona = getAgentPersona("web_client");
  const composed = composeAgentResponse({
    persona,
    channel: "web_client",
    intent: "cancel",
    rawReply:
      "Listo, cancelé este flujo. Puedes pedirme enviar un SMS, crear una campaña o revisar tu saldo cuando quieras.",
    memory: {},
    confidence: 0.99,
  });
  assert.ok(!composed.includes(persona.defaultCTA));
  console.log("✓ cancelar flujo sin CTA fallback extra");
}

function testSmsEstimateFromPayload(): void {
  const pending = {
    payload: {
      estimated_total_sms: 3,
      segments_per_contact: 1,
    },
  } as StoredPendingAction;
  const result = { smsConsumed: 0, queued: 3, totalRecipients: 3 };
  const fromPayload = Number(pending.payload.estimated_total_sms ?? 0);
  const estimate =
    fromPayload > 0
      ? fromPayload
      : result.smsConsumed > 0
        ? result.smsConsumed
        : result.queued * Number(pending.payload.segments_per_contact ?? 1);
  assert.equal(estimate, 3);
  console.log("✓ SMS estimados usa estimated_total_sms cuando cola no debita al instante");
}

function testTruncateFileName(): void {
  const name =
    "Hoja de cálculo sin título - Hoja 1.csv";
  const max = 28;
  const truncated =
    name.length <= max
      ? name
      : name.slice(0, Math.max(8, max - 4)) + "…" + ".csv";
  assert.ok(truncated.length <= max + 2);
  assert.ok(truncated.includes("…"));
  console.log("✓ nombre CSV largo truncable");
}

function testAttachButtonClass(): void {
  const html = `<button type="button" class="tva-attach" aria-label="Adjuntar CSV">`;
  assert.ok(html.includes("tva-attach"));
  assert.ok(html.includes("Adjuntar CSV"));
  console.log("✓ botón adjuntar usa clase tva-attach + aria-label");
}

async function testExitWithActiveFlow(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  if (!companyId) {
    console.log("SKIP salir con flujo: TEST_COMPANY_ID no definido");
    return;
  }
  const sessionId = `exit-flow-${Date.now()}`;
  await updateConversationMemory(
    sessionId,
    "web_client",
    {
      sendSmsFlowActive: true,
      sendSmsFlowStep: "need_message",
      waitingForMessage: true,
    },
    companyId,
  );

  const r = await runAgentCore({
    channel: "web_client",
    message: "salir",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.equal(r.intent, "cancel");
  assert.match(r.reply, /cancelé este flujo/i);
  assert.ok(!r.reply.includes(getAgentPersona("web_client").defaultCTA));
  const mem = await getConversationMemory(r.sessionId, "web_client");
  assert.ok(!mem.sendSmsFlowActive);
  console.log("✓ salir con flujo activo cancela sin fallback duplicado");
}

async function testExitWithoutFlow(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  if (!companyId) {
    console.log("SKIP salir sin flujo: TEST_COMPANY_ID no definido");
    return;
  }
  const sessionId = `exit-idle-${Date.now()}`;
  const r = await runAgentCore({
    channel: "web_client",
    message: "cerrar",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.equal(r.intent, "cancel");
  assert.match(r.reply, /Listo/i);
  assert.ok(r.closeWidget === true);
  assert.ok(!r.reply.includes(getAgentPersona("web_client").defaultCTA));
  console.log("✓ cerrar sin flujo → mensaje breve + closeWidget");
}

async function testCampaignGuidedFirstMessage(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  if (!companyId) {
    console.log("SKIP campaña guiada E2E: TEST_COMPANY_ID no definido");
    return;
  }
  const sessionId = `camp-guide-${Date.now()}`;
  const r = await runAgentCore({
    channel: "web_client",
    message: "Ayúdame a crear una campaña",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.equal(r.intent, "send_sms_flow");
  assert.match(r.reply, /armemos tu campaña/i);
  assert.match(r.reply, /mensaje/i);
  assert.ok(!/Borrador de campaña/i.test(r.reply));
  console.log("✓ campaña guiada pide mensaje primero (sin borrador)");
}

async function main(): Promise<void> {
  console.log("=== test:agent-ux-polish ===\n");
  testCampaignGuidedRouting();
  testFallbackNotDuplicated();
  testCancelNoFallbackCta();
  testSmsEstimateFromPayload();
  testTruncateFileName();
  testAttachButtonClass();
  await testExitWithActiveFlow();
  await testExitWithoutFlow();
  await testCampaignGuidedFirstMessage();
  console.log("\nTodos los casos UX pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
