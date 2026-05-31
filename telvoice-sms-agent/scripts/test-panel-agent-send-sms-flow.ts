/**
 * Flujo guiado SMS + CSV desde agente panel (web_client).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import {
  matchesSendSmsFlowIntent,
  parseFollowUpSmsBody,
  isSendSmsIntentOnly,
  extractExplicitSmsMessage,
  parseSendSmsDraft,
  sanitizePendingSmsMessage,
  isCorruptedIntentPhrase,
} from "../src/services/agent/agentSendSmsIntent.js";
import { routeAgentIntent } from "../src/services/agent/agentIntentRouter.js";
import { parseAgentRecipientCsv } from "../src/services/agent/agentPanelCsvService.js";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import { saveAgentCsvUpload } from "../src/services/agent/agentCsvUploadStore.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../src/services/agent/agentConversationMemory.js";

function testIntentHelpers(): void {
  assert.ok(matchesSendSmsFlowIntent("Enviar un SMS, puedes hacerlo por mí?"));
  assert.ok(isSendSmsIntentOnly("Enviar un SMS, puedes hacerlo por mí?"));
  assert.ok(isSendSmsIntentOnly("quiero enviar un sms"));
  assert.ok(isSendSmsIntentOnly("quiero enviar una campaña"));
  assert.equal(extractExplicitSmsMessage("envía un sms que diga hola prueba"), "hola prueba");

  const draft = parseSendSmsDraft(
    "envía un sms a 56934449937 con el texto hola prueba",
  );
  assert.equal(draft.phone, "56934449937");
  assert.equal(draft.message, "hola prueba");

  assert.ok(isCorruptedIntentPhrase("quiero enviar un sms"));
  assert.equal(sanitizePendingSmsMessage("quiero enviar un sms"), null);
  assert.equal(sanitizePendingSmsMessage("enviar un sms, puedes hacerlo por mi"), null);

  assert.equal(
    parseFollowUpSmsBody("Hola, tu reserva está confirmada", { waitingForMessage: true }),
    "Hola, tu reserva está confirmada",
  );
  assert.equal(
    parseFollowUpSmsBody("Enviar un SMS, puedes hacerlo por mí?", {
      waitingForMessage: true,
    }),
    null,
  );
  assert.equal(parseFollowUpSmsBody("quiero enviar un sms"), null);

  console.log("✓ helpers intención vs mensaje");
}

function testIntentRouting(): void {
  const r = routeAgentIntent("Enviar un SMS, puedes hacerlo por mí?", "web_client", {
    memory: {},
  });
  assert.equal(r.intent, "send_sms_flow");
  assert.ok(isSendSmsIntentOnly("Enviar un SMS, puedes hacerlo por mí?"));

  const camp = routeAgentIntent("quiero enviar una campaña", "web_client", { memory: {} });
  assert.equal(camp.intent, "send_sms_flow");

  const landing = routeAgentIntent("quiero enviar un sms", "landing", { memory: {} });
  assert.equal(landing.intent, "send_sms_flow");

  console.log("✓ intención send_sms_flow");
}

function testCsvParse(): void {
  const csv = "telefono\n56934449937\n56912345678\ninvalid\n56912345678\n";
  const p = parseAgentRecipientCsv(csv);
  assert.equal(p.validRecipients.length, 2);
  assert.equal(p.duplicateCount, 1);
  assert.equal(p.invalidCount, 1);
  console.log("✓ parseo CSV válidos/inválidos/duplicados");
}

async function testGuidedFlowMock(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  if (!companyId) {
    console.log("SKIP flujo mock E2E: TEST_COMPANY_ID no definido");
    return;
  }

  const sessionId = `flow-${Date.now()}`;

  const r1 = await runAgentCore({
    channel: "web_client",
    message: "Enviar un SMS, puedes hacerlo por mí?",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.equal(r1.intent, "send_sms_flow");
  assert.match(r1.reply, /Primero dime qué mensaje/i);
  assert.ok(!/ya tengo el mensaje/i.test(r1.reply));
  const mem1 = await getConversationMemory(r1.sessionId, "web_client");
  assert.equal(mem1.pendingSmsMessage, undefined);
  assert.equal(mem1.waitingForMessage, true);
  console.log("✓ inicio pide mensaje primero (sin pendingSmsMessage)");

  const r1b = await runAgentCore({
    channel: "web_client",
    message: "quiero enviar un sms",
    sessionId: `flow-b-${Date.now()}`,
    companyId,
    metadata: {},
  });
  assert.match(r1b.reply, /Primero dime qué mensaje/i);
  assert.ok(!/ya tengo el mensaje/i.test(r1b.reply));
  console.log("✓ quiero enviar un sms → pide mensaje");

  const rExplicit = await runAgentCore({
    channel: "web_client",
    message: "envía un sms que diga hola prueba",
    sessionId: `flow-explicit-${Date.now()}`,
    companyId,
    metadata: {},
  });
  assert.match(rExplicit.reply, /ya tengo el mensaje|número|CSV/i);
  const memEx = await getConversationMemory(rExplicit.sessionId, "web_client");
  assert.equal(memEx.pendingSmsMessage, "hola prueba");
  console.log("✓ mensaje explícito que diga → guarda cuerpo");

  const rCombined = await runAgentCore({
    channel: "web_client",
    message: "envía un sms a 56934449937 con el texto hola prueba",
    sessionId: `flow-combo-${Date.now()}`,
    companyId,
    metadata: {},
  });
  assert.match(rCombined.reply, /Preparé este envío|Confirmo/i);
  console.log("✓ número + texto explícito → resumen");

  const r2 = await runAgentCore({
    channel: "web_client",
    message: "Hola, tu reserva está confirmada para mañana.",
    sessionId: r1.sessionId,
    companyId,
    metadata: {},
  });
  assert.match(r2.reply, /ya tengo el mensaje/i);
  assert.match(r2.reply, /CSV|número/i);
  const mem2 = await getConversationMemory(r2.sessionId, "web_client");
  assert.ok(mem2.pendingSmsMessage?.includes("reserva"));
  console.log("✓ mensaje → pide destino");

  const r3 = await runAgentCore({
    channel: "web_client",
    message: "56934449937",
    sessionId: r2.sessionId,
    companyId,
    metadata: {},
  });
  assert.match(r3.reply, /Preparé este envío/i);
  assert.match(r3.reply, /Confirmo/i);
  assert.equal(r3.requiresConfirmation, true);
  console.log("✓ número → resumen");

  const corruptSession = `flow-corrupt-${Date.now()}`;
  await updateConversationMemory(
    corruptSession,
    "web_client",
    {
      sendSmsFlowActive: true,
      sendSmsFlowStep: "need_dest",
      pendingSmsMessage: "quiero enviar un sms",
      waitingForMessage: false,
    },
    companyId,
  );
  const rCorrupt = await runAgentCore({
    channel: "web_client",
    message: "56934449937",
    sessionId: corruptSession,
    companyId,
    metadata: {},
  });
  assert.match(rCorrupt.reply, /Primero dime qué mensaje|mensaje quieres enviar/i);
  console.log("✓ memoria corrupta limpiada");

  const campSession = `flow-camp-${Date.now()}`;
  const rCamp = await runAgentCore({
    channel: "web_client",
    message: "quiero enviar una campaña",
    sessionId: campSession,
    companyId,
    metadata: {},
  });
  assert.match(rCamp.reply, /Primero dime qué mensaje/i);
  assert.ok(!/Adjuntar CSV|planilla/i.test(rCamp.reply) || /Primero dime qué mensaje/i.test(rCamp.reply));
  console.log("✓ campaña → pide mensaje primero");

  const session2 = `flow-csv-${Date.now()}`;
  const m1 = await runAgentCore({
    channel: "web_client",
    message: "Quiero enviar mensajes a varios contactos",
    sessionId: session2,
    companyId,
    metadata: {},
  });
  assert.match(m1.reply, /Primero dime qué mensaje|mensaje quieres enviar/i);

  const m2 = await runAgentCore({
    channel: "web_client",
    message: "Promo fin de semana 20% descuento",
    sessionId: m1.sessionId,
    companyId,
    metadata: {},
  });
  const upload = saveAgentCsvUpload({
    companyId,
    sessionId: m2.sessionId,
    userId: null,
    parsed: parseAgentRecipientCsv(
      "phone\n56934449937\n56987654321\n56987654321\nbadnum\n",
    ),
  });

  const m3 = await runAgentCore({
    channel: "web_client",
    message: "listo",
    sessionId: m2.sessionId,
    companyId,
    metadata: { csvUploadId: upload.id },
  });
  assert.match(m3.reply, /Revisé tu planilla|Contactos válidos/i);
  assert.match(m3.reply, /Confirmo/i);
  console.log("✓ CSV → resumen campaña");
}

async function testLandingNoSend(): Promise<void> {
  const r = await runAgentCore({
    channel: "landing",
    message: "quiero enviar un sms",
    sessionId: `land-${Date.now()}`,
    companyId: null,
    metadata: {},
  });
  assert.match(r.reply, /cuenta Telvoice|inicia sesión|regístrate/i);
  assert.ok(!/telegram/i.test(r.reply));
  console.log("✓ landing sin Telegram");
}

async function main(): Promise<void> {
  console.log("=== test:panel-agent-send-sms-flow ===\n");
  testIntentHelpers();
  testIntentRouting();
  testCsvParse();
  await testGuidedFlowMock();
  await testLandingNoSend();
  console.log("\nTodas las pruebas pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
