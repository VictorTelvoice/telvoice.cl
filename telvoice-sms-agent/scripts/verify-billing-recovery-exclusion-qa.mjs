#!/usr/bin/env node
/**
 * QA exclusión/revisión órdenes en Billing Recovery (12.7+).
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
  markOrderBillingReviewed,
  unmarkOrderBillingReviewed,
  isOrderExcludedFromBillingRecovery,
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

const actor = { actorType: "qa_script", actorId: null };

await client.connect();
try {
  const summary = await getBillingRecoverySummary();
  assert(typeof summary.ordersExcludedFromRecovery === "number", "summary.ordersExcludedFromRecovery");
  console.log("OK: summary", {
    active: summary.ordersWithoutInvoice,
    excluded: summary.ordersExcludedFromRecovery,
  });

  const { rows: candidate } = await client.query(`
    SELECT o.id, o.metadata
    FROM sms_orders o
    WHERE o.payment_status = 'paid' AND o.credit_status = 'credited'
      AND NOT EXISTS (SELECT 1 FROM billing_invoices bi WHERE bi.order_id = o.id)
      AND (o.metadata->'billing_recovery'->>'excluded') IS DISTINCT FROM 'true'
    ORDER BY o.created_at DESC
    LIMIT 1
  `);

  if (!candidate.length) {
    console.log("SKIP: mark/unmark — no hay orden activa sin invoice para prueba");
  } else {
    const orderId = candidate[0].id;
    const walletBefore = (
      await client.query(
        `SELECT count(*)::int AS c FROM wallet_transactions WHERE reference_type='sms_order' AND reference_id=$1`,
        [orderId],
      )
    ).rows[0].c;
    const orderBefore = (
      await client.query(
        `SELECT payment_status, credit_status, amount FROM sms_orders WHERE id=$1`,
        [orderId],
      )
    ).rows[0];
    const invBefore = (
      await client.query(`SELECT count(*)::int AS c FROM billing_invoices WHERE order_id=$1`, [
        orderId,
      ])
    ).rows[0].c;

    const activeBefore = await findPaidCreditedOrdersWithoutInvoice({ limit: 100 });
    assert(activeBefore.some((o) => o.order_id === orderId), "Orden en lista activa");

    const mark = await markOrderBillingReviewed({
      orderId,
      reviewedBy: "qa_script",
      actor,
      reason: "demo_qa_order",
      notes: "QA exclusion test",
      excluded: true,
    });
    assert(mark.ok, mark.message);

    const activeAfterMark = await findPaidCreditedOrdersWithoutInvoice({ limit: 100 });
    assert(!activeAfterMark.some((o) => o.order_id === orderId), "Debe salir de activas");

    const metaAfter = (
      await client.query(`SELECT metadata FROM sms_orders WHERE id=$1`, [orderId])
    ).rows[0].metadata;
    assert(
      isOrderExcludedFromBillingRecovery({ metadata: metaAfter }),
      "metadata.billing_recovery.excluded",
    );
    assert(metaAfter.billing_recovery.reason === "demo_qa_order", "reason");

    const orderAfterMark = (
      await client.query(
        `SELECT payment_status, credit_status, amount FROM sms_orders WHERE id=$1`,
        [orderId],
      )
    ).rows[0];
    const invAfterMark = (
      await client.query(`SELECT count(*)::int AS c FROM billing_invoices WHERE order_id=$1`, [
        orderId,
      ])
    ).rows[0].c;
    const walletAfterMark = (
      await client.query(
        `SELECT count(*)::int AS c FROM wallet_transactions WHERE reference_type='sms_order' AND reference_id=$1`,
        [orderId],
      )
    ).rows[0].c;

    assert(JSON.stringify(orderBefore) === JSON.stringify(orderAfterMark), "sms_orders estados");
    assert(invBefore === invAfterMark, "sin invoice nueva");
    assert(walletBefore === walletAfterMark, "wallet sin cambios");

    const unmark = await unmarkOrderBillingReviewed(orderId, actor);
    assert(unmark.ok, unmark.message);

    const activeAfterUnmark = await findPaidCreditedOrdersWithoutInvoice({ limit: 100 });
    assert(activeAfterUnmark.some((o) => o.order_id === orderId), "Vuelve a activas");

    const remark = await markOrderBillingReviewed({
      orderId,
      reviewedBy: "qa_script",
      actor,
      reason: "demo_qa_order",
      notes: "QA re-mark after unmark test",
      excluded: true,
    });
    assert(remark.ok, remark.message);
    console.log("OK: mark → unmark → re-mark en", orderId.slice(0, 8));
  }

  const demoIds = [
    "a234b253-e949-4866-9e74-9ce99c9de9c4",
    "3a132bfd-5bd4-4283-a0c8-07f23588952a",
    "961de5a4-3c60-4b67-9118-a778121f8c05",
    "991aa4cb-e448-4c32-a5c5-6dcde7eb3d9d",
  ];
  for (const id of demoIds) {
    const { rows } = await client.query(`SELECT metadata FROM sms_orders WHERE id=$1`, [id]);
    assert(rows.length === 1, `orden demo ${id}`);
    assert(
      rows[0].metadata?.billing_recovery?.excluded === true,
      `demo ${id} debe estar excluida`,
    );
  }

  const activeFinal = await findPaidCreditedOrdersWithoutInvoice({ limit: 50 });
  const excludedFinal = await findPaidCreditedOrdersWithoutInvoice({
    limit: 50,
    onlyExcluded: true,
  });
  assert(activeFinal.length === 0, `activas=${activeFinal.length}, esperado 0`);
  assert(excludedFinal.length === 4, `excluidas=${excludedFinal.length}, esperado 4`);

  console.log("\nOK: Billing recovery exclusion QA verificado.");
} catch (err) {
  console.error("FALLÓ:", err?.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}
