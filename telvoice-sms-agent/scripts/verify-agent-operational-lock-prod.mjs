#!/usr/bin/env node
/**
 * QA producción: bloqueo operacional del Agente Telvoice (casos A–G).
 *
 * Requisitos (.env en VPS o máquina con acceso a prod):
 *   DATABASE_URL  — Postgres Supabase/prod (solo lecturas de schema + memoria)
 *   JWT_SECRET    — para firmar sesión de prueba (no se imprime)
 *
 * Opcional:
 *   PROD_APP_URL / PUBLIC_APP_URL  — default https://agent.telvoice.cl
 *   TEST_COMPANY_ID / INTERNAL_QA_COMPANY_ID — empresa de prueba controlada
 *   TEST_CLIENT_EMAIL              — usuario panel (opcional; si falta, primer usuario de la empresa)
 *   EXPECTED_BUILD_PREFIX          — si se define, exige que health.build empiece así
 *
 * Seguridad — este script NO:
 *   - envía "Confirmo" ni ejecuta pending_action de envío/campaña
 *   - abre links MercadoPago ni confirma pagos
 *   - debita saldo ni escribe wallet_transactions
 *   - llama proveedor aSMSC ni dispara envíos SMS reales
 *   - imprime JWT_SECRET, DATABASE_URL, tokens ni cookies
 *
 * Uso:
 *   npm run verify:agent-operational-lock-prod
 *   EXPECTED_BUILD_PREFIX=ae9059c npm run verify:agent-operational-lock-prod
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";
import { findPendingForSessionDb } from "../dist/services/agent/agentPendingActionsService.js";
import { getConversationMemory } from "../dist/services/agent/agentConversationMemory.js";

const BASE = (
  process.env.PROD_APP_URL ||
  process.env.PUBLIC_APP_URL ||
  "https://agent.telvoice.cl"
)
  .replace(/\/$/, "")
  .replace(/^http:\/\/localhost(:\d+)?$/i, "https://agent.telvoice.cl");

const COMPANY_ID =
  process.env.TEST_COMPANY_ID?.trim() ||
  process.env.INTERNAL_QA_COMPANY_ID?.trim() ||
  "6cd1db92-d5c7-45e0-8548-df8907843350";
const CLIENT_EMAIL = process.env.TEST_CLIENT_EMAIL?.trim() || "";
const CLIENT_COOKIE = "tv_client_session";
const EXPECTED_BUILD_PREFIX = process.env.EXPECTED_BUILD_PREFIX?.trim() ?? "";

const cs = process.env.DATABASE_URL?.trim();
if (!cs || !process.env.JWT_SECRET) {
  console.error(
    "ERROR: DATABASE_URL y JWT_SECRET son requeridos en .env (no se imprimen).",
  );
  process.exit(1);
}

const db = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const results = [];
const securityLog = [];

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "OK" : "FAIL"} ${id}: ${detail}`);
}

function securityNote(note) {
  securityLog.push(note);
}

async function getWalletBalance() {
  const { rows } = await db.query(
    `SELECT available_sms FROM company_sms_wallets WHERE company_id = $1 LIMIT 1`,
    [COMPANY_ID],
  );
  return rows[0]?.available_sms ?? null;
}

async function countRecentWalletDebits(sinceMs) {
  const since = new Date(sinceMs).toISOString();
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
     FROM wallet_transactions
     WHERE company_id = $1
       AND created_at >= $2
       AND sms_amount < 0`,
    [COMPANY_ID, since],
  );
  return rows[0]?.n ?? 0;
}

async function resolveTestUser() {
  if (CLIENT_EMAIL) {
    const { rows } = await db.query(
      `SELECT au.id, au.email, au.name, up.role, up.company_id
       FROM admin_users au
       JOIN user_profiles up ON up.admin_user_id = au.id
       WHERE lower(au.email) = lower($1) AND up.company_id = $2
       LIMIT 1`,
      [CLIENT_EMAIL, COMPANY_ID],
    );
    if (rows[0]) {
      return rows[0];
    }
  }
  const { rows } = await db.query(
    `SELECT au.id, au.email, au.name, up.role, up.company_id
     FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE up.company_id = $1
     ORDER BY au.created_at ASC
     LIMIT 1`,
    [COMPANY_ID],
  );
  return rows[0] ?? null;
}

function assertHealthBuild(health) {
  assert.equal(health.success, true, "health.success debe ser true");
  assert.equal(health.status, "ok", "health.status debe ser ok");
  const build = String(health.build ?? "");
  console.log(`Build detectado: ${build || "(vacío)"}`);
  if (EXPECTED_BUILD_PREFIX) {
    assert.ok(
      build.startsWith(EXPECTED_BUILD_PREFIX),
      `build debe empezar con ${EXPECTED_BUILD_PREFIX}, recibido: ${build}`,
    );
    record(
      "health_build_prefix",
      true,
      `prefix=${EXPECTED_BUILD_PREFIX} build=${build}`,
    );
  } else {
    record("health_build_reported", true, build || "(sin build en health)");
  }
  return build;
}

async function main() {
  const startedAt = Date.now();
  securityNote("Script iniciado — sin Confirmo, sin pagos, sin envíos reales.");

  await db.connect();

  const healthRes = await fetch(`${BASE}/health`);
  const health = await healthRes.json();
  console.log(
    "Health:",
    JSON.stringify({
      success: health.success,
      status: health.status,
      service: health.service,
      build: health.build,
    }),
  );
  const build = assertHealthBuild(health);
  record("health", true, `status=ok build=${build}`);

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
  for (const col of [
    "answer_style",
    "blocked_when_flow_active",
    "content_short",
    "metadata",
    "related_articles",
    "trigger_intents",
  ]) {
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

  const walletBefore = await getWalletBalance();
  record(
    "wallet_snapshot_before",
    true,
    walletBefore != null ? `available_sms=${walletBefore}` : "sin fila wallet (solo se validan débitos)",
  );

  const user = await resolveTestUser();
  if (!user) {
    throw new Error(
      `No hay usuario panel para company_id=${COMPANY_ID}. Define TEST_CLIENT_EMAIL o TEST_COMPANY_ID.`,
    );
  }
  console.log(`Usuario QA: ${user.email} (company ${COMPANY_ID.slice(0, 8)}…)`);

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  securityNote("Sesión JWT de prueba creada (valor no logueado).");

  async function chat(sessionId, message, extra = {}) {
    assert.notEqual(
      String(message).trim().toLowerCase(),
      "confirmo",
      "Seguridad: este script no debe enviar Confirmo",
    );
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
      throw new Error(`chat falló (${res.status}): ${body.error ?? "error desconocido"}`);
    }
    return body;
  }

  console.log("\n=== Caso A: campaña + código google ===");
  const sA = randomUUID();
  const a1 = await chat(sA, "Ayúdame a crear una campaña");
  record(
    "A1_pide_mensaje",
    a1.intent === "send_sms_flow" && /mensaje/i.test(a1.reply),
    `intent=${a1.intent}`,
  );

  const a2 = await chat(sA, "tu codigo de google es 989898");
  const memA = await getConversationMemory(sA, "web_client");
  record(
    "A2_guarda_mensaje",
    a2.intent === "send_sms_flow" &&
      /ya tengo el mensaje/i.test(a2.reply) &&
      !/SMS entrante/i.test(a2.reply) &&
      !/Casos de uso/i.test(a2.reply) &&
      a2.showFeedback === false,
    `intent=${a2.intent} showFeedback=${a2.showFeedback}`,
  );
  record(
    "A2_pending_message",
    memA.pendingSmsMessage === "tu codigo de google es 989898",
    memA.pendingSmsMessage ?? "(vacío)",
  );
  record(
    "A2_step_recipient",
    memA.sendSmsFlowStep === "need_recipient_or_csv",
    `step=${memA.sendSmsFlowStep ?? "(vacío)"}`,
  );

  console.log("\n=== Caso B: preparar campaña ===");
  const sB = randomUUID();
  const b1 = await chat(sB, "preparar campaña");
  record(
    "B_preparar_campana",
    b1.intent === "send_sms_flow" &&
      /mensaje/i.test(b1.reply) &&
      !/Respuestas a campañas/i.test(b1.reply),
    `intent=${b1.intent}`,
  );

  console.log("\n=== Caso C: título knowledge como mensaje ===");
  const sC = randomUUID();
  await chat(sC, "Ayúdame a crear una campaña");
  const c1 = await chat(sC, "Casos de uso de SMS entrantes");
  const memC = await getConversationMemory(sC, "web_client");
  record(
    "C_titulo_como_sms",
    c1.intent === "send_sms_flow" &&
      c1.showFeedback === false &&
      memC.pendingSmsMessage === "Casos de uso de SMS entrantes" &&
      !/^Casos de uso de SMS entrantes\n\n/m.test(c1.reply),
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
  record(
    "E_knowledge_corto",
    isKnowledge &&
      lineCount <= 8 &&
      e1.reply.length <= 900 &&
      e1.showFeedback === true,
    `intent=${e1.intent} lines=${lineCount} len=${e1.reply.length} showFeedback=${e1.showFeedback}`,
  );

  console.log("\n=== Caso F: compra + sí (solo link, sin pagar) ===");
  const sF = randomUUID();
  await chat(sF, "quiero comprar 5000 sms");
  const f2 = await chat(sF, "sí");
  const hasPaymentHint = /link|pago|mercadopago|checkout/i.test(f2.reply);
  record(
    "F_compra_si",
    hasPaymentHint && !/cuántos sms/i.test(f2.reply),
    `intent=${f2.intent} paymentHint=${hasPaymentHint}`,
  );
  if (f2.paymentUrl) {
    securityNote("Caso F generó paymentUrl — no se abrió ni se pagó.");
    record("F_no_payment_url_opened", true, "paymentUrl presente pero no consumido");
  }

  console.log("\n=== Caso G: hola reset compra ===");
  const sG = randomUUID();
  await chat(sG, "quiero comprar 5000 sms");
  const g1 = await chat(sG, "hola");
  record(
    "G_hola_reset",
    g1.intent === "greeting" &&
      g1.resetFlow === true &&
      !/cuántos sms quieres comprar/i.test(g1.reply),
    `intent=${g1.intent} resetFlow=${g1.resetFlow}`,
  );

  console.log("\n=== Feedback durante need_message ===");
  const sFb = randomUUID();
  const fb1 = await chat(sFb, "quiero enviar un sms");
  record(
    "feedback_need_message",
    fb1.showFeedback === false,
    `showFeedback=${fb1.showFeedback}`,
  );

  const walletAfter = await getWalletBalance();
  const debits = await countRecentWalletDebits(startedAt);
  const walletOk =
    debits === 0 &&
    (walletBefore == null || walletAfter == null || walletBefore === walletAfter);
  record(
    "wallet_unchanged",
    walletOk,
    `before=${walletBefore} after=${walletAfter} debits=${debits}`,
  );
  securityNote("Sin débitos wallet_transactions durante la ejecución.");

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Seguridad ===");
  for (const note of securityLog) {
    console.log(`  • ${note}`);
  }
  console.log("  • Confirmo: no enviado en ningún turno");
  console.log("  • MercadoPago: no pagado");
  console.log("  • aSMSC / envíos SMS: no invocados");

  console.log("\n=== Resumen ===");
  console.log(`Build: ${build}`);
  console.log(`Total: ${results.length} | OK: ${results.length - failed.length} | FAIL: ${failed.length}`);
  if (failed.length) {
    for (const f of failed) {
      console.error(`  ✗ ${f.id}: ${f.detail}`);
    }
    process.exit(1);
  }
  console.log("\n✅ Validación operacional producción completada (A–G).");
}

main()
  .catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg.replace(process.env.JWT_SECRET ?? "", "[REDACTED]"));
    process.exit(1);
  })
  .finally(() => db.end().catch(() => {}));
