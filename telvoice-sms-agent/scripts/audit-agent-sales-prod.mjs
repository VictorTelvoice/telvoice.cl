#!/usr/bin/env node
/**
 * Validación producción — Ventas del Agente (read-only + flujo agente sin pago).
 *
 * Uso:
 *   DATABASE_URL=... node scripts/audit-agent-sales-prod.mjs --company-id <uuid>
 *
 * Variables: DATABASE_URL, TEST_COMPANY_ID
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

function parseArgs(argv) {
  const out = {
    companyId: process.env.TEST_COMPANY_ID?.trim() ?? "",
    sessionId: randomUUID(),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--company-id" && argv[i + 1]) out.companyId = argv[++i];
    else if (a === "--session-id" && argv[i + 1]) out.sessionId = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv);
const COMPANY_ID = args.companyId;
const sessionId = args.sessionId;

if (!COMPANY_ID) {
  console.error("Indica --company-id o TEST_COMPANY_ID");
  process.exit(1);
}

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const ssl = cs.includes("supabase") ? { rejectUnauthorized: false } : undefined;
const db = new pg.Client({ connectionString: cs, ssl });
await db.connect();

async function dbQuery(sql, params = []) {
  return db.query(sql, params);
}

async function checkMigration053() {
  const cols = await dbQuery(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'agent_sales_events'
     ORDER BY ordinal_position`,
  );
  const names = cols.rows.map((r) => r.column_name);
  const required = [
    "id",
    "created_at",
    "channel",
    "source",
    "session_id",
    "company_id",
    "user_id",
    "event_type",
    "quantity_sms",
    "unit_price_net",
    "subtotal_net",
    "iva",
    "total_clp",
    "order_id",
    "payment_status",
    "metadata",
  ];
  const missing = required.filter((c) => !names.includes(c));
  return { exists: names.length > 0, columns: names, missing };
}

async function countEvents(sinceMinutes = 120) {
  try {
    const r = await dbQuery(
      `SELECT event_type, count(*)::int AS n
       FROM agent_sales_events
       WHERE company_id = $1 AND created_at > now() - ($2 || ' minutes')::interval
       GROUP BY event_type
       ORDER BY event_type`,
      [COMPANY_ID, String(sinceMinutes)],
    );
    const total = await dbQuery(
      `SELECT count(*)::int AS n FROM agent_sales_events
       WHERE company_id = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
      [COMPANY_ID, String(sinceMinutes)],
    );
    return { byType: r.rows, total: total.rows[0]?.n ?? 0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), byType: [], total: 0 };
  }
}

async function countEventsForSession(types) {
  const r = await dbQuery(
    `SELECT event_type, count(*)::int AS n
     FROM agent_sales_events
     WHERE company_id = $1 AND session_id = $2
       AND event_type = ANY($3::text[])
       AND created_at > now() - interval '2 hours'
     GROUP BY event_type`,
    [COMPANY_ID, sessionId, types],
  );
  return r.rows;
}

async function agentOrdersSince() {
  const r = await dbQuery(
    `SELECT id, payment_status, amount, metadata, created_at
     FROM sms_orders
     WHERE company_id = $1 AND metadata->>'source' = 'agent_panel'
       AND created_at > now() - interval '2 hours'
     ORDER BY created_at DESC`,
    [COMPANY_ID],
  );
  return r.rows;
}

/** Usar API prod (VPS tiene MercadoPago); local agentCore no tiene MP token. */
const PROD_BASE = (
  process.env.PROD_APP_URL ||
  process.env.PUBLIC_APP_URL ||
  "https://agent.telvoice.cl"
)
  .replace(/\/$/, "")
  .replace(/^http:\/\/localhost(:\d+)?$/i, "https://agent.telvoice.cl");

const CLIENT_COOKIE = "tv_client_session";

async function loadLicantravelToken() {
  const email = process.env.LICANTRAVEL_EMAIL?.trim() || "licantravel@gmail.com";
  const { rows } = await db.query(
    `SELECT au.id, au.email, au.name, up.role
     FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE lower(au.email) = lower($1) AND up.company_id = $2`,
    [email, COMPANY_ID],
  );
  const u = rows[0];
  if (!u || !process.env.JWT_SECRET) return null;
  const jwt = await import("jsonwebtoken");
  return jwt.default.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
}

async function chat(message, sid = sessionId) {
  const token = await loadLicantravelToken();
  if (!token) {
    const { runAgentCore } = await import("../dist/services/agent/agentCore.js");
    return runAgentCore({
      channel: "web_client",
      message,
      sessionId: sid,
      companyId: COMPANY_ID,
      userId: null,
    });
  }
  const res = await fetch(`${PROD_BASE}/api/app/agent/chat`, {
    method: "POST",
    headers: {
      Cookie: `${CLIENT_COOKIE}=${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, sessionId: sid, page: "/app" }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 || !body.success) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

console.log("=== audit-agent-sales-prod ===\n");

const mig = await checkMigration053();
if (!mig.exists) {
  console.log("✗ Migración 053: tabla agent_sales_events NO existe");
  console.log("  Ejecutar: npm run migrate:agent-core (con 053 en el script)");
} else if (mig.missing.length) {
  console.log("✗ Columnas faltantes:", mig.missing.join(", "));
} else {
  console.log("✓ Migración 053: tabla y columnas OK");
}

const company = await dbQuery(
  `SELECT id, name FROM companies WHERE id = $1`,
  [COMPANY_ID],
);
console.log("Empresa:", company.rows[0]?.name ?? COMPANY_ID);
console.log("Sesión prueba:", sessionId, "\n");

const ordersBefore = await agentOrdersSince();
const eventsBefore = await countEventsForSession([
  "quote_created",
  "payment_link_created",
  "payment_link_reused",
  "manual_quote_requested",
  "insufficient_balance_detected",
]);

let r = await chat("quiero comprar 30000 mensajes");
const okA =
  /30\.?000/i.test(r.reply ?? "") &&
  /249\.?900|precio unitario/i.test(r.reply ?? "");
console.log(okA ? "✓ Caso A: cotización 30k" : "✗ Caso A: cotización 30k");

await new Promise((res) => setTimeout(res, 500));
const evA = await countEventsForSession(["quote_created"]);
const quoteEv = evA.find((e) => e.event_type === "quote_created");
if (mig.exists && quoteEv && quoteEv.n > 0) {
  console.log(`✓ Caso A: quote_created (${quoteEv.n})`);
} else if (!mig.exists) {
  console.log("~ Caso A: quote_created (tabla eventos ausente)");
} else {
  console.log("✗ Caso A: sin quote_created en agent_sales_events");
}

const ordersMid = await agentOrdersSince();
r = await chat("generar link de pago");
const ordersAfterLink1 = await agentOrdersSince();
r = await chat("generar link de pago");
const ordersAfterLink2 = await agentOrdersSince();

const newOrders1 = ordersAfterLink1.length - ordersBefore.length;
const newOrders2 = ordersAfterLink2.length - ordersAfterLink1.length;
const hasLink =
  Boolean(r.paymentUrl) ||
  /mercadopago|pagar aquí/i.test(r.reply ?? "");
const pendingOrder = ordersAfterLink2.find((o) => o.payment_status === "pending");

console.log(
  hasLink && pendingOrder
    ? `✓ Caso B: orden pendiente agent_panel (${pendingOrder.id.slice(0, 8)}…)`
    : "✗ Caso B: orden/link pendiente",
);
console.log(
  newOrders1 <= 1 && newOrders2 === 0
    ? `✓ Caso B: sin duplicar órdenes (+${newOrders1}, luego +${newOrders2})`
    : `✗ Duplicación órdenes: +${newOrders1}, +${newOrders2}`,
);

const evB = await countEventsForSession([
  "payment_link_created",
  "payment_link_reused",
]);
const created = evB.find((e) => e.event_type === "payment_link_created");
const reused = evB.find((e) => e.event_type === "payment_link_reused");
if (mig.exists && (created?.n || reused?.n)) {
  console.log(
    `✓ Caso B: eventos link (created=${created?.n ?? 0}, reused=${reused?.n ?? 0})`,
  );
} else if (!mig.exists) {
  console.log("~ Caso B: eventos link (tabla ausente)");
} else {
  console.log("✗ Caso B: sin payment_link_created/reused");
}

const manualSession = randomUUID();
const rManual = await chat("quiero comprar 150000 sms", manualSession);
const okC =
  /150\.?000/i.test(rManual.reply ?? "") &&
  /120\.?000|ejecutivo|comercial/i.test(rManual.reply ?? "") &&
  !rManual.paymentUrl;
console.log(okC ? "✓ Caso C: manual 150k sin checkout" : "✗ Caso C: manual 150k");

const evC = await dbQuery(
  `SELECT count(*)::int AS n FROM agent_sales_events
   WHERE company_id = $1 AND session_id = $2 AND event_type = 'manual_quote_requested'
     AND created_at > now() - interval '2 hours'`,
  [COMPANY_ID, manualSession],
);
if (mig.exists && (evC.rows[0]?.n ?? 0) > 0) {
  console.log("✓ Caso C: manual_quote_requested");
} else if (!mig.exists) {
  console.log("~ Caso C: manual_quote_requested (tabla ausente)");
} else {
  console.log("✗ Caso C: sin manual_quote_requested");
}

const bal = await dbQuery(
  `SELECT available_sms FROM company_sms_wallets WHERE company_id = $1`,
  [COMPANY_ID],
);
const available = bal.rows[0]?.available_sms ?? 0;
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
  message: "Auditoría saldo",
  csvUploadId: randomUUID(),
  senderId: "TELVOICE",
});

const okInsuf =
  /faltan/i.test(insuf.reply ?? "") && !insuf.requiresConfirmation;
console.log(
  okInsuf ? "✓ Bloqueo saldo: oferta sin Confirmo" : "✗ Bloqueo saldo",
);

const evInsuf = await dbQuery(
  `SELECT count(*)::int AS n FROM agent_sales_events
   WHERE company_id = $1 AND session_id = $2
     AND event_type = 'insufficient_balance_detected'
     AND created_at > now() - interval '2 hours'`,
  [COMPANY_ID, insufSession],
);
if (mig.exists && (evInsuf.rows[0]?.n ?? 0) > 0) {
  console.log("✓ Bloqueo saldo: insufficient_balance_detected");
} else if (!mig.exists) {
  console.log("~ Bloqueo saldo: evento (tabla ausente)");
} else {
  console.log("✗ Bloqueo saldo: sin evento insufficient_balance_detected");
}

const eventsSummary = await countEvents(120);
console.log("\n--- Resumen DB (últimas 2h) ---");
if (eventsSummary.error) {
  console.log("agent_sales_events:", eventsSummary.error);
} else {
  console.log("Total eventos empresa:", eventsSummary.total);
  for (const row of eventsSummary.byType) {
    console.log(`  ${row.event_type}: ${row.n}`);
  }
}

const paidSum = await dbQuery(
  `SELECT coalesce(sum(amount),0)::bigint AS s, count(*)::int AS n
   FROM sms_orders
   WHERE company_id = $1 AND metadata->>'source' = 'agent_panel'
     AND payment_status = 'paid' AND created_at > now() - interval '2 hours'`,
  [COMPANY_ID],
);
const potSum = await dbQuery(
  `SELECT coalesce(sum(amount),0)::bigint AS s, count(*)::int AS n
   FROM sms_orders
   WHERE company_id = $1 AND metadata->>'source' = 'agent_panel'
     AND created_at > now() - interval '2 hours'`,
  [COMPANY_ID],
);
console.log(
  `Órdenes agent_panel 2h: ${potSum.rows[0]?.n ?? 0}, potencial CLP ${potSum.rows[0]?.s ?? 0}, pagado CLP ${paidSum.rows[0]?.s ?? 0}`,
);

console.log("\n=== Fin auditoría (webhook order_paid NO tocado) ===");

await db.end();
