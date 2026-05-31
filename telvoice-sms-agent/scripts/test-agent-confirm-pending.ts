/**
 * Confirmación de pending_action tiene prioridad sobre re-resumen CSV.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  matchesConfirmIntent,
  matchesCancelIntent,
} from "../src/services/agent/agentIntentRouter.js";
import { tryActiveSendSmsFlowFirst } from "../src/services/agent/agentSendSmsFlow.js";
import { SEND_SMS_FLOW_STEP } from "../src/services/agent/agentSendSmsFlowUi.js";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import { createPendingActionDb } from "../src/services/agent/agentPendingActionsService.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../src/services/agent/agentConversationMemory.js";

function testConfirmPatterns(): void {
  assert.ok(matchesConfirmIntent("Confirmo"));
  assert.ok(matchesConfirmIntent("confirmar campaña"));
  assert.ok(matchesConfirmIntent("enviar ahora"));
  assert.ok(matchesCancelIntent("salir"));
  console.log("✓ patrones confirm/cancel");
}

async function testFlowSkipsConfirm(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";
  const sessionId = randomUUID();
  await updateConversationMemory(
    sessionId,
    "web_client",
    {
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
      pendingSmsMessage: "Mensaje de prueba",
      pendingCsvUploadId: randomUUID(),
      waitingForMessage: false,
    },
    companyId,
  );

  const blocked = await tryActiveSendSmsFlowFirst(
    "Confirmo",
    {
      channel: "web_client",
      companyId,
      userId: null,
      sessionId,
      metadata: {},
    },
    sessionId,
    await getConversationMemory(sessionId, "web_client"),
    {},
  );
  assert.equal(blocked, null, "Confirmo no debe rearmar resumen CSV");
  console.log("✓ tryActiveSendSmsFlowFirst no intercepta Confirmo");
}

async function testConfirmExecutesPending(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  if (!companyId) {
    console.log("SKIP confirm ejecuta pending: TEST_COMPANY_ID no definido");
    return;
  }

  const sessionId = randomUUID();
  const pending = await createPendingActionDb({
    type: "send_campaign_csv",
    summary: "Test CSV 1 contacto",
    payload: {
      message: "Test confirm pending",
      sender_id: "TELVOICE",
      valid_recipients: ["56934449937"],
      estimated_total_sms: 1,
      balance_before: 100,
      balance_after_estimated: 99,
      campaign_name: "Test confirm",
    },
    context: {
      channel: "web_client",
      companyId,
      userId: null,
      sessionId,
    },
  });

  await updateConversationMemory(
    sessionId,
    "web_client",
    {
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
      pendingSmsMessage: "Test confirm pending",
      pendingCsvUploadId: randomUUID(),
    },
    companyId,
  );

  const r = await runAgentCore({
    channel: "web_client",
    message: "Confirmo",
    sessionId,
    companyId,
    metadata: { pendingActionId: pending.id },
  });

  assert.equal(r.intent, "confirm");
  assert.match(r.reply, /Campaña aceptada|SMS aceptado/i);
  assert.match(r.reply, /Saldo antes del envío/i);
  assert.match(r.reply, /Saldo actual/i);
  assert.ok(!/Crédito disponible después del envío/i.test(r.reply));
  assert.ok(!/Revisé tu planilla/i.test(r.reply), `no debe repetir resumen: ${r.reply.slice(0, 120)}`);
  assert.equal(r.showAttachButton, false);
  assert.equal(r.clearCsvUpload, true);

  const r2 = await runAgentCore({
    channel: "web_client",
    message: "Confirmo",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.match(r2.reply, /ya fue procesada|No encontré una acción pendiente/i);
  console.log("✓ Confirmo ejecuta pending y doble Confirmo es seguro");
}

async function testConfirmWithoutPending(): Promise<void> {
  const companyId = process.env.TEST_COMPANY_ID?.trim();
  if (!companyId) {
    console.log("SKIP confirm sin pending");
    return;
  }
  const sessionId = randomUUID();
  const r = await runAgentCore({
    channel: "web_client",
    message: "Confirmo",
    sessionId,
    companyId,
    metadata: {},
  });
  assert.match(r.reply, /No encontré una acción pendiente/i);
  assert.ok(!/Revisé tu planilla/i.test(r.reply));
  console.log("✓ Confirmo sin pending: mensaje amigable");
}

async function main(): Promise<void> {
  console.log("=== test:agent-confirm-pending ===\n");
  testConfirmPatterns();
  await testFlowSkipsConfirm();
  await testConfirmWithoutPending();
  await testConfirmExecutesPending();
  console.log("\nTodos los casos pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
