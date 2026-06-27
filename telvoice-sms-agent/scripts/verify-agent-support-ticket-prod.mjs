#!/usr/bin/env node
/**
 * QA producción: flujo tickets de soporte desde agente panel (casos A–G + idempotencia + DB).
 *
 * Requisitos (.env):
 *   DATABASE_URL, JWT_SECRET
 *
 * Opcional:
 *   PROD_APP_URL / PUBLIC_APP_URL — default https://agent.telvoice.cl
 *   TEST_COMPANY_ID / INTERNAL_QA_COMPANY_ID — default demo QA
 *   TEST_CLIENT_EMAIL — default primer usuario de la empresa
 *   EXPECTED_BUILD_PREFIX — exige health.build con ese prefijo
 *
 * Seguridad — NO envía Confirmo SMS, no pagos, no débitos wallet.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";
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
const CLIENT_EMAIL = process.env.TEST_CLIENT_EMAIL?.trim() || "cliente.demo@telvoice.cl";
const CLIENT_COOKIE = "tv_client_session";
const EXPECTED_BUILD_PREFIX = process.env.EXPECTED_BUILD_PREFIX?.trim() ?? "";
const QA_MSG = `QA agente — No se acreditó mi compra de SMS de prueba ${Date.now()}`;

const cs = process.env.DATABASE_URL?.trim();
if (!cs || !process.env.JWT_SECRET) {
  console.error("ERROR: DATABASE_URL y JWT_SECRET requeridos.");
  process.exit(1);
}

const db = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const results = [];

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "OK" : "FAIL"} ${id}: ${detail}`);
}

async function resolveTestUser() {
  const { rows } = await db.query(
    `SELECT au.id, au.email, au.name, up.role, up.company_id
     FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE lower(au.email) = lower($1) AND up.company_id = $2
     LIMIT 1`,
    [CLIENT_EMAIL, COMPANY_ID],
  );
  if (rows[0]) return rows[0];
  const { rows: fallback } = await db.query(
    `SELECT au.id, au.email, au.name, up.role, up.company_id
     FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE up.company_id = $1
     ORDER BY au.created_at ASC LIMIT 1`,
    [COMPANY_ID],
  );
  return fallback[0] ?? null;
}

async function main() {
  const startedAt = Date.now();
  await db.connect();

  const healthRes = await fetch(`${BASE}/health`);
  const health = await healthRes.json();
  const build = String(health.build ?? "");
  console.log("Health:", JSON.stringify({ success: health.success, status: health.status, build }));
  record("health", health.success === true && health.status === "ok", `build=${build}`);
  if (EXPECTED_BUILD_PREFIX) {
    record(
      "health_build_prefix",
      build.startsWith(EXPECTED_BUILD_PREFIX),
      `expected=${EXPECTED_BUILD_PREFIX} got=${build}`,
    );
  }

  const user = await resolveTestUser();
  if (!user) throw new Error(`Sin usuario QA para ${COMPANY_ID}`);
  console.log(`Usuario QA: ${user.email}`);

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
        page: "/app/send-sms",
        userTimezone: "America/Santiago",
        userLocalHour: 15,
        metadata: { page: "/app/send-sms", currentPath: "/app/send-sms" },
        ...extra,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!body.success) {
      throw new Error(`chat (${res.status}): ${body.error ?? "error"}`);
    }
    return body;
  }

  const { rows: walletBefore } = await db.query(
    `SELECT available_sms FROM company_sms_wallets WHERE company_id = $1 LIMIT 1`,
    [COMPANY_ID],
  );
  const smsBefore = walletBefore[0]?.available_sms ?? null;

  // Caso A
  console.log("\n=== Caso A: ticket desde idle ===");
  const sA = randomUUID();
  const a1 = await chat(sA, "ticket");
  record(
    "A_intro",
    a1.intent === "support_ticket" && /puedo crear un ticket/i.test(a1.reply),
    `intent=${a1.intent} showFeedback=${a1.showFeedback}`,
  );
  record(
    "A_no_knowledge",
    !/tipo P y T/i.test(a1.reply) && !/SMS entrante/i.test(a1.reply),
    "sin artículo knowledge",
  );
  record("A_no_feedback", a1.showFeedback === false, `showFeedback=${a1.showFeedback}`);
  const actionsA = (a1.suggestedActions ?? []).map((x) => x.label);
  record(
    "A_quick_actions",
    actionsA.includes("Problema con compra o saldo") && actionsA.includes("Cancelar"),
    actionsA.join(", "),
  );

  // Caso B
  console.log("\n=== Caso B: descripción y review ===");
  const sB = randomUUID();
  await chat(sB, "ticket");
  const b2 = await chat(sB, QA_MSG);
  record(
    "B_review",
    b2.intent === "support_ticket" && /Preparé este ticket/i.test(b2.reply),
    `intent=${b2.intent}`,
  );
  record(
    "B_category",
    /Compra y pago|Saldo SMS/i.test(b2.reply),
    b2.reply.split("\n").find((l) => l.includes("Categoría")) ?? "",
  );
  record(
    "B_confirm_prompt",
    /Quieres que lo cree ahora/i.test(b2.reply),
    "pregunta confirmación",
  );
  const memB = await getConversationMemory(sB, "web_client");
  record("B_step", memB.supportTicketFlowStep === "review_ticket", memB.supportTicketFlowStep ?? "");

  // Caso C — creación real QA
  console.log("\n=== Caso C: creación real ===");
  const sC = randomUUID();
  await chat(sC, "ticket");
  await chat(sC, QA_MSG);
  const c3 = await chat(sC, "Crear ticket");
  const tlvMatch = c3.reply.match(/TLV-\d+/);
  record(
    "C_created",
    c3.intent === "support_ticket" && Boolean(tlvMatch),
    tlvMatch ? tlvMatch[0] : c3.reply.slice(0, 120),
  );
  const ticketCode = tlvMatch?.[0] ?? null;
  const verAction = (c3.suggestedActions ?? []).find((a) => /ver ticket/i.test(a.label ?? ""));
  record("C_ver_ticket_action", Boolean(verAction?.href), verAction?.href ?? "sin href");

  if (ticketCode) {
    const { rows: tRows } = await db.query(
      `SELECT ticket_code, company_id, user_id, source, status, category, priority, message, metadata
       FROM client_support_tickets WHERE ticket_code = $1 LIMIT 1`,
      [ticketCode],
    );
    const t = tRows[0];
    record("C_db_exists", Boolean(t), ticketCode);
    if (t) {
      record("C_db_company", t.company_id === COMPANY_ID, t.company_id);
      record("C_db_source", t.source === "agent_chat", t.source);
      record("C_db_status", t.status === "Abierto", t.status);
      record("C_db_message", t.message === QA_MSG, t.message?.slice(0, 60));
      record(
        "C_db_metadata",
        t.metadata && typeof t.metadata === "object" && Object.keys(t.metadata).length > 0,
        JSON.stringify(t.metadata).slice(0, 120),
      );
    }
  }

  // Idempotencia
  console.log("\n=== Idempotencia ===");
  if (ticketCode) {
    const c4 = await chat(sC, "Crear ticket");
    const sameCode = c4.reply.includes(ticketCode);
    const { rows: dupCount } = await db.query(
      `SELECT COUNT(*)::int AS n FROM client_support_tickets
       WHERE company_id = $1 AND message = $2 AND source = 'agent_chat'
         AND created_at >= NOW() - INTERVAL '5 minutes'`,
      [COMPANY_ID, QA_MSG],
    );
    record(
      "idempotency",
      sameCode && (dupCount[0]?.n ?? 0) <= 1,
      `sameCode=${sameCode} count=${dupCount[0]?.n}`,
    );
  } else {
    record("idempotency", false, "sin ticket creado en C");
  }

  // Caso D
  console.log("\n=== Caso D: ticket interrumpe SMS ===");
  const sD = randomUUID();
  await chat(sD, "quiero enviar un sms");
  const d2 = await chat(sD, "ticket");
  const memD = await getConversationMemory(sD, "web_client");
  record(
    "D_interrupt",
    d2.intent === "support_ticket" && /puedo crear un ticket/i.test(d2.reply),
    `intent=${d2.intent}`,
  );
  record("D_no_pending_sms", !memD.pendingSmsMessage, memD.pendingSmsMessage ?? "(limpio)");
  record("D_ticket_step", memD.supportTicketFlowStep === "need_issue", memD.supportTicketFlowStep ?? "");

  // Caso E
  console.log("\n=== Caso E: tu ticket es 1234 = SMS ===");
  const sE = randomUUID();
  await chat(sE, "quiero enviar un sms");
  const e2 = await chat(sE, "tu ticket es 1234");
  const memE = await getConversationMemory(sE, "web_client");
  record(
    "E_sms_body",
    e2.intent === "send_sms_flow" && memE.pendingSmsMessage === "tu ticket es 1234",
    `intent=${e2.intent} msg=${memE.pendingSmsMessage}`,
  );
  record("E_no_support", e2.intent !== "support_ticket", e2.intent);

  // Caso F
  console.log("\n=== Caso F: knowledge no interrumpe ticket ===");
  const sF = randomUUID();
  await chat(sF, "ticket");
  const f2 = await chat(sF, "diferencia entre SMS tipo P y T");
  record(
    "F_as_description",
    f2.intent === "support_ticket" && /Preparé este ticket/i.test(f2.reply),
    `intent=${f2.intent}`,
  );
  record(
    "F_no_article",
    !/artículo/i.test(f2.reply) && !/Relacionado/i.test(f2.reply),
    "sin respuesta knowledge",
  );

  // Caso G
  console.log("\n=== Caso G: cancelar ===");
  const sG = randomUUID();
  await chat(sG, "ticket");
  await chat(sG, "problema con api");
  const g3 = await chat(sG, "cancelar");
  const memG = await getConversationMemory(sG, "web_client");
  record("G_cancel_reply", /cancel/i.test(g3.reply), g3.reply.slice(0, 80));
  record("G_cleared", !memG.supportTicketFlowStep, memG.supportTicketFlowStep ?? "limpio");

  const { rows: walletAfter } = await db.query(
    `SELECT available_sms FROM company_sms_wallets WHERE company_id = $1 LIMIT 1`,
    [COMPANY_ID],
  );
  const smsAfter = walletAfter[0]?.available_sms ?? null;
  record(
    "wallet_unchanged",
    smsBefore == null || smsAfter === smsBefore,
    `before=${smsBefore} after=${smsAfter}`,
  );

  const { rows: debits } = await db.query(
    `SELECT COUNT(*)::int AS n FROM wallet_transactions
     WHERE company_id = $1 AND created_at >= $2 AND sms_amount < 0`,
    [COMPANY_ID, new Date(startedAt).toISOString()],
  );
  record("no_wallet_debits", (debits[0]?.n ?? 0) === 0, `debits=${debits[0]?.n}`);

  await db.end();

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Resumen ===");
  console.log(`Total: ${results.length} | OK: ${results.length - failed.length} | FAIL: ${failed.length}`);
  if (ticketCode) console.log(`Ticket QA: ${ticketCode}`);
  if (failed.length) {
    for (const f of failed) console.log(`  - ${f.id}: ${f.detail}`);
    process.exit(1);
  }
  console.log("\nOK — support ticket flow producción verificado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
