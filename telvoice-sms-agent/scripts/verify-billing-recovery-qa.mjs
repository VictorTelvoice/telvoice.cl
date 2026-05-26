#!/usr/bin/env node
/**
 * QA Etapa 12.7 — Recuperación Billing.
 * Requiere: DATABASE_URL, npm run build (dist/services/*).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "../dist/services/billingRecoveryService.js");

if (!existsSync(distPath)) {
  console.error("Ejecuta npm run build primero.");
  process.exit(1);
}

const {
  getBillingRecoverySummary,
  findPaidCreditedOrdersWithoutInvoice,
  findInvoicesWithoutSuccessfulEmail,
  findFailedBillingEmails,
  retryBillingSyncForOrder,
} = await import(pathToFileURL(distPath).toString());

const conn = process.env.DATABASE_URL?.trim();
if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

await client.connect();
try {
  const summary = await getBillingRecoverySummary();
  assert(typeof summary.ordersWithoutInvoice === "number", "summary.ordersWithoutInvoice");
  assert(typeof summary.hasIssues === "boolean", "summary.hasIssues");
  console.log("OK: getBillingRecoverySummary", summary);

  const ordersWithout = await findPaidCreditedOrdersWithoutInvoice({ limit: 20 });
  const invoicesWithout = await findInvoicesWithoutSuccessfulEmail({ limit: 20 });
  const failedEmails = await findFailedBillingEmails({ limit: 20 });
  console.log(
    "OK: find*",
    "ordersWithout=",
    ordersWithout.length,
    "invoicesWithout=",
    invoicesWithout.length,
    "failedEmails=",
    failedEmails.length,
  );

  const { rows: testOrders } = await client.query(`
    SELECT o.id
    FROM sms_orders o
    WHERE o.payment_status = 'paid' AND o.credit_status = 'credited'
    ORDER BY o.created_at DESC
    LIMIT 1
  `);
  assert(testOrders.length > 0, "Necesita al menos una orden paid+credited");

  const orderId = testOrders[0].id;

  const walletBefore = (
    await client.query(
      `SELECT count(*)::int AS c FROM wallet_transactions
       WHERE reference_type='sms_order' AND reference_id=$1`,
      [orderId],
    )
  ).rows[0].c;
  const orderBefore = (
    await client.query(
      `SELECT payment_status, credit_status, amount, sms_quantity FROM sms_orders WHERE id=$1`,
      [orderId],
    )
  ).rows[0];
  const invBefore = (
    await client.query(`SELECT count(*)::int AS c FROM billing_invoices WHERE order_id=$1`, [
      orderId,
    ])
  ).rows[0].c;
  const emailBefore = (
    await client.query(
      `SELECT count(*)::int AS c FROM billing_email_logs el
       JOIN billing_invoices inv ON inv.id = el.invoice_id
       WHERE inv.order_id = $1 AND el.status = 'sent'`,
      [orderId],
    )
  ).rows[0].c;

  const retry1 = await retryBillingSyncForOrder(orderId, {
    actorType: "qa_script",
    actorId: null,
  });
  assert(retry1.ok, `retry1 failed: ${retry1.message}`);
  console.log("OK: retryBillingSyncForOrder", retry1.message);

  const invAfter1 = (
    await client.query(`SELECT count(*)::int AS c FROM billing_invoices WHERE order_id=$1`, [
      orderId,
    ])
  ).rows[0].c;
  assert(invAfter1 >= 1, "Debe existir invoice tras retry");
  assert(invAfter1 === invBefore || invBefore === 0, "No debe duplicar invoice");

  const retry2 = await retryBillingSyncForOrder(orderId, {
    actorType: "qa_script",
    actorId: null,
  });
  assert(retry2.ok, `retry2 failed: ${retry2.message}`);
  console.log("OK: retry2 idempotente", retry2.message);

  const invAfter2 = (
    await client.query(`SELECT count(*)::int AS c FROM billing_invoices WHERE order_id=$1`, [
      orderId,
    ])
  ).rows[0].c;
  const emailAfter2 = (
    await client.query(
      `SELECT count(*)::int AS c FROM billing_email_logs el
       JOIN billing_invoices inv ON inv.id = el.invoice_id
       WHERE inv.order_id = $1 AND el.status = 'sent'`,
      [orderId],
    )
  ).rows[0].c;
  assert(invAfter2 === invAfter1, "Invoice duplicada en retry2");
  assert(emailAfter2 === emailBefore || emailAfter2 <= emailBefore + 1, "Emails sent duplicados");

  const providers = await client.query(
    `SELECT DISTINCT el.provider FROM billing_email_logs el
     JOIN billing_invoices inv ON inv.id = el.invoice_id WHERE inv.order_id = $1`,
    [orderId],
  );
  for (const p of providers.rows) {
    if (p.provider) assert(p.provider === "mock", "Solo provider mock");
  }

  const orderAfter = (
    await client.query(
      `SELECT payment_status, credit_status, amount, sms_quantity FROM sms_orders WHERE id=$1`,
      [orderId],
    )
  ).rows[0];
  const walletAfter = (
    await client.query(
      `SELECT count(*)::int AS c FROM wallet_transactions
       WHERE reference_type='sms_order' AND reference_id=$1`,
      [orderId],
    )
  ).rows[0].c;

  assert(
    JSON.stringify(orderBefore) === JSON.stringify(orderAfter),
    "sms_orders no debe cambiar",
  );
  assert(walletBefore === walletAfter, "wallet no debe cambiar");

  const { rows: recoveryEvents } = await client.query(
    `SELECT event_type FROM billing_events e
     JOIN billing_invoices inv ON inv.id = e.invoice_id
     WHERE inv.order_id = $1 AND e.event_type LIKE 'billing.recovery.%'`,
    [orderId],
  );
  assert(recoveryEvents.length >= 1, "Debe registrar billing.recovery.*");
  console.log("OK: eventos recovery", recoveryEvents.map((e) => e.event_type).join(", "));

  console.log("\nOK: Billing recovery 12.7 verificado.");
  console.log("- No email real (provider=mock)");
  console.log("- wallet y sms_order sin cambios");
} catch (err) {
  console.error("FALLÓ:", err?.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}
