/**
 * Bloqueo de knowledge durante flujos operativos (SMS/campaña/compra).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../src/services/agent/agentConversationMemory.js";
import {
  canUseKnowledgeSearch,
  shouldTreatUserTextAsSmsMessage,
} from "../src/services/agent/agentOperationalState.js";
import { routeAgentIntent } from "../src/services/agent/agentIntentRouter.js";
import { SEND_SMS_FLOW_STEP } from "../src/services/agent/agentSendSmsFlowUi.js";
import { PURCHASE_FLOW_STEP } from "../src/services/agent/agentPurchaseFlow.js";
import { createPendingActionDb } from "../src/services/agent/agentPendingActionsService.js";
import { calculateTelvoiceQuote } from "../src/services/telvoicePricingService.js";
import { isPureGreeting } from "../src/services/agent/agentGreetingReset.js";
import { detectPurchaseIntent } from "../src/services/agent/agentPurchaseFlow.js";

const COMPANY_ID =
  process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";

function testShouldTreatAsSmsMessage(): void {
  const mem = {
    waitingForMessage: true,
    sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_MESSAGE,
  };
  assert.ok(shouldTreatUserTextAsSmsMessage(mem, "tu codigo de google es 989898"));
  assert.ok(
    shouldTreatUserTextAsSmsMessage(mem, "Casos de uso de SMS entrantes"),
  );
  assert.ok(
    shouldTreatUserTextAsSmsMessage(mem, "Hola, tu reserva está confirmada."),
  );
  assert.ok(!shouldTreatUserTextAsSmsMessage(mem, "Cancelar"));
  assert.ok(!shouldTreatUserTextAsSmsMessage(mem, "salir"));
  assert.ok(!shouldTreatUserTextAsSmsMessage(mem, "hola"));
  console.log("✓ shouldTreatUserTextAsSmsMessage");
}

function testKnowledgeGate(): void {
  const waiting = {
    waitingForMessage: true,
    sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_MESSAGE,
  };
  assert.equal(canUseKnowledgeSearch("web_client", waiting, "knowledge"), false);

  const review = {
    sendSmsFlowStep: SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
    pendingSmsMessage: "Test",
  };
  assert.equal(canUseKnowledgeSearch("web_client", review, "knowledge"), false);

  const purchase = {
    purchaseFlowStep: PURCHASE_FLOW_STEP.REVIEW_QUOTE,
    pendingPurchaseQuantity: 5000,
  };
  assert.equal(canUseKnowledgeSearch("web_client", purchase, "knowledge"), false);

  assert.equal(canUseKnowledgeSearch("web_client", {}, "knowledge"), true);
  console.log("✓ canUseKnowledgeSearch");
}

function testRouterBlocksKnowledgeDuringFlow(): void {
  const mem = {
    waitingForMessage: true,
    sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_MESSAGE,
  };
  const r1 = routeAgentIntent("Casos de uso de SMS entrantes", "web_client", {
    memory: mem,
  });
  assert.equal(r1.intent, "send_sms_flow");

  const r2 = routeAgentIntent("tu codigo de google es 989898", "web_client", {
    memory: mem,
  });
  assert.equal(r2.intent, "send_sms_flow");
  console.log("✓ router fuerza send_sms_flow en need_message");
}

async function testCampaignGoogleCodeMessage(): Promise<void> {
  const sessionId = randomUUID();
  const r1 = await runAgentCore({
    channel: "web_client",
    message: "Ayúdame a crear una campaña",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r1.intent, "send_sms_flow");
  assert.match(r1.reply, /mensaje/i);
  assert.equal(r1.showFeedback, false);

  const r2 = await runAgentCore({
    channel: "web_client",
    message: "tu codigo de google es 989898",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r2.intent, "send_sms_flow");
  assert.match(r2.reply, /ya tengo el mensaje/i);
  assert.doesNotMatch(r2.reply, /Casos de uso de SMS entrantes/i);
  assert.notEqual(r2.intent, "knowledge");
  assert.equal(r2.showFeedback, false);

  const mem = await getConversationMemory(sessionId, "web_client");
  assert.equal(mem.pendingSmsMessage, "tu codigo de google es 989898");
  assert.equal(mem.sendSmsFlowStep, SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV);
  console.log("✓ campaña + código google guardado como mensaje");
}

async function testKnowledgeTitleAsSmsBody(): Promise<void> {
  const sessionId = randomUUID();
  await runAgentCore({
    channel: "web_client",
    message: "quiero enviar una campaña",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });

  const r = await runAgentCore({
    channel: "web_client",
    message: "Casos de uso de SMS entrantes",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "send_sms_flow");
  assert.notEqual(r.intent, "inbound_sms_knowledge");
  const mem = await getConversationMemory(sessionId, "web_client");
  assert.equal(mem.pendingSmsMessage, "Casos de uso de SMS entrantes");
  console.log("✓ título knowledge guardado como mensaje SMS");
}

async function testCancelInNeedMessage(): Promise<void> {
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
    message: "Cancelar",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "cancel");
  const mem = await getConversationMemory(sessionId, "web_client");
  assert.ok(!mem.sendSmsFlowStep);
  assert.ok(!mem.waitingForMessage);
  console.log("✓ cancelar en need_message limpia estado");
}

async function testHolaPureInNeedMessage(): Promise<void> {
  const sessionId = randomUUID();
  await updateConversationMemory(
    sessionId,
    "web_client",
    {
      waitingForMessage: true,
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.NEED_MESSAGE,
      sendSmsFlowActive: true,
    },
    COMPANY_ID,
  );

  assert.ok(isPureGreeting("hola"));
  const r = await runAgentCore({
    channel: "web_client",
    message: "hola",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "greeting");
  assert.notEqual(r.intent, "knowledge");
  const mem = await getConversationMemory(sessionId, "web_client");
  assert.ok(!mem.waitingForMessage);
  console.log("✓ hola puro resetea need_message");
}

async function testHolaWithPurchaseIntent(): Promise<void> {
  assert.ok(!isPureGreeting("hola quiero comprar 5000 sms"));
  assert.ok(detectPurchaseIntent("hola quiero comprar 5000 sms", {}));
  const route = routeAgentIntent("hola quiero comprar 5000 sms", "web_client", {
    memory: {},
  });
  assert.notEqual(route.intent, "greeting");
  assert.equal(route.intent, "commercial");
  console.log("✓ hola + compra no resetea");
}

async function testConfirmCampaignCsv(): Promise<void> {
  try {
    const sessionId = randomUUID();
    const quote = await calculateTelvoiceQuote(1000);
    const pending = await createPendingActionDb({
      type: "send_campaign_csv",
      summary: "Test campaña CSV",
      payload: {
        channel: "web_client",
        company_id: COMPANY_ID,
        message: "Test msg",
        valid_recipients: ["56912345678"],
        contacts_count: 1,
        estimated_total_sms: 1,
      },
      context: {
        channel: "web_client",
        companyId: COMPANY_ID,
        userId: null,
        sessionId,
      },
    });

    await updateConversationMemory(
      sessionId,
      "web_client",
      {
        sendSmsFlowStep: SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
        pendingSmsMessage: "Test msg",
        pendingPurchaseQuote: quote,
      },
      COMPANY_ID,
    );

    const r = await runAgentCore({
      channel: "web_client",
      message: "Confirmo",
      sessionId,
      companyId: COMPANY_ID,
      userId: null,
      metadata: { pendingActionId: pending.id },
    });
    assert.equal(r.intent, "confirm");
    assert.doesNotMatch(r.reply, /Revisé tu planilla/i);
    console.log("✓ Confirmo en review_campaign_csv ejecuta pending");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/foreign key|23503|no tiene plan/i.test(msg)) {
      console.log("SKIP Confirmo CSV E2E: DB de prueba no disponible");
      return;
    }
    throw err;
  }
}

async function testPurchaseReviewQuoteYes(): Promise<void> {
  try {
    const sessionId = randomUUID();
    const quote = await calculateTelvoiceQuote(5000);
    await updateConversationMemory(
      sessionId,
      "web_client",
      {
        purchaseFlowStep: PURCHASE_FLOW_STEP.REVIEW_QUOTE,
        pendingPurchaseQuote: quote,
        pendingPurchaseQuantity: 5000,
      },
      COMPANY_ID,
    );

    const r = await runAgentCore({
      channel: "web_client",
      message: "sí",
      sessionId,
      companyId: COMPANY_ID,
      userId: null,
      metadata: {},
    });
    assert.match(r.reply, /link|pago|mercadopago|checkout/i);
    assert.doesNotMatch(r.reply, /cuántos sms/i);
    console.log("✓ sí en review_quote genera link");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/foreign key|23503|no tiene plan/i.test(msg)) {
      console.log("SKIP review_quote E2E: DB de prueba no disponible");
      return;
    }
    throw err;
  }
}

async function testPrepararCampana(): Promise<void> {
  const sessionId = randomUUID();
  const r = await runAgentCore({
    channel: "web_client",
    message: "preparar campaña",
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: {},
  });
  assert.equal(r.intent, "send_sms_flow");
  assert.match(r.reply, /mensaje/i);
  assert.doesNotMatch(r.reply, /Respuestas a campañas/i);
  console.log("✓ preparar campaña inicia flujo sin knowledge");
}

async function testKnowledgeWithoutFlow(): Promise<void> {
  const sessionId = randomUUID();
  try {
    const r = await runAgentCore({
      channel: "web_client",
      message: "casos de uso de SMS entrantes",
      sessionId,
      companyId: COMPANY_ID,
      userId: null,
      metadata: {},
    });
    const isKnowledge =
      r.intent === "knowledge" || r.intent === "inbound_sms_knowledge";
    assert.ok(isKnowledge || r.reply.length > 20);
    if (isKnowledge) {
      assert.ok(r.reply.length <= 900, "respuesta knowledge debe ser corta");
      assert.equal(r.showFeedback, true);
    }
    console.log("✓ sin flujo activo puede responder knowledge corto");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/column|content_short|23503/i.test(msg)) {
      console.log("SKIP knowledge E2E: migración 068 o DB no disponible");
    } else {
      throw err;
    }
  }
}

async function main(): Promise<void> {
  console.log("=== test:agent-operational-state-lock ===\n");
  testShouldTreatAsSmsMessage();
  testKnowledgeGate();
  testRouterBlocksKnowledgeDuringFlow();
  await testCampaignGoogleCodeMessage();
  await testKnowledgeTitleAsSmsBody();
  await testCancelInNeedMessage();
  await testHolaPureInNeedMessage();
  await testHolaWithPurchaseIntent();
  await testConfirmCampaignCsv();
  await testPurchaseReviewQuoteYes();
  await testPrepararCampana();
  await testKnowledgeWithoutFlow();
  console.log("\nOK operational state lock");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
