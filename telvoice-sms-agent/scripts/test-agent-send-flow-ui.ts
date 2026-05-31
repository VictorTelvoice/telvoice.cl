/**
 * Visibilidad del botón CSV y prioridad del flujo sobre knowledge.
 */
import assert from "node:assert/strict";
import {
  SEND_SMS_FLOW_STEP,
  shouldForceSendSmsFlow,
  shouldShowCsvAttachButton,
  shouldSkipKnowledgeForSendFlow,
} from "../src/services/agent/agentSendSmsFlowUi.js";
import { composeAgentResponse, composeLowConfidenceReply } from "../src/services/agent/agentResponseComposer.js";
import { getAgentPersona } from "../src/services/agent/agentPersona.js";
import { routeAgentIntent } from "../src/services/agent/agentIntentRouter.js";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../src/services/agent/agentConversationMemory.js";

function testAttachVisibility(): void {
  assert.equal(
    shouldShowCsvAttachButton({
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_MESSAGE,
    }),
    false,
  );
  assert.equal(
    shouldShowCsvAttachButton({
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV,
    }),
    true,
  );
  assert.equal(
    shouldShowCsvAttachButton({
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.REVIEW_SINGLE_SMS,
    }),
    false,
  );
  assert.equal(
    shouldShowCsvAttachButton({
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
    }),
    true,
  );
  console.log("✓ visibilidad botón adjuntar por paso");
}

function testForceFlowOverKnowledge(): void {
  const mem = {
    waitingForMessage: true,
    sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_MESSAGE,
  };
  assert.equal(shouldForceSendSmsFlow(mem), true);
  assert.equal(shouldSkipKnowledgeForSendFlow(mem), true);

  const r = routeAgentIntent("Tu información ya fue recibida gracias", "web_client", {
    memory: mem,
  });
  assert.notEqual(r.intent, "knowledge");
  console.log("✓ waitingForMessage no enruta a knowledge por router");
}

function testKnowledgeNotDuplicated(): void {
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
  assert.equal((composed.match(/¿Quieres revisar saldo/g) ?? []).length, 1);
  console.log("✓ fallback sin CTA duplicado");
}

async function testFlowCase1And2(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  if (!companyId) {
    console.log("SKIP flujo E2E attach: TEST_COMPANY_ID no definido");
    return;
  }
  const sessionId = crypto.randomUUID();

  const r1 = await runAgentCore({
    channel: "web_client",
    message: "Ayúdame a crear una campaña",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.equal(r1.intent, "send_sms_flow");
  assert.equal(r1.showAttachButton, false);
  assert.match(r1.reply, /mensaje/i);

  const r2 = await runAgentCore({
    channel: "web_client",
    message: "Tu información ya fue recibida gracias",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.equal(r2.intent, "send_sms_flow");
  assert.equal(r2.showAttachButton, true);
  assert.match(r2.reply, /ya tengo el mensaje/i);
  assert.notEqual(r2.intent, "knowledge");
  console.log("✓ caso 1 y 2: attach oculto luego visible, sin knowledge");
}

async function testSalirClearsAttach(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  if (!companyId) {
    console.log("SKIP salir attach: TEST_COMPANY_ID no definido");
    return;
  }
  const sessionId = crypto.randomUUID();
  await updateConversationMemory(
    sessionId,
    "web_client",
    {
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV,
      waitingForRecipient: true,
      waitingForCsv: true,
      pendingSmsMessage: "Hola test",
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
  assert.equal(r.showAttachButton, false);
  assert.equal(r.clearCsvUpload, true);
  const mem = await getConversationMemory(sessionId, "web_client");
  assert.ok(!mem.sendSmsFlowStep);
  console.log("✓ salir oculta adjuntar y limpia flujo");
}

async function main(): Promise<void> {
  console.log("=== test:agent-send-flow-ui ===\n");
  testAttachVisibility();
  testForceFlowOverKnowledge();
  testKnowledgeNotDuplicated();
  await testFlowCase1And2();
  await testSalirClearsAttach();
  console.log("\nTodos los casos pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
