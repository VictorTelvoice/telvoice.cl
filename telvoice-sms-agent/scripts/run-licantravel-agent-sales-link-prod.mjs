#!/usr/bin/env node
/**
 * Prueba E2E producción: cotización + link MP vía API del panel (VPS ejecuta MercadoPago).
 * Sin pago. Audita agent_sales_events y sms_orders.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = (
  process.env.PROD_APP_URL ||
  process.env.PUBLIC_APP_URL ||
  "https://agent.telvoice.cl"
)
  .replace(/\/$/, "")
  .replace(/^http:\/\/localhost(:\d+)?$/i, "https://agent.telvoice.cl");
function parseArgs(argv) {
  let companyId = process.env.TEST_COMPANY_ID?.trim() ?? "";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--company-id" && argv[i + 1]) {
      companyId = argv[++i];
    }
  }
  return companyId;
}

const COMPANY_ID =
  parseArgs(process.argv) || "259eb2a3-47a1-4788-908b-9d8986f04027";
const LICAN_EMAIL = "licantravel@gmail.com";
const CLIENT_COOKIE = "tv_client_session";
const ADMIN_COOKIE = "tv_admin_session";

const cs = process.env.DATABASE_URL?.trim();
if (!cs || !process.env.JWT_SECRET) {
  console.error("DATABASE_URL y JWT_SECRET requeridos");
  process.exit(1);
}

const db = new pg.Client({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

async function loadUser(email) {
  const { rows } = await db.query(
    `SELECT au.id, au.email, au.name, up.role, up.company_id
     FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE lower(au.email) = lower($1) AND up.company_id = $2`,
    [email, COMPANY_ID],
  );
  return rows[0];
}

async function loadSuperadmin() {
  const email = process.env.SUPERADMIN_EMAIL?.trim();
  if (!email) return null;
  const { rows } = await db.query(
    `SELECT id, email, name, role FROM admin_users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0];
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
}

async function agentChat(cookie, sessionId, message) {
  const res = await fetch(`${BASE}/api/app/agent/chat`, {
    method: "POST",
    headers: {
      Cookie: `${CLIENT_COOKIE}=${cookie}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, sessionId, page: "/app" }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function truncateUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const pref = u.searchParams.get("pref_id");
    if (pref) return `${u.origin}${u.pathname}?pref_id=${pref.slice(0, 12)}…`;
    return `${u.origin}${u.pathname}…`;
  } catch {
    return String(url).slice(0, 60) + "…";
  }
}

const user = await loadUser(LICAN_EMAIL);
if (!user) {
  console.error("Usuario Licantravel no encontrado");
  process.exit(1);
}

const clientToken = signToken(user);
const sessionId = randomUUID();

console.log("=== Prueba link MP producción (API panel) ===\n");
console.log("Empresa:", COMPANY_ID);
console.log("Usuario:", user.email);
console.log("Sesión:", sessionId);
console.log("API:", BASE, "\n");

const eventsBefore = (
  await db.query(
    `SELECT count(*)::int n FROM agent_sales_events
     WHERE event_type IN ('payment_link_created','payment_link_reused')`,
  )
).rows[0].n;

const ordersBefore = (
  await db.query(
    `SELECT count(*)::int n FROM sms_orders
     WHERE company_id = $1 AND metadata->>'source' = 'agent_panel' AND payment_status = 'pending'`,
    [COMPANY_ID],
  )
).rows[0].n;

let r = await agentChat(clientToken, sessionId, "quiero comprar 30000 mensajes");
console.log("--- Mensaje 1: cotización ---");
console.log("HTTP", r.status);
if (r.status !== 200 || !r.body.success) {
  console.error(r.body);
  process.exit(1);
}
const reply1 = r.body.reply ?? "";
const okQuote =
  /30\.?000/i.test(reply1) &&
  /\$7|precio unitario neto: \$7/i.test(reply1) &&
  /210\.?000/.test(reply1) &&
  /39\.?900/.test(reply1) &&
  /249\.?900/.test(reply1);
console.log(okQuote ? "✓ Cotización 30k OK" : "✗ Cotización incompleta");
console.log("reply:", reply1.slice(0, 180).replace(/\n/g, " "), "…");

await new Promise((res) => setTimeout(res, 800));

const evQuote = (
  await db.query(
    `SELECT id, event_type, created_at FROM agent_sales_events
     WHERE session_id = $1 AND event_type = 'quote_created'`,
    [sessionId],
  )
).rows;
console.log(evQuote.length ? "✓ quote_created en DB" : "✗ sin quote_created");

r = await agentChat(clientToken, sessionId, "generar link de pago");
console.log("\n--- Mensaje 2: generar link ---");
console.log("HTTP", r.status);
const reply2 = r.body.reply ?? "";
const paymentUrl = r.body.paymentUrl ?? null;
const orderId = r.body.orderId ?? null;
const hasMp =
  Boolean(paymentUrl && /mercadopago/i.test(paymentUrl)) ||
  /mercadopago\.cl\/checkout/i.test(reply2);
console.log(hasMp ? "✓ Link MercadoPago presente" : "✗ Sin link MP");
console.log("orderId:", orderId ?? "(en reply/metadata)");
console.log("URL (truncada):", truncateUrl(paymentUrl) ?? "(buscar en reply)");
if (!hasMp) console.log("reply:", reply2.slice(0, 300));

await new Promise((res) => setTimeout(res, 800));

const evLink1 = (
  await db.query(
    `SELECT event_type, order_id, created_at FROM agent_sales_events
     WHERE session_id = $1 AND event_type IN ('payment_link_created','payment_link_reused')
     ORDER BY created_at`,
    [sessionId],
  )
).rows;

r = await agentChat(clientToken, sessionId, "generar link de pago");
console.log("\n--- Mensaje 3: reutilizar link ---");
const reply3 = r.body.reply ?? "";
const orderId3 = r.body.orderId ?? orderId;

const ordersAfter = (
  await db.query(
    `SELECT id, payment_status, credit_status, amount, sms_quantity, metadata, created_at
     FROM sms_orders
     WHERE company_id = $1 AND metadata->>'source' = 'agent_panel'
       AND created_at > now() - interval '30 minutes'
     ORDER BY created_at DESC`,
    [COMPANY_ID],
  )
).rows;

const sessionOrders = ordersAfter.filter(
  (o) => o.metadata?.agent_session_id === sessionId,
);

const evAll = (
  await db.query(
    `SELECT event_type, order_id, created_at FROM agent_sales_events
     WHERE session_id = $1 ORDER BY created_at`,
    [sessionId],
  )
).rows;

const eventsAfter = (
  await db.query(
    `SELECT count(*)::int n FROM agent_sales_events
     WHERE event_type IN ('payment_link_created','payment_link_reused')`,
  )
).rows[0].n;

const ordersPendingAfter = (
  await db.query(
    `SELECT count(*)::int n FROM sms_orders
     WHERE company_id = $1 AND metadata->>'source' = 'agent_panel' AND payment_status = 'pending'`,
    [COMPANY_ID],
  )
).rows[0].n;

const walletCredits = orderId3
  ? (
      await db.query(
        `SELECT count(*)::int n FROM wallet_transactions
         WHERE reference_id = $1::uuid AND type = 'purchase_credit'`,
        [orderId3],
      )
    ).rows[0].n
  : 0;

const paidCheck = orderId3
  ? (
      await db.query(`SELECT payment_status, credit_status FROM sms_orders WHERE id = $1`, [
        orderId3,
      ])
    ).rows[0]
  : null;

console.log("\n=== Auditoría DB ===");
console.log("Eventos sesión:", evAll);
console.log("Órdenes sesión (30 min):", sessionOrders.length);
for (const o of sessionOrders) {
  console.log("  orden", o.id, o.payment_status, o.amount, "pref:", o.metadata?.mercadopago_preference_id?.slice?.(0, 20));
}
console.log("payment_link events globales: antes", eventsBefore, "después", eventsAfter);
console.log("órdenes pending empresa: antes", ordersBefore, "después", ordersPendingAfter);
console.log("wallet purchase_credit:", walletCredits);
console.log("orden pago/crédito:", paidCheck);

const dupOk = sessionOrders.length <= 1;
console.log(dupOk ? "✓ Sin duplicar orden misma sesión" : "✗ Múltiples órdenes misma sesión");

const linkEv = evAll.filter((e) =>
  ["payment_link_created", "payment_link_reused"].includes(e.event_type),
);
console.log(
  linkEv.length
    ? `✓ Evento link: ${linkEv.map((e) => e.event_type).join(", ")}`
    : "✗ Sin payment_link_created/reused",
);

const reused = linkEv.some((e) => e.event_type === "payment_link_reused");
const created = linkEv.some((e) => e.event_type === "payment_link_created");
if (reused) console.log("✓ payment_link_reused registrado");
if (created) console.log("✓ payment_link_created registrado");

const superadmin = await loadSuperadmin();
if (superadmin) {
  const adminToken = signToken(superadmin);
  const dash = await fetch(`${BASE.replace("agent.", "admin.")}/admin/agent-sales`, {
    headers: { Cookie: `${ADMIN_COOKIE}=${adminToken}` },
    redirect: "follow",
  });
  const html = await dash.text();
  console.log("\n=== Dashboard admin ===");
  console.log("HTTP", dash.status, dash.url);
  const checks = [
    ["Ventas del Agente", /Ventas del Agente/.test(html)],
    ["KPI Cotizaciones", /Cotizaciones/.test(html)],
    ["Licantravel", /Licantravel/i.test(html)],
    ["agent_panel / pending", /pending|agent_panel|Pendiente/i.test(html)],
    ["249.900 o monto", /249[\.\s]?900|249900/.test(html)],
  ];
  for (const [label, ok] of checks) {
    console.log(ok ? "✓" : "~", label);
  }
} else {
  console.log("\n(Skip dashboard: SUPERADMIN_EMAIL no definido)");
}

console.log("\n=== Fin (sin pago, webhook no tocado) ===");

await db.end();

const failed =
  !okQuote ||
  !evQuote.length ||
  !hasMp ||
  !linkEv.length ||
  !dupOk ||
  walletCredits > 0 ||
  paidCheck?.payment_status === "paid";
process.exit(failed ? 1 : 0);
