/**
 * Casos de regresión derivados de feedback negativo panel.
 */
import assert from "node:assert/strict";
import { routeAgentIntent } from "../src/services/agent/agentIntentRouter.js";
import { buildTechnicalDoubtReply } from "../src/services/agent/agentTechnicalReplies.js";
import { deriveQaFromMessages } from "../src/services/agent/agentFeedbackContext.js";
import { optimizeSmsCopyTool } from "../src/services/agent/tools/optimizeSmsCopyTool.js";

function testCampaignIntent(): void {
  const r = routeAgentIntent("Ayúdame a crear una campaña", "web_client", {
    memory: {},
  });
  assert.equal(r.intent, "send_sms_flow");
  assert.ok(r.confidence >= 0.85);
  console.log("✓ Ayúdame a crear una campaña → send_sms_flow guiado");
}

function testUnauthorizedDestination(): void {
  const r = routeAgentIntent(
    "Por que me indica que el número de destino no esta autorizado?",
    "web_client",
    { memory: {} },
  );
  assert.equal(r.intent, "dlr_help");
  const reply = buildTechnicalDoubtReply(
    "Por que me indica que el número de destino no esta autorizado?",
  );
  assert.ok(reply?.includes("569"));
  console.log("✓ destino no autorizado → dlr_help + respuesta técnica");
}

function testApiIntegration(): void {
  const r = routeAgentIntent(
    "¿Cómo integro la API de Telvoice con mi sistema?",
    "web_client",
    { memory: {} },
  );
  assert.equal(r.intent, "technical_doubt");
  const reply = buildTechnicalDoubtReply("¿Cómo integro la API de Telvoice con mi sistema?");
  assert.ok(reply?.includes("API"));
  console.log("✓ integración API → technical_doubt");
}

async function testCopyNotLonger(): Promise<void> {
  const r = await optimizeSmsCopyTool.run(
    { channel: "web_client", companyId: "x", userId: null, sessionId: "s" },
    { text: "Hola cliente tenemos descuento hoy" },
  );
  assert.ok(r.summary.includes("ya es breve") || r.summary.includes("más corta"));
  console.log("✓ optimizar mensaje corto no alarga");
}

function testDeriveQaBeforeFeedback(): void {
  const msgs = [
    {
      id: "1",
      session_id: "s",
      role: "user" as const,
      content: "pregunta uno",
      metadata: { intent: "balance" },
      created_at: "2026-05-30T06:00:00.000Z",
    },
    {
      id: "2",
      session_id: "s",
      role: "assistant" as const,
      content: "respuesta uno",
      metadata: { intent: "balance", confidence: 0.88 },
      created_at: "2026-05-30T06:00:01.000Z",
    },
    {
      id: "3",
      session_id: "s",
      role: "user" as const,
      content: "pregunta dos",
      metadata: { intent: "knowledge" },
      created_at: "2026-05-30T06:01:00.000Z",
    },
    {
      id: "4",
      session_id: "s",
      role: "assistant" as const,
      content: "respuesta dos",
      metadata: { intent: "knowledge", confidence: 0.95 },
      created_at: "2026-05-30T06:01:01.000Z",
    },
  ];
  const qa = deriveQaFromMessages(msgs, "2026-05-30T06:01:30.000Z");
  assert.equal(qa.user_question, "pregunta dos");
  assert.equal(qa.agent_response, "respuesta dos");
  console.log("✓ deriveQa respeta cutoff de feedback");
}

async function main(): Promise<void> {
  console.log("=== test:agent-feedback-cases ===\n");
  testCampaignIntent();
  testUnauthorizedDestination();
  testApiIntegration();
  testDeriveQaBeforeFeedback();
  await testCopyNotLonger();
  console.log("\nTodos los casos pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
