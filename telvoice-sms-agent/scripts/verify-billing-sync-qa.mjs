#!/usr/bin/env node
/**
 * QA Etapa 12.6 — sincronización Billing post-pago acreditado.
 *
 * Requisitos:
 * - DATABASE_URL en .env
 * - npm run build (usa dist/services/billingSyncService.js)
 *
 * Uso:
 * - npm run build
 * - node scripts/verify-billing-sync-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL no está definido en .env");
  process.exit(1);
}

const distSyncPath = join(__dirname, "../dist/services/billingSyncService.js");
const distEmailPath = join(__dirname, "../dist/services/billingEmailService.js");
if (!existsSync(distSyncPath)) {
  console.error("Falta dist/services/billingSyncService.js. Ejecuta: npm run build");
  process.exit(1);
}

const { ensureBillingForCreditedOrder } = await import(
  pathToFileURL(distSyncPath).toString()
);
const { hasSuccessfulBillingEmail } = await import(
  pathToFileURL(distEmailPath).toString()
);

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

await client.connect();
try {
  const { rows: orders } = await client.query(`
    SELECT id
    FROM sms_orders
    WHERE payment_status = 'paid' AND credit_status = 'credited'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  if (!orders.length) {
    console.log(
      "OK: No hay orden paid+credited para probar sync; tablas listas cuando exista una.",
    );
    process.exit(0);
  }

  const orderId = orders[0].id;

  const orderBefore = await client.query(
    `SELECT payment_status, credit_status, sms_quantity, amount FROM sms_orders WHERE id = $1`,
    [orderId],
  );
  const walletBefore = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions
     WHERE reference_type = 'sms_order' AND reference_id = $1 AND type = 'purchase_credit'`,
    [orderId],
  );
  const invBefore = await client.query(
    `SELECT count(*)::int AS c FROM billing_invoices WHERE order_id = $1`,
    [orderId],
  );
  const emailBefore = await client.query(
    `SELECT count(*)::int AS c FROM billing_email_logs el
     JOIN billing_invoices inv ON inv.id = el.invoice_id
     WHERE inv.order_id = $1 AND el.status = 'sent'`,
    [orderId],
  );

  const r1 = await ensureBillingForCreditedOrder(orderId, {
    source: "verify_billing_sync_qa",
  });
  assert(r1.ok, `Primera sync falló: ${r1.error ?? "unknown"}`);
  assert(r1.invoiceId, "Primera sync sin invoiceId");

  const invAfter1 = await client.query(
    `SELECT id, status FROM billing_invoices WHERE order_id = $1`,
    [orderId],
  );
  assert(invAfter1.rows.length === 1, "Debe existir exactamente 1 invoice por orden");

  const itemsAfter1 = await client.query(
    `SELECT count(*)::int AS c FROM billing_invoice_items WHERE invoice_id = $1`,
    [invAfter1.rows[0].id],
  );
  assert(itemsAfter1.rows[0].c >= 1, "Debe haber al menos 1 item");

  const eventsAfter1 = await client.query(
    `SELECT event_type FROM billing_events WHERE invoice_id = $1 ORDER BY created_at`,
    [invAfter1.rows[0].id],
  );
  const eventTypes = eventsAfter1.rows.map((e) => e.event_type);
  assert(
    eventTypes.includes("billing.sync.completed"),
    "Falta evento billing.sync.completed",
  );

  const emailAfter1 = await client.query(
    `SELECT count(*)::int AS c, max(provider) AS provider FROM billing_email_logs
     WHERE invoice_id = $1 AND status = 'sent'`,
    [invAfter1.rows[0].id],
  );
  if (emailAfter1.rows[0].c > 0) {
    assert(emailAfter1.rows[0].provider === "mock", "provider debe ser mock");
  }

  const r2 = await ensureBillingForCreditedOrder(orderId, {
    source: "verify_billing_sync_qa_retry",
  });
  assert(r2.ok, `Segunda sync falló: ${r2.error ?? "unknown"}`);
  assert(r2.invoiceId === r1.invoiceId, "Segunda sync cambió invoice id");
  assert(r2.invoiceCreated !== true, "Segunda sync no debe marcar invoice creada");
  if (emailAfter1.rows[0].c > 0) {
    assert(r2.emailSkipped === true, "Segunda sync debe omitir email si ya hay sent");
  }

  const invAfter2 = await client.query(
    `SELECT count(*)::int AS c FROM billing_invoices WHERE order_id = $1`,
    [orderId],
  );
  assert(invAfter2.rows[0].c === 1, "Se duplicó billing_invoices");

  const emailAfter2 = await client.query(
    `SELECT count(*)::int AS c FROM billing_email_logs el
     JOIN billing_invoices inv ON inv.id = el.invoice_id
     WHERE inv.order_id = $1 AND el.status = 'sent'`,
    [orderId],
  );
  assert(
    emailAfter2.rows[0].c === emailAfter1.rows[0].c,
    "Segunda sync duplicó emails sent automáticos",
  );

  const hasSent = await hasSuccessfulBillingEmail(r1.invoiceId);
  if (emailAfter1.rows[0].c > 0) {
    assert(hasSent, "hasSuccessfulBillingEmail debe ser true");
  }

  const orderAfter = await client.query(
    `SELECT payment_status, credit_status, sms_quantity, amount FROM sms_orders WHERE id = $1`,
    [orderId],
  );
  assert(
    JSON.stringify(orderBefore.rows[0]) === JSON.stringify(orderAfter.rows[0]),
    "sms_orders cambió (NO permitido)",
  );

  const walletAfter = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions
     WHERE reference_type = 'sms_order' AND reference_id = $1 AND type = 'purchase_credit'`,
    [orderId],
  );
  assert(
    walletAfter.rows[0].c === walletBefore.rows[0].c,
    "wallet_transactions cambió (NO permitido)",
  );

  console.log("OK: Billing sync 12.6 verificado.");
  console.log("- orderId:", orderId);
  console.log("- invoiceId:", r1.invoiceId);
  console.log("- sync1:", {
    invoiceCreated: r1.invoiceCreated,
    emailSent: r1.emailSent,
    emailSkipped: r1.emailSkipped,
  });
  console.log("- sync2:", { emailSkipped: r2.emailSkipped });
  console.log(
    "- counts:",
    "invoices",
    invBefore.rows[0].c,
    "→",
    invAfter2.rows[0].c,
    "emails sent",
    emailBefore.rows[0].c,
    "→",
    emailAfter2.rows[0].c,
  );
  console.log("- No se envió email real (solo provider=mock en logs).");
} catch (err) {
  console.error("FALLÓ verify-billing-sync-qa:", err?.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}
