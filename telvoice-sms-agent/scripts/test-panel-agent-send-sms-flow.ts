/**
 * Flujo guiado SMS + CSV desde agente panel (web_client).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import {
  matchesSendSmsFlowIntent,
  parseFollowUpSmsBody,
  isOnlySendIntentStarter,
} from "../src/services/agent/agentSendSmsIntent.js";
import { routeAgentIntent } from "../src/services/agent/agentIntentRouter.js";
import { parseAgentRecipientCsv } from "../src/services/agent/agentPanelCsvService.js";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import { saveAgentCsvUpload } from "../src/services/agent/agentCsvUploadStore.js";

function testIntentRouting(): void {
  const r = routeAgentIntent("Enviar un SMS, puedes hacerlo por mí?", "web_client", {
    memory: {},
  });
  assert.equal(r.intent, "send_sms_flow");
  assert.ok(isOnlySendIntentStarter("Enviar un SMS, puedes hacerlo por mí?"));

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
    console.log("SKIP flujo mock: TEST_COMPANY_ID no definido");
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
  assert.ok(!/569XXXXXXXX.*mensaje/i.test(r1.reply.replace(/\n/g, " ")));
  console.log("✓ inicio pide mensaje primero");

  const r2 = await runAgentCore({
    channel: "web_client",
    message: "Hola, tu reserva está confirmada para mañana.",
    sessionId: r1.sessionId,
    companyId,
    metadata: {},
  });
  assert.match(r2.reply, /ya tengo el mensaje/i);
  assert.match(r2.reply, /CSV|número/i);
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

  const r4 = await runAgentCore({
    channel: "web_client",
    message: "Confirmo",
    sessionId: r3.sessionId,
    companyId,
    metadata: { pendingActionId: r3.pendingActionId },
  });
  assert.match(r4.reply, /SMS aceptado|simulado|aceptado/i);
  console.log("✓ Confirmo ejecuta");

  const session2 = `flow-csv-${Date.now()}`;
  const m1 = await runAgentCore({
    channel: "web_client",
    message: "Quiero enviar mensajes a varios contactos",
    sessionId: session2,
    companyId,
    metadata: {},
  });
  assert.match(m1.reply, /mensaje/i);

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
  testIntentRouting();
  testCsvParse();
  assert.ok(parseFollowUpSmsBody("Hola promo 20% descuento")?.includes("promo"));
  await testGuidedFlowMock();
  await testLandingNoSend();
  console.log("\nTodas las pruebas pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
