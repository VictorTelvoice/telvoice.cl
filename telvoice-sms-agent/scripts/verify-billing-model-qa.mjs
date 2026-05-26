#!/usr/bin/env node
/**
 * Verificación QA del modelo Billing (Etapa 12.1).
 *
 * Requisitos:
 * - DATABASE_URL en .env (para validar tablas/índices y comprobar que no cambia wallet).
 * - Build ejecutado (usa dist/services/*).
 *
 * Uso sugerido:
 * - npm run build
 * - node scripts/verify-billing-model-qa.mjs
 */
import { readFileSync, existsSync } from "node:fs";
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

const distServicePath = join(__dirname, "../dist/services/billingInvoiceService.js");
if (!existsSync(distServicePath)) {
  console.error("No existe dist/services/billingInvoiceService.js. Ejecuta: npm run build");
  process.exit(1);
}

const { ensureInvoiceForOrder } = await import(pathToFileURL(distServicePath).toString());

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
  // 1) Tablas existen
  const { rows: tables } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('billing_invoices','billing_invoice_items','billing_email_logs','billing_events')
    ORDER BY 1;
  `);
  const tableNames = tables.map((r) => r.table_name);
  assert(tableNames.includes("billing_invoices"), "Falta tabla billing_invoices");
  assert(tableNames.includes("billing_invoice_items"), "Falta tabla billing_invoice_items");
  assert(tableNames.includes("billing_email_logs"), "Falta tabla billing_email_logs");
  assert(tableNames.includes("billing_events"), "Falta tabla billing_events");

  // 2) Índice único por order_id
  const { rows: idx } = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='billing_invoices'
      AND indexname='idx_billing_invoices_order_unique'
  `);
  assert(idx.length === 1, "Falta índice idx_billing_invoices_order_unique en billing_invoices");

  // 3) Buscar una orden paid+credited real para test idempotencia
  const { rows: orders } = await client.query(`
    SELECT id
    FROM sms_orders
    WHERE payment_status='paid' AND credit_status='credited'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  if (!orders.length) {
    console.log("OK: Tablas/índices Billing existen, pero no hay sms_orders paid+credited para probar ensureInvoiceForOrder.");
    process.exit(0);
  }

  const orderId = orders[0].id;

  const beforeWallet = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions WHERE reference_type='sms_order' AND reference_id=$1 AND type='purchase_credit'`,
    [orderId],
  );
  const walletCountBefore = beforeWallet.rows[0].c;

  const beforeInv = await client.query(
    `SELECT count(*)::int AS c FROM billing_invoices WHERE order_id=$1`,
    [orderId],
  );
  const beforeItems = await client.query(
    `SELECT count(*)::int AS c
     FROM billing_invoice_items i
     JOIN billing_invoices inv ON inv.id=i.invoice_id
     WHERE inv.order_id=$1`,
    [orderId],
  );
  const beforeEvents = await client.query(
    `SELECT count(*)::int AS c
     FROM billing_events e
     JOIN billing_invoices inv ON inv.id=e.invoice_id
     WHERE inv.order_id=$1`,
    [orderId],
  );

  // 4) Primera llamada: crea si no existe
  const inv1 = await ensureInvoiceForOrder(orderId);
  assert(inv1 && inv1.order_id === orderId, "ensureInvoiceForOrder no devolvió invoice válida");

  // 5) Segunda llamada: no duplica
  const inv2 = await ensureInvoiceForOrder(orderId);
  assert(inv2 && inv2.id === inv1.id, "ensureInvoiceForOrder no fue idempotente (id distinto)");

  const afterInv = await client.query(
    `SELECT count(*)::int AS c FROM billing_invoices WHERE order_id=$1`,
    [orderId],
  );
  const afterItems = await client.query(
    `SELECT count(*)::int AS c
     FROM billing_invoice_items i
     JOIN billing_invoices inv ON inv.id=i.invoice_id
     WHERE inv.order_id=$1`,
    [orderId],
  );
  const afterEvents = await client.query(
    `SELECT count(*)::int AS c
     FROM billing_events e
     JOIN billing_invoices inv ON inv.id=e.invoice_id
     WHERE inv.order_id=$1`,
    [orderId],
  );

  assert(afterInv.rows[0].c >= 1, "No quedó billing_invoices para la orden");
  assert(afterInv.rows[0].c === 1, "Se duplicó billing_invoices para la orden");
  assert(afterItems.rows[0].c >= 1, "No se crearon items");
  assert(afterEvents.rows[0].c >= 1, "No se registraron eventos");

  const afterWallet = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions WHERE reference_type='sms_order' AND reference_id=$1 AND type='purchase_credit'`,
    [orderId],
  );
  const walletCountAfter = afterWallet.rows[0].c;
  assert(walletCountAfter === walletCountBefore, "El script detectó cambios en wallet_transactions (NO permitido)");

  console.log("OK: Billing 12.1 verificado.");
  console.log("- orderId:", orderId);
  console.log("- invoiceId:", inv1.id);
  console.log("- invoiceNumber:", inv1.invoice_number);
  console.log(
    "- counts:",
    "invoices",
    `${beforeInv.rows[0].c}→${afterInv.rows[0].c},`,
    "items",
    `${beforeItems.rows[0].c}→${afterItems.rows[0].c},`,
    "events",
    `${beforeEvents.rows[0].c}→${afterEvents.rows[0].c}`,
  );
} catch (err) {
  console.error("FALLÓ verify-billing-model-qa:", err?.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}

