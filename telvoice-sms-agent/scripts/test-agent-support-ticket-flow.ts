/**
 * Flujo de tickets de soporte desde el agente del panel cliente.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import {
  getConversationMemory,
} from "../src/services/agent/agentConversationMemory.js";
import {
  canUseKnowledgeSearch,
  shouldTreatUserTextAsSmsMessage,
} from "../src/services/agent/agentOperationalState.js";
import {
  isSupportTicketIntent,
  isSmsTicketBodyPhrase,
} from "../src/services/agent/agentSupportTicketIntent.js";
import {
  inferSupportTicketCategory,
  inferSupportTicketPriority,
} from "../src/services/agent/supportTicketAgentService.js";
import { SEND_SMS_FLOW_STEP } from "../src/services/agent/agentSendSmsFlowUi.js";
import { getSupabase } from "../src/database/supabaseClient.js";

const COMPANY_ID =
  process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";

function testIntentHelper(): void {
  assert.ok(isSupportTicketIntent("ticket"));
  assert.ok(isSupportTicketIntent("crear ticket"));
  assert.ok(isSupportTicketIntent("necesito soporte"));
  assert.ok(isSupportTicketIntent("tengo un problema con mi saldo"));
  assert.ok(!isSupportTicketIntent("tu ticket es 1234"));
  assert.ok(!isSupportTicketIntent("ticket de descuento para clientes"));
  assert.ok(isSmsTicketBodyPhrase("tu ticket es 1234"));
  console.log("✓ isSupportTicketIntent / isSmsTicketBodyPhrase");
}

function testInference(): void {
  const msg = "No se acreditó mi compra de SMS";
  assert.equal(inferSupportTicketCategory(msg), "Compra y pago");
  const pri = inferSupportTicketPriority(msg);
  assert.ok(pri === "high" || pri === "medium");
  console.log("✓ inferencia categoría/prioridad");
}

function testKnowledgeGateDuringTicket(): void {
  const mem = { supportTicketFlowStep: "need_issue" };
  assert.equal(canUseKnowledgeSearch("web_client", mem, "knowledge"), false);
  console.log("✓ knowledge bloqueado durante flujo ticket");
}

function testTicketNotSmsBodyDuringWait(): void {
  const mem = {
    waitingForMessage: true,
    sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_MESSAGE,
  };
  assert.ok(!shouldTreatUserTextAsSmsMessage(mem, "ticket"));
  assert.ok(shouldTreatUserTextAsSmsMessage(mem, "tu ticket es 1234"));
  console.log("✓ ticket vs cuerpo SMS en waitingForMessage");
}

async function testTicketFromIdle(): Promise<void> {
  const sessionId = randomUUID();
  const r = await runAgentCore({
    channel: "web_client",
    message: "ticket",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "support_ticket");
  assert.match(r.reply, /puedo crear un ticket/i);
  assert.equal(r.showFeedback, false);
  assert.notEqual(r.intent, "knowledge");

  const mem = await getConversationMemory(sessionId, "web_client");
  assert.equal(mem.supportTicketFlowStep, "need_issue");
  console.log("✓ ticket desde idle");
}

async function testTicketInterruptsSmsFlow(): Promise<void> {
  const sessionId = randomUUID();
  await runAgentCore({
    channel: "web_client",
    message: "quiero enviar un sms",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "ticket",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "support_ticket");
  assert.match(r.reply, /puedo crear un ticket/i);
  assert.notEqual(r.intent, "knowledge");

  const mem = await getConversationMemory(sessionId, "web_client");
  assert.equal(mem.supportTicketFlowStep, "need_issue");
  assert.equal(mem.pendingSmsMessage, undefined);
  assert.equal(mem.waitingForMessage, undefined);
  console.log("✓ ticket interrumpe flujo SMS");
}

async function testDescriptionToReview(): Promise<void> {
  const sessionId = randomUUID();
  await runAgentCore({
    channel: "web_client",
    message: "ticket",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "No se acreditó mi compra de SMS",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "support_ticket");
  assert.match(r.reply, /Preparé este ticket/i);
  assert.match(r.reply, /Compra y pago/i);
  assert.notEqual(r.intent, "knowledge");

  const mem = await getConversationMemory(sessionId, "web_client");
  assert.equal(mem.supportTicketFlowStep, "review_ticket");
  assert.ok(mem.pendingSupportTicketSubject);
  console.log("✓ descripción → review_ticket");
}

async function testKnowledgeTextAsTicketDescription(): Promise<void> {
  const sessionId = randomUUID();
  await runAgentCore({
    channel: "web_client",
    message: "ticket",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "diferencia entre SMS tipo P y T",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "support_ticket");
  assert.match(r.reply, /Preparé este ticket/i);
  assert.doesNotMatch(r.reply, /tipo P y T.*artículo/i);
  console.log("✓ knowledge no interrumpe ticket");
}

async function testSmsBodyWithTicketWord(): Promise<void> {
  const sessionId = randomUUID();
  await runAgentCore({
    channel: "web_client",
    message: "quiero enviar un sms",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "tu ticket es 1234",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "send_sms_flow");
  assert.notEqual(r.intent, "support_ticket");

  const mem = await getConversationMemory(sessionId, "web_client");
  assert.equal(mem.pendingSmsMessage, "tu ticket es 1234");
  console.log("✓ 'tu ticket es 1234' es mensaje SMS");
}

async function testCancelBeforeCreate(): Promise<void> {
  const sessionId = randomUUID();
  await runAgentCore({
    channel: "web_client",
    message: "ticket",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  await runAgentCore({
    channel: "web_client",
    message: "problema con api",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "cancelar",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.match(r.reply, /cancel/i);

  const mem = await getConversationMemory(sessionId, "web_client");
  assert.equal(mem.supportTicketFlowStep, undefined);
  assert.equal(mem.pendingSupportTicketMessage, undefined);
  console.log("✓ cancelar antes de crear");
}

async function testCreateTicketInDb(): Promise<void> {
  if (!process.env.DATABASE_URL && !process.env.SUPABASE_URL) {
    console.log("SKIP crear ticket DB: sin DATABASE_URL/SUPABASE_URL");
    return;
  }

  const sessionId = randomUUID();
  const uniqueMsg = `Test agent ticket ${Date.now()}`;

  await runAgentCore({
    channel: "web_client",
    message: "ticket",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: { currentPath: "/app/send-sms" },
  });
  await runAgentCore({
    channel: "web_client",
    message: uniqueMsg,
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "crear ticket",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });

  if (!/TLV-\d+/.test(r.reply)) {
    if (/foreign key|company_id/i.test(r.reply)) {
      console.log("SKIP crear ticket DB: company_id de prueba no existe en DB local");
      return;
    }
    assert.match(r.reply, /TLV-\d+/);
  }

  const codeMatch = r.reply.match(/TLV-\d+/);
  assert.ok(codeMatch);
  const code = codeMatch[0];

  const { data, error } = await getSupabase()
    .from("client_support_tickets")
    .select("ticket_code, status, source, message, company_id")
    .eq("ticket_code", code)
    .maybeSingle();

  if (error) {
    console.log("SKIP verificación DB:", error.message);
    return;
  }
  assert.ok(data);
  assert.equal(data.company_id, COMPANY_ID);
  assert.equal(data.source, "agent_chat");
  assert.equal(data.message, uniqueMsg);
  assert.equal(data.status, "Abierto");
  console.log("✓ crear ticket en DB");
}

async function main(): Promise<void> {
  testIntentHelper();
  testInference();
  testKnowledgeGateDuringTicket();
  testTicketNotSmsBodyDuringWait();
  await testTicketFromIdle();
  await testTicketInterruptsSmsFlow();
  await testDescriptionToReview();
  await testKnowledgeTextAsTicketDescription();
  await testSmsBodyWithTicketWord();
  await testCancelBeforeCreate();
  await testCreateTicketInDb();
  console.log("\nTodos los tests de support ticket flow pasaron.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
