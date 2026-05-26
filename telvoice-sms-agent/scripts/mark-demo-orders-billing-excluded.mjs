#!/usr/bin/env node
/**
 * Marca las 4 órdenes demo auditadas como excluidas de Billing Recovery.
 * Requiere: DATABASE_URL, npm run build.
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

const { markOrderBillingReviewed, findPaidCreditedOrdersWithoutInvoice } =
  await import(pathToFileURL(distPath).toString());

const DEMO_ORDER_IDS = [
  "a234b253-e949-4866-9e74-9ce99c9de9c4",
  "3a132bfd-5bd4-4283-a0c8-07f23588952a",
  "961de5a4-3c60-4b67-9118-a778121f8c05",
  "991aa4cb-e448-4c32-a5c5-6dcde7eb3d9d",
];

const NOTES =
  "Orden demo/QA histórica excluida de Billing Recovery. No corresponde generar comprobante interno.";

const conn = process.env.DATABASE_URL?.trim();
if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const actor = { actorType: "superadmin", actorId: null };

await client.connect();
try {
  const activeBefore = await findPaidCreditedOrdersWithoutInvoice({ limit: 50 });
  console.log("Activas sin comprobante (antes):", activeBefore.length);

  for (const orderId of DEMO_ORDER_IDS) {
    const result = await markOrderBillingReviewed({
      orderId,
      reviewedBy: "superadmin",
      actor,
      reason: "demo_qa_order",
      notes: NOTES,
      excluded: true,
    });
    console.log(orderId.slice(0, 8), result.ok ? "OK" : "FAIL", result.message);
    if (!result.ok) process.exit(1);
  }

  const activeAfter = await findPaidCreditedOrdersWithoutInvoice({ limit: 50 });
  const excludedAfter = await findPaidCreditedOrdersWithoutInvoice({
    limit: 50,
    onlyExcluded: true,
  });

  console.log("Activas sin comprobante (después):", activeAfter.length);
  console.log("Revisadas/excluidas:", excludedAfter.length);

  const invCount = (
    await client.query(`SELECT count(*)::int AS c FROM billing_invoices`)
  ).rows[0].c;
  const walletCount = (
    await client.query(`SELECT count(*)::int AS c FROM wallet_transactions`)
  ).rows[0].c;

  for (const orderId of DEMO_ORDER_IDS) {
    const row = (
      await client.query(
        `SELECT payment_status, credit_status, metadata FROM sms_orders WHERE id=$1`,
        [orderId],
      )
    ).rows[0];
    const br = row.metadata?.billing_recovery;
    if (!br?.excluded || !br?.reviewed) {
      throw new Error(`Metadata billing_recovery incompleta en ${orderId}`);
    }
    if (row.payment_status !== "paid" || row.credit_status !== "credited") {
      throw new Error(`Estados de pago/crédito cambiaron en ${orderId}`);
    }
  }

  if (activeAfter.length !== 0) {
    throw new Error(`Se esperaban 0 activas, hay ${activeAfter.length}`);
  }
  if (excludedAfter.length !== 4) {
    throw new Error(`Se esperaban 4 excluidas, hay ${excludedAfter.length}`);
  }
  if (invCount !== 1) {
    throw new Error(`billing_invoices debe seguir en 1, hay ${invCount}`);
  }

  console.log("\nOK: 4 órdenes demo marcadas como excluidas.");
  console.log("- invoices:", invCount, "(sin cambios)");
  console.log("- wallet_transactions:", walletCount);
} catch (err) {
  console.error("FALLÓ:", err?.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}
