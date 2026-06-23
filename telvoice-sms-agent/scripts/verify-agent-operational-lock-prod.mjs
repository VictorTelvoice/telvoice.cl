#!/usr/bin/env node
/**
 * QA producción: bloqueo operacional del agente (casos A–G).
 * Sin envíos reales, sin pagos, sin Confirmo en pending actions reales.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";
import {
  findPendingForSessionDb,
} from "../dist/services/agent/agentPendingActionsService.js";
import {
  getConversationMemory,
} from "../dist/services/agent/agentConversationMemory.js";

const BASE = (
  process.env.PROD_APP_URL ||
  process.env.PUBLIC_APP_URL ||
  "https://agent.telvoice.cl"
)
  .replace(/\/$/, "")
  .replace(/^http:\/\/localhost(:\d+)?$/i, "https://agent.telvoice.cl");

const COMPANY_ID =
  process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";
const CLIENT_EMAIL =
  process.env.TEST_CLIENT_EMAIL?.trim() ?? "licantravel@gmail.com";
const CLIENT_COOKIE = "tv_client_session";

const cs = process.env.DATABASE_URL?.trim();
if (!cs || !process.env.JWT_SECRET) {
  console.error("DATABASE_URL y JWT_SECRET requeridos");
  process.exit(1);
}

const db = new pg.Client({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
});

const results = [];

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "OK" : "FAIL"} ${id}: ${detail}`);
}

async function main() {
  await db.connect();

  const healthRes = await fetch(`${BASE}/health`);
  const health = await healthRes.json();
  console.log("Health:", JSON.stringify(health));
  assert.equal(health.status, "ok");
  const build = health.build ?? "";
  assert.ok(
    build.startsWith("98b3d89") ||
      build.startsWith("8d3e3e9") ||
      build.startsWith("832c85f"),
    `build esperado hotfix operacional, recibido: ${build}`,
  );
  record("health", true, `build=${build}`);

  const { rows: migCols } = await db.query(
    `SELECT column_name, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'knowledge_articles'
       AND column_name IN (
         'content_short', 'answer_style', 'trigger_intents',
         'blocked_when_flow_active', 'related_articles', 'metadata'
       )
     ORDER BY column_name`,
  );
  const expectedCols = [
    "answer_style",
    "blocked_when_flow_active",
    "content_short",
    "metadata",
    "related_articles",
    "trigger_intents",
  ];
  for (const col of expectedCols) {
    const found = migCols.find((r) => r.column_name === col);
    record(
      `migration_068_${col}`,
      Boolean(found),
      found
        ? `nullable=${found.is_nullable} default=${found.column_default ?? "null"}`
        : "columna ausente",
    );
  }

  const { rows: tablesOk } = await db.query(
    `SELECT
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_sales_events') AS sales,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'panel_agent_sessions') AS panel`,
  );
  record(
    "tables_intact",
    tablesOk[0]?.sales === true && tablesOk[0]?.panel === true,
    `agent_sales_events=${tablesOk[0]?.sales} panel_agent_sessions=${tablesOk[0]?.panel}`,
  );

  const { rows: userRows } = await db.query(
    `SELECT au.id, au.email, au.name, up.role, up.company_id
     FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE lower(au.email) = lower($1) AND up.company_id = $2`,
    [CLIENT_EMAIL, COMPANY_ID],
  );
  const user = userRows[0];
  if (!user) {
    throw new Error(`Usuario no encontrado: ${CLIENT_EMAIL}`);
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );

  async function chat(sessionId, message, extra = {}) {
    const res = await fetch(`${BASE}/api/app/agent/chat`, {
      method: "POST",
      headers: {
        Cookie: `${CLIENT_COOKIE}=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        sessionId,
        page: "/app/dashboard",
        userTimezone: "America/Santiago",
        userLocalHour: 15,
        ...extra,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!body.success) {
      throw new Error(
        `chat falló (${res.status}): ${body.error ?? JSON.stringify(body)}`,
      );
    }
    return body;
  }

  console.log("\n=== Caso A: campaña + código google ===");
  const sA = randomUUID();
  const a1 = await chat(sA, "Ayúdame a crear una campaña");
  const aOk1 =
    a1.intent === "send_sms_flow" && /mensaje/i.test(a1.reply);
  record("A1_pide_mensaje", aOk1, `intent=${a1.intent}`);

  const a2 = await chat(sA, "tu codigo de google es 989898");
  const aOk2 =
    a2.intent === "send_sms_flow" &&
    /ya tengo el mensaje/i.test(a2.reply) &&
    !/SMS entrante/i.test(a2.reply) &&
    !/Casos de uso/i.test(a2.reply) &&
    a2.showFeedback === false;
  record("A2_guarda_mensaje", aOk2, `intent=${a2.intent} showFeedback=${a2.showFeedback}`);
  const memA = await getConversationMemory(sA, "web_client");
  record(
    "A2_pending_message",
    memA.pendingSmsMessage === "tu codigo de google es 989898",
    memA.pendingSmsMessage ?? "(vacío)",
  );

  console.log("\n=== Caso B: preparar campaña ===");
  const sB = randomUUID();
  const b1 = await chat(sB, "preparar campaña");
  const bOk =
    b1.intent === "send_sms_flow" &&
    /mensaje/i.test(b1.reply) &&
    !/Respuestas a campañas/i.test(b1.reply);
  if (!bOk) {
    console.log("DEBUG B reply:", b1.reply?.slice(0, 300));
  }
  record("B_preparar_campana", bOk, `intent=${b1.intent}`);

  console.log("\n=== Caso C: título knowledge como mensaje ===");
  const sC = randomUUID();
  await chat(sC, "Ayúdame a crear una campaña");
  const c1 = await chat(sC, "Casos de uso de SMS entrantes");
  const cOk =
    c1.intent === "send_sms_flow" &&
    !/^Casos de uso de SMS entrantes\n\n/m.test(c1.reply) &&
    c1.showFeedback === false;
  const memC = await getConversationMemory(sC, "web_client");
  record(
    "C_titulo_como_sms",
    cOk && memC.pendingSmsMessage === "Casos de uso de SMS entrantes",
    `intent=${c1.intent} pending=${memC.pendingSmsMessage ?? ""}`,
  );

  console.log("\n=== Caso D: cancelar ===");
  const sD = randomUUID();
  await chat(sD, "Ayúdame a crear una campaña");
  const d1 = await chat(sD, "Cancelar");
  const memD = await getConversationMemory(sD, "web_client");
  const pendingD = await findPendingForSessionDb(sD, COMPANY_ID);
  record(
    "D_cancelar",
    d1.intent === "cancel" &&
      !memD.sendSmsFlowStep &&
      !memD.waitingForMessage &&
      pendingD === null,
    `intent=${d1.intent}`,
  );

  console.log("\n=== Caso E: knowledge sin flujo ===");
  const sE = randomUUID();
  const e1 = await chat(sE, "Casos de uso de SMS entrantes");
  const isKnowledge =
    e1.intent === "knowledge" || e1.intent === "inbound_sms_knowledge";
  const lineCount = e1.reply.split("\n").filter((l) => l.trim()).length;
  const eOk =
    isKnowledge &&
    lineCount <= 8 &&
    e1.reply.length <= 900 &&
    e1.showFeedback === true;
  record(
    "E_knowledge_corto",
    eOk,
    `intent=${e1.intent} lines=${lineCount} showFeedback=${e1.showFeedback}`,
  );

  console.log("\n=== Caso F: compra + sí ===");
  const sF = randomUUID();
  const f1 = await chat(sF, "quiero comprar 5000 sms");
  const f2 = await chat(sF, "sí");
  const fOk =
    /link|pago|mercadopago|checkout/i.test(f2.reply) &&
    !/cuántos sms/i.test(f2.reply);
  record("F_compra_si", fOk, `intent=${f2.intent}`);

  console.log("\n=== Caso G: hola reset compra ===");
  const sG = randomUUID();
  await chat(sG, "quiero comprar 5000 sms");
  const g1 = await chat(sG, "hola");
  const gOk =
    g1.intent === "greeting" &&
    g1.resetFlow === true &&
    !/cuántos sms quieres comprar/i.test(g1.reply);
  record("G_hola_reset", gOk, `intent=${g1.intent} resetFlow=${g1.resetFlow}`);

  console.log("\n=== Feedback durante need_message ===");
  const sFb = randomUUID();
  const fb1 = await chat(sFb, "quiero enviar un sms");
  record(
    "feedback_need_message",
    fb1.showFeedback === false,
    `showFeedback=${fb1.showFeedback}`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Resumen ===");
  console.log(`Total: ${results.length} | OK: ${results.length - failed.length} | FAIL: ${failed.length}`);
  if (failed.length) {
    for (const f of failed) {
      console.error(`  ✗ ${f.id}: ${f.detail}`);
    }
    process.exit(1);
  }
  console.log("\n✅ Validación operacional producción completada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.end().catch(() => {}));
