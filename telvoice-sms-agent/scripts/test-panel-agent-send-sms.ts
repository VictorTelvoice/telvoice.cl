/**
 * Pruebas de intención y flujo SMS del agente panel (web_client).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import {
  matchesSendSmsFlowIntent,
  parseSendSmsDraft,
} from "../src/services/agent/agentSendSmsIntent.js";
import { routeAgentIntent } from "../src/services/agent/agentIntentRouter.js";
import { runAgentCore } from "../src/services/agent/agentCore.js";

function testIntentMatching(): void {
  assert.equal(matchesSendSmsFlowIntent("envia un sms por mi"), true);
  assert.equal(matchesSendSmsFlowIntent("Enviar un SMS, puedes hacerlo por mí?"), true);
  assert.equal(matchesSendSmsFlowIntent("envía un sms por mí"), true);
  assert.equal(matchesSendSmsFlowIntent("quiero enviar un sms"), true);
  assert.equal(matchesSendSmsFlowIntent("necesito enviar un mensaje"), true);
  assert.equal(matchesSendSmsFlowIntent("manda un sms"), true);
  assert.equal(matchesSendSmsFlowIntent("enviar mensaje a 56934449937"), true);
  assert.equal(matchesSendSmsFlowIntent("puedo enviar un sms desde aqui?"), true);
  assert.equal(matchesSendSmsFlowIntent("quiero enviar campaña masiva"), true);

  const r1 = routeAgentIntent("envia un sms por mi", "web_client", { memory: {} });
  assert.equal(r1.intent, "send_sms_flow");
  assert.ok(r1.confidence >= 0.9);

  const r2 = routeAgentIntent("envia sms a 56934449937", "web_client", { memory: {} });
  assert.equal(r2.intent, "send_sms_flow");

  const landing = routeAgentIntent("quiero enviar un sms", "landing", { memory: {} });
  assert.equal(landing.intent, "send_sms_flow");

  const draft = parseSendSmsDraft(
    "envia sms a 56934449937 con el texto hola prueba",
  );
  assert.equal(draft.phone, "56934449937");
  assert.ok(draft.message?.includes("hola prueba"));

  const draftMsg = parseSendSmsDraft("envia sms que diga hola prueba");
  assert.equal(draftMsg.phone, null);
  assert.ok(draftMsg.message?.includes("hola"));

  const tg = routeAgentIntent("enviar 56934449937 hola", "telegram", {
    command: "enviar",
    authorized: true,
    memory: {},
  });
  assert.equal(tg.intent, "send_sms");

  console.log("✓ matching y routing send_sms");
}

async function testCoreFlow(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  const sessionId = `test-sms-${Date.now()}`;

  const landing = await runAgentCore({
    channel: "landing",
    message: "quiero enviar un sms",
    sessionId: `landing-${Date.now()}`,
    companyId: null,
    metadata: {},
  });
  assert.match(landing.reply, /cuenta Telvoice|inicia sesión|regístrate/i);
  assert.ok(!/telegram/i.test(landing.reply));
  assert.ok(!/Usar enviar 569/i.test(landing.reply));
  console.log("✓ landing invita a cuenta, sin Telegram");

  if (!companyId) {
    console.log("SKIP web_client core: TEST_COMPANY_ID no definido");
    return;
  }

  const r1 = await runAgentCore({
    channel: "web_client",
    message: "envia un sms por mi",
    sessionId,
    companyId,
    userId: null,
    metadata: {},
  });
  assert.equal(r1.intent, "send_sms");
  assert.match(r1.reply, /Necesito dos datos/i);
  assert.ok(!/telegram/i.test(r1.reply));
  console.log("✓ web_client pide número y mensaje");

  const r2 = await runAgentCore({
    channel: "web_client",
    message: "envia sms a 56934449937",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.match(r2.reply, /56934449937/);
  assert.match(r2.reply, /mensaje quieres enviar/i);
  console.log("✓ web_client pide mensaje");

  const r3 = await runAgentCore({
    channel: "web_client",
    message: "envia sms que diga hola prueba",
    sessionId: `test-msg-${Date.now()}`,
    companyId,
    metadata: {},
  });
  assert.match(r3.reply, /569XXXXXXXX|número/i);
  console.log("✓ web_client pide número");

  const r4 = await runAgentCore({
    channel: "web_client",
    message: "envia sms a 56934449937 con el texto hola prueba",
    sessionId: `test-full-${Date.now()}`,
    companyId,
    metadata: {},
  });
  assert.match(r4.reply, /Preparé este SMS/i);
  assert.match(r4.reply, /Confirmo/i);
  assert.equal(r4.requiresConfirmation, true);
  console.log("✓ web_client prepara pending y pide Confirmo");

  const rCancel = await runAgentCore({
    channel: "web_client",
    message: "cancelar",
    sessionId: r4.sessionId,
    companyId,
    metadata: {},
  });
  assert.match(rCancel.reply, /cancelad/i);
  console.log("✓ cancelar pending");
}

async function main(): Promise<void> {
  console.log("=== test:panel-agent-send-sms ===\n");
  testIntentMatching();
  await testCoreFlow();
  console.log("\nTodas las pruebas pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
