#!/usr/bin/env node
/**
 * Auditoría operacional del flujo de compra SMS en el agente panel (read-only, sin envíos).
 *
 * Uso:
 *   DATABASE_URL=... node scripts/audit-agent-purchase-prod.mjs --company-id <uuid>
 *   DATABASE_URL=... node scripts/audit-agent-purchase-prod.mjs --company-id <uuid> --session-id <uuid>
 *
 * Variables:
 *   DATABASE_URL (requerido)
 *   TEST_COMPANY_ID (alternativa a --company-id)
 *
 * No ejecuta Confirmo ni debita saldo. No incluye credenciales en el código.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

function parseArgs(argv) {
  const out = { companyId: process.env.TEST_COMPANY_ID?.trim() ?? "", sessionId: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--company-id" && argv[i + 1]) {
      out.companyId = argv[++i];
    } else if (a === "--session-id" && argv[i + 1]) {
      out.sessionId = argv[++i];
    } else if (a === "--help" || a === "-h") {
      console.log(`Uso: node scripts/audit-agent-purchase-prod.mjs --company-id <uuid> [--session-id <uuid>]`);
      process.exit(0);
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const COMPANY_ID = args.companyId;
if (!COMPANY_ID) {
  console.error("Indica --company-id o TEST_COMPANY_ID");
  process.exit(1);
}

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const { runAgentCore } = await import("../dist/services/agent/agentCore.js");

const sessionId = args.sessionId || randomUUID();
const results = [];

function pass(id, detail) {
  results.push({ id, ok: true, detail });
  console.log(`✓ ${id}: ${detail}`);
}

function fail(id, detail) {
  results.push({ id, ok: false, detail });
  console.log(`✗ ${id}: ${detail}`);
}

function checkReply(id, reply, patterns, forbidden = []) {
  const r = reply ?? "";
  for (const p of forbidden) {
    if (p.test(r)) {
      fail(id, `contiene prohibido: ${p}`);
      return null;
    }
  }
  for (const p of patterns) {
    if (!p.test(r)) {
      fail(id, `falta: ${p} en «${r.slice(0, 120)}…»`);
      return null;
    }
  }
  pass(id, r.slice(0, 100).replace(/\n/g, " ") + "…");
  return r;
}

async function chat(message, extra = {}) {
  return runAgentCore({
    channel: "web_client",
    message,
    sessionId,
    companyId: COMPANY_ID,
    userId: null,
    metadata: { page: "/app/contacts", ...extra },
  });
}

async function countAgentOrders() {
  const client = new pg.Client({
    connectionString: cs,
    ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const r = await client.query(
      `select id, payment_status, credit_status, metadata, created_at
       from sms_orders
       where company_id = $1
         and metadata->>'source' = 'agent_panel'
         and created_at > now() - interval '2 hours'
       order by created_at desc`,
      [COMPANY_ID],
    );
    return r.rows;
  } finally {
    await client.end();
  }
}

async function countSendPending() {
  const client = new pg.Client({
    connectionString: cs,
    ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const r = await client.query(
      `select id, action_type, status, created_at
       from agent_pending_actions
       where company_id = $1 and session_id = $2
         and action_type in ('send_campaign_csv','send_single_sms')
         and status = 'pending'
         and created_at > now() - interval '2 hours'`,
      [COMPANY_ID, sessionId],
    );
    return r.rows;
  } finally {
    await client.end();
  }
}

console.log("=== audit-agent-purchase-prod ===\n");
console.log("company:", COMPANY_ID);
console.log("session:", sessionId, "\n");

let r = await chat("quiero comprar mensajes");
checkReply(
  "1-compra-sin-cantidad",
  r.reply,
  [/cuántos sms|cuantos sms/i, /1\.000|1000/i, /ejemplo/i],
  [/mercadopago\.com/i],
);
if (!r.orderId && !r.paymentUrl) {
  pass("1-sin-orden", "no creó orden");
} else {
  fail("1-sin-orden", `orderId=${r.orderId}`);
}

r = await chat("quiero comprar 30000 mensajes");
checkReply("2-30k", r.reply, [
  /30\.?000/i,
  /precio unitario neto: \$7/i,
  /210\.?000/,
  /39\.?900/,
  /249\.?900/,
  /link de pago|generar/i,
], [/\*\*30\.000 SMS\*\*/]);
if (/Perfecto, revisemos el precio/i.test(r.reply) && /\*\*30\.000 SMS\*\*/.test(r.reply)) {
  fail("2-sin-duplicado", "resumen markdown duplicado");
} else if (/Perfecto, revisemos el precio/i.test(r.reply)) {
  pass("2-sin-duplicado", "sin prefijo comercial duplicado");
} else {
  pass("2-sin-duplicado", "copy compra único");
}

r = await chat("quiero comprar 12500 sms");
checkReply("3-12.5k", r.reply, [/13\.?000/, /precio unitario neto: \$8/i, /123\.?760/]);

r = await chat("comprar 70000 sms");
checkReply("4-70k", r.reply, [/70\.?000/, /precio unitario neto: \$6/i, /499\.?800/]);

r = await chat("quiero comprar 150000 sms");
checkReply("5-150k-manual", r.reply, [
  /150\.?000/,
  /precio unitario neto: \$5|unitario neto: \$5/i,
  /892\.?500/,
  /120\.?000|ejecutivo|comercial/i,
]);
if (r.paymentUrl) {
  fail("5-no-checkout", "generó paymentUrl en manual");
} else {
  pass("5-no-checkout", "sin checkout automático");
}

await chat("quiero comprar 30000 mensajes");
const beforeOrders = await countAgentOrders();
r = await chat("generar link de pago");
const afterFirst = await countAgentOrders();
r = await chat("generar link de pago");
const afterSecond = await countAgentOrders();

if (r.paymentUrl && /mercadopago|checkout/i.test(r.paymentUrl)) {
  pass("6-link", `paymentUrl presente`);
} else if (r.reply && /mercadopago|pagar aquí|http/i.test(r.reply)) {
  pass("6-link", "URL en reply");
} else {
  fail("6-link", `sin URL: orderId=${r.orderId}`);
}

const newOrders1 = afterFirst.length - beforeOrders.length;
const newOrders2 = afterSecond.length - afterFirst.length;
if (newOrders1 <= 1 && newOrders2 === 0) {
  pass("6-no-duplicado", `órdenes nuevas: +${newOrders1} luego +${newOrders2}`);
} else {
  fail("6-no-duplicado", `+${newOrders1} +${newOrders2} órdenes`);
}

const orderRow = afterSecond[0] ?? afterFirst[0];
if (orderRow?.metadata?.source === "agent_panel") {
  pass("6-metadata", `source=agent_panel order=${orderRow.id}`);
} else if (orderRow) {
  fail("6-metadata", `source=${orderRow.metadata?.source}`);
}

const balClient = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await balClient.connect();
const bal = await balClient.query(
  `select available_sms from company_sms_wallets where company_id = $1`,
  [COMPANY_ID],
);
await balClient.end();
const available = bal.rows[0]?.available_sms ?? 0;
console.log(`\nSaldo actual empresa: ${available} SMS`);

const insufSession = randomUUID();
const { handleInsufficientBalanceOffer } = await import(
  "../dist/services/agent/agentPurchaseFlow.js"
);
const insuf = await handleInsufficientBalanceOffer({
  ctx: {
    channel: "web_client",
    companyId: COMPANY_ID,
    userId: null,
    sessionId: insufSession,
  },
  sessionId: insufSession,
  route: {
    intent: "send_sms_flow",
    confidence: 0.9,
    commercialQuantity: null,
    requiresAuth: true,
    operationalCommand: null,
  },
  kind: "csv",
  requiredSms: available + 500,
  availableSms: available,
  message: "Mensaje auditoría saldo",
  csvUploadId: randomUUID(),
  senderId: "TELVOICE",
});

if (
  /faltan/i.test(insuf.reply) &&
  /generar link de pago|link de pago/i.test(insuf.reply) &&
  !insuf.requiresConfirmation &&
  !/Confirmo/i.test(insuf.suggestedActions?.map((a) => a.label).join(" ") ?? "")
) {
  pass("7-insuficiente", "oferta compra sin Confirmo envío");
} else {
  fail("7-insuficiente", insuf.reply?.slice(0, 80) ?? "");
}

const pendingSend = await countSendPending();
if (pendingSend.length === 0) {
  pass("7-sin-pending-envio", "sin pending_action send");
} else {
  fail("7-sin-pending-envio", `${pendingSend.length} pending send`);
}

const failed = results.filter((x) => !x.ok);
console.log(`\n=== Resumen: ${results.length - failed.length}/${results.length} OK ===`);
if (failed.length) {
  console.log("Fallos:", failed.map((f) => f.id).join(", "));
  process.exit(1);
}
