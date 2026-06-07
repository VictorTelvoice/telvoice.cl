#!/usr/bin/env node
/**
 * QA producción: saludo puro reinicia flujos (sin pagos ni envíos reales).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";
import {
  createPendingActionDb,
  findPendingForSessionDb,
} from "../dist/services/agent/agentPendingActionsService.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../dist/services/agent/agentConversationMemory.js";
import { PURCHASE_FLOW_STEP } from "../dist/services/agent/agentPurchaseFlow.js";
import { SEND_SMS_FLOW_STEP } from "../dist/services/agent/agentSendSmsFlowUi.js";
import { calculateTelvoiceQuote } from "../dist/services/telvoicePricingService.js";

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

async function main() {
  await db.connect();

  const healthRes = await fetch(`${BASE}/health`);
  const health = await healthRes.json();
  console.log("Health:", JSON.stringify(health));
  assert.equal(health.status, "ok");
  assert.match(
    health.build ?? "",
    /^db233d6/i,
    `build esperado db233d6*, recibido: ${health.build}`,
  );

  const { rows } = await db.query(
    `SELECT au.id, au.email, au.name, up.role, up.company_id
     FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE lower(au.email) = lower($1) AND up.company_id = $2`,
    [CLIENT_EMAIL, COMPANY_ID],
  );
  const user = rows[0];
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
        userLocalHour: extra.userLocalHour ?? 15,
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

  console.log("\n=== Prueba 1: compra + hola ===");
  const s1 = randomUUID();
  const q1 = await chat(s1, "quiero comprar 5000 sms");
  assert.match(q1.reply, /5\.?000/i);
  assert.match(q1.reply, /53\.?550/);
  const h1 = await chat(s1, "hola", { userLocalHour: 15 });
  assert.equal(h1.intent, "greeting");
  assert.match(h1.reply, /Buenas tardes/i);
  assert.match(h1.reply, /Agente Telvoice/i);
  assert.ok(!/revisemos el precio/i.test(h1.reply));
  assert.ok(!/cuántos sms quieres comprar/i.test(h1.reply));
  assert.ok(!/mercadopago/i.test(h1.reply));
  assert.equal(h1.resetFlow, true);
  assert.equal(h1.clearCsvUpload, true);
  assert.equal(h1.showAttachButton, false);
  const mem1 = await getConversationMemory(s1, "web_client");
  assert.equal(mem1.purchaseFlowStep, undefined);
  console.log("OK prueba 1");

  console.log("\n=== Prueba 2: hola con intención ===");
  const s2 = randomUUID();
  const q2 = await chat(s2, "hola quiero comprar 5000 sms");
  assert.notEqual(q2.intent, "greeting");
  assert.match(q2.reply, /5\.?000/i);
  assert.match(q2.reply, /53\.?550/);
  console.log("OK prueba 2");

  console.log("\n=== Prueba 3: CSV pending + hola + Confirmo ===");
  const s3 = randomUUID();
  const quote = await calculateTelvoiceQuote(100);
  await updateConversationMemory(
    s3,
    "web_client",
    {
      sendSmsFlowStep: SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
      pendingSmsMessage: "QA greeting reset",
      pendingCsvUploadId: randomUUID(),
      purchaseFlowStep: PURCHASE_FLOW_STEP.REVIEW_QUOTE,
      pendingPurchaseQuote: quote,
    },
    COMPANY_ID,
  );
  await createPendingActionDb({
    type: "send_campaign_csv",
    summary: "QA prod greeting reset",
    payload: {
      message: "QA",
      valid_recipients: ["56900000001"],
    },
    context: {
      channel: "web_client",
      companyId: COMPANY_ID,
      userId: user.id,
      sessionId: s3,
    },
  });
  const h3 = await chat(s3, "hola");
  assert.equal(h3.intent, "greeting");
  assert.ok(!/revisé tu planilla/i.test(h3.reply));
  assert.equal(h3.clearCsvUpload, true);
  const pendingAfter = await findPendingForSessionDb(s3, COMPANY_ID);
  assert.equal(pendingAfter, null);
  const c3 = await chat(s3, "Confirmo");
  assert.ok(!/Campaña aceptada/i.test(c3.reply));
  console.log("OK prueba 3");

  console.log("\n=== Prueba 4: envío SMS activo + hola ===");
  const s4 = randomUUID();
  await chat(s4, "quiero enviar un sms");
  await chat(s4, "Mensaje de prueba QA saludo");
  const h4 = await chat(s4, "hola");
  assert.equal(h4.intent, "greeting");
  assert.ok(!/número de teléfono/i.test(h4.reply) || /qué quieres hacer/i.test(h4.reply));
  const mem4 = await getConversationMemory(s4, "web_client");
  assert.equal(mem4.pendingSmsMessage, undefined);
  assert.equal(mem4.pendingSmsPhone, undefined);
  console.log("OK prueba 4");

  console.log("\n=== Prueba 5: hora local ===");
  for (const [hour, phrase] of [
    [9, "Buenos días"],
    [15, "Buenas tardes"],
    [22, "Buenas noches"],
  ]) {
    const sh = randomUUID();
    const rh = await chat(sh, "hola", { userLocalHour: hour });
    assert.match(rh.reply, new RegExp(phrase, "i"), `hora ${hour}`);
  }
  console.log("OK prueba 5");

  const firstName =
    (user.name || "").trim().split(/\s+/)[0] || "Usuario";
  console.log(`\nNombre sesión: ${user.name} → saludo usa primer nombre si aplica`);

  console.log("\n=== Artefactos (local dist) ===");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const appRoot = process.cwd();
  const greetJs = path.join(
    appRoot,
    "dist/services/agent/agentGreetingReset.js",
  );
  const coreJs = path.join(appRoot, "dist/services/agent/agentCore.js");
  assert.ok(fs.existsSync(greetJs), "falta agentGreetingReset.js");
  const coreSrc = fs.readFileSync(coreJs, "utf8");
  assert.ok(
    coreSrc.includes("handlePureGreetingReset") ||
      coreSrc.includes("isPureGreeting"),
    "agentCore sin greeting reset",
  );
  const widgetSrc = fs.readFileSync(
    path.join(appRoot, "dist/components/app/client-agent-widget.js"),
    "utf8",
  );
  assert.ok(widgetSrc.includes("userLocalHour"), "widget sin userLocalHour");
  assert.ok(widgetSrc.includes("userTimezone"), "widget sin userTimezone");

  console.log("\n✅ Todas las pruebas de saludo puro en producción pasaron.");
  console.log(`Build: ${health.build}`);
  console.log(`Usuario QA: ${user.email} (${firstName})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.end().catch(() => {}));
