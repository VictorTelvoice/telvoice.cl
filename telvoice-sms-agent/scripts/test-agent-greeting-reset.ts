/**
 * Saludo puro reinicia flujos activos (compra, CSV, envío).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../src/services/agent/agentConversationMemory.js";
import {
  buildFreshGreetingResponse,
  extractFirstName,
  isPureGreeting,
  timeOfDayPhrase,
} from "../src/services/agent/agentGreetingReset.js";
import { PURCHASE_FLOW_STEP } from "../src/services/agent/agentPurchaseFlow.js";
import { calculateTelvoiceQuote } from "../src/services/telvoicePricingService.js";
import { createPendingActionDb } from "../src/services/agent/agentPendingActionsService.js";
import { SEND_SMS_FLOW_STEP } from "../src/services/agent/agentSendSmsFlowUi.js";
import { findPendingForSessionDb } from "../src/services/agent/agentPendingActionsService.js";

const COMPANY_ID =
  process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";

function testPureGreetingDetector(): void {
  assert.ok(isPureGreeting("hola"));
  assert.ok(isPureGreeting("Hola!"));
  assert.ok(isPureGreeting("buenas tardes"));
  assert.ok(isPureGreeting("hola, qué tal"));
  assert.ok(isPureGreeting("buenas, cómo estás"));
  assert.ok(!isPureGreeting("hola quiero comprar 5000 sms"));
  assert.ok(!isPureGreeting("hola generar link de pago"));
  assert.ok(!isPureGreeting("hola quiero enviar campaña"));
  assert.ok(!isPureGreeting("buenas quiero ver mi saldo"));
  console.log("✓ isPureGreeting");
}

function testTimeAndName(): void {
  assert.equal(timeOfDayPhrase(9), "Buenos días");
  assert.equal(timeOfDayPhrase(15), "Buenas tardes");
  assert.equal(timeOfDayPhrase(22), "Buenas noches");
  assert.equal(extractFirstName("Víctor Garcés"), "Víctor");
  assert.equal(extractFirstName("Licantravel"), "Licantravel");
  const g = buildFreshGreetingResponse({
    sessionId: "s",
    displayName: "Víctor",
    localHour: 15,
  });
  assert.match(g.reply, /Buenas tardes, Víctor/);
  assert.equal(g.resetFlow, true);
  assert.equal(g.showAttachButton, false);
  console.log("✓ hora y nombre");
}

async function testPurchaseThenHola(): Promise<void> {
  const sessionId = randomUUID();
  await runAgentCore({
    channel: "web_client",
    message: "quiero comprar 5000 sms",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: { userDisplayName: "Víctor Garcés", userLocalHour: 15 },
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "hola",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: { userDisplayName: "Víctor Garcés", userLocalHour: 15 },
  });

  assert.equal(r.intent, "greeting");
  assert.match(r.reply, /Buenas tardes, Víctor/);
  assert.match(r.reply, /Qué quieres hacer hoy/i);
  assert.ok(!/cuántos sms quieres comprar/i.test(r.reply));
  assert.ok(!/revisemos el precio/i.test(r.reply));
  assert.ok(!/comprar saldo sms/i.test(r.reply));
  assert.equal(r.resetFlow, true);

  const mem = await getConversationMemory(sessionId, "web_client");
  assert.equal(mem.purchaseFlowStep, undefined);
  assert.equal(mem.pendingPurchaseQuote, undefined);
  console.log("✓ compra activa + hola");
}

async function testHolaWithIntent(): Promise<void> {
  const sessionId = randomUUID();
  const r = await runAgentCore({
    channel: "web_client",
    message: "hola quiero comprar 5000 sms",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: { userLocalHour: 10 },
  });
  assert.notEqual(r.intent, "greeting");
  assert.match(r.reply, /5\.?000/i);
  assert.match(r.reply, /53\.?550/);
  console.log("✓ hola con intención cotiza");
}

async function testCsvThenHolaThenConfirmo(): Promise<void> {
  const sessionId = randomUUID();
  const quote = await calculateTelvoiceQuote(1000);
  await updateConversationMemory(
    sessionId,
    "web_client",
    {
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
      pendingSmsMessage: "Test CSV",
      pendingCsvUploadId: randomUUID(),
      pendingPurchaseQuote: quote,
      purchaseFlowStep: PURCHASE_FLOW_STEP.REVIEW_QUOTE,
    },
    COMPANY_ID,
  );

  await createPendingActionDb({
    type: "send_campaign_csv",
    summary: "Test greeting reset",
    payload: { message: "Hola test", valid_recipients: ["56900000001"] },
    context: {
      channel: "web_client",
      companyId: COMPANY_ID,
      userId: null,
      sessionId,
    },
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "hola",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: { userDisplayName: "Víctor", userLocalHour: 15 },
  });

  assert.equal(r.intent, "greeting");
  assert.ok(!/revisé tu planilla/i.test(r.reply));
  assert.equal(r.clearCsvUpload, true);

  const pending = await findPendingForSessionDb(sessionId, COMPANY_ID);
  assert.equal(pending, null);

  const confirm = await runAgentCore({
    channel: "web_client",
    message: "Confirmo",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
  });

  assert.ok(!/Campaña aceptada/i.test(confirm.reply));
  assert.ok(
    /no encontré una acción pendiente|no hay acción pendiente|Prepararé el envío/i.test(
      confirm.reply,
    ),
  );
  console.log("✓ CSV + hola + Confirmo no ejecuta campaña");
}

async function main(): Promise<void> {
  console.log("=== test:agent-greeting-reset ===\n");
  testPureGreetingDetector();
  testTimeAndName();
  await testPurchaseThenHola();
  await testHolaWithIntent();
  await testCsvThenHolaThenConfirmo();
  console.log("\nTodos los casos pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
