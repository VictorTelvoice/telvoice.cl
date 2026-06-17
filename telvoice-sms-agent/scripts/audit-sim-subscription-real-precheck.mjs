#!/usr/bin/env node
/**
 * Precheck producción — suscripción SIM real controlada (solo lectura).
 */
import "dotenv/config";
import pg from "pg";

const AGENT = process.env.AGENT_BASE_URL || "https://agent.telvoice.cl";
const EMAIL = "licantravel@gmail.com";
const COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";
const PROTECTED = ["021", "513"];
const TARGET_SUFFIX = "030";
const ACCIDENTAL_REFS = ["TV-MQGMULDT-44B9FE", "TV-MQGMUN2M-C61108"];

function maskSuffix(s) {
  return `***${String(s).slice(-3)}`;
}

async function pgQuery(sql, params = []) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("=== Precheck suscripción SIM real (producción) ===\n");

  const health = await fetch(`${AGENT}/health`).then((r) => r.json());
  console.log("health:", { build: health.build, ok: health.status === "ok" });

  const nums = await fetch(`${AGENT}/api/public/sim-available-numbers?limit=10`).then((r) =>
    r.json(),
  );
  console.log("\nInventario público:");
  for (const n of nums.numbers ?? []) {
    console.log(`  ${maskSuffix(n.suffix)} available=${nums.available}`);
  }

  const pending = await fetch(
    `${AGENT}/api/public/pending-sim-checkout?email=${encodeURIComponent(EMAIL)}`,
  ).then((r) => r.json());
  console.log("\nPending checkout:", {
    has_pending: pending.has_pending_order,
    expired: pending.reservation_expired,
  });

  const inv = await pgQuery(
    `SELECT right(regexp_replace(e164_number,'[^0-9]','','g'),3) AS suffix,
            sales_status, current_order_id IS NOT NULL AS reserved,
            current_company_id, reserved_until
     FROM real_number_inventory
     WHERE right(regexp_replace(e164_number,'[^0-9]','','g'),3) = ANY($1::text[])`,
    [[TARGET_SUFFIX, ...PROTECTED]],
  );
  console.log("\nInventario DB:");
  for (const r of inv.rows) {
    console.log(
      `  ${maskSuffix(r.suffix)} status=${r.sales_status} reserved=${r.reserved} company=${r.current_company_id ? "yes" : "no"}`,
    );
  }

  const wallet = await pgQuery(
    `SELECT available_sms, total_purchased_sms FROM company_sms_wallets WHERE company_id = $1`,
    [COMPANY_ID],
  );
  console.log("\nWallet Licantravel (antes):", wallet.rows[0] ?? "sin wallet");

  const accidental = await pgQuery(
    `SELECT public_checkout_reference, payment_status, credit_status
     FROM sms_orders WHERE public_checkout_reference = ANY($1::text[])`,
    [ACCIDENTAL_REFS],
  );
  console.log("\nÓrdenes accidentales:");
  for (const r of accidental.rows) {
    console.log(`  ${r.public_checkout_reference}: ${r.payment_status}/${r.credit_status}`);
  }

  const qaCfg = {
    enabled: process.env.SIM_SUBSCRIPTION_QA_REAL_ENABLED,
    emails: process.env.SIM_SUBSCRIPTION_QA_REAL_EMAILS ? "set" : "empty",
    suffixes: process.env.SIM_SUBSCRIPTION_QA_REAL_ALLOWED_SUFFIXES,
    amount: process.env.SIM_SUBSCRIPTION_QA_REAL_MONTHLY_AMOUNT_CLP,
  };
  console.log("\nQA real pricing env:", qaCfg);

  const subTable = await pgQuery(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='sim_subscriptions'
    ) AS ok`,
  );
  console.log("sim_subscriptions table:", subTable.rows[0]?.ok ? "yes" : "no");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
