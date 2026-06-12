/**
 * Restaura +1000 SMS Starter (corrección forward tras reversa equivocada).
 * Uso: node scripts/restore-starter-included-sms-licantravel.mjs [--apply]
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

const REAL_COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";
const SIM_ORDER_ID = "51ed271d-e45c-47ce-8dbc-fe75d22f4dde";
const SIM_ORDER_REF = "TV-MQB4Z880-38FE01";
const BOLSA_ORDER_ID = "23002d41-72fb-4901-bf35-e02f920fb81d";
const RESTORE_SMS = 1000;
const EXPECTED_AVAILABLE = 1199;
const EXPECTED_TOTAL_PURCHASED = 1200;
const IDEMPOTENCY_KEY = "restore-starter-included-sms-TV-MQB4Z880-38FE01";
const APPLY = process.argv.includes("--apply");

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
});

async function audit() {
  const wallet = await client.query(
    `SELECT id, available_sms, total_purchased_sms, consumed_sms FROM company_sms_wallets WHERE company_id = $1`,
    [REAL_COMPANY_ID],
  );
  const txs = await client.query(
    `SELECT id, type, sms_amount, balance_before, balance_after, reference_id, metadata->>'idempotency_key' AS idem
     FROM wallet_transactions WHERE company_id = $1 ORDER BY created_at`,
    [REAL_COMPANY_ID],
  );
  const orders = await client.query(
    `SELECT id, public_checkout_reference, payment_status, credit_status, sms_quantity, metadata
     FROM sms_orders WHERE id = ANY($1::uuid[])`,
    [[SIM_ORDER_ID, BOLSA_ORDER_ID]],
  );
  const restore = await client.query(
    `SELECT id FROM wallet_transactions WHERE company_id = $1 AND metadata->>'idempotency_key' = $2`,
    [REAL_COMPANY_ID, IDEMPOTENCY_KEY],
  );
  return {
    wallet: wallet.rows[0],
    transactions: txs.rows,
    orders: orders.rows,
    existingRestore: restore.rows[0] ?? null,
  };
}

async function main() {
  await client.connect();
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN ===");
  const state = await audit();
  console.log("AUDIT", JSON.stringify(state, null, 2));

  if (state.existingRestore) {
    console.log("IDEMPOTENT: restore already exists", state.existingRestore.id);
    if (state.wallet?.available_sms === EXPECTED_AVAILABLE) {
      await client.end();
      return;
    }
  }

  const beforeAvail = state.wallet.available_sms;
  const beforeTotal = state.wallet.total_purchased_sms;
  const afterAvail = beforeAvail + RESTORE_SMS;
  const afterTotal = beforeTotal + RESTORE_SMS;

  if (state.existingRestore && afterAvail !== EXPECTED_AVAILABLE) {
    console.error("MISMATCH after existing restore", { afterAvail, expected: EXPECTED_AVAILABLE });
    process.exit(3);
  }

  if (!state.existingRestore && afterAvail !== EXPECTED_AVAILABLE) {
    console.error("UNEXPECTED_TARGET", { beforeAvail, afterAvail, expected: EXPECTED_AVAILABLE });
    process.exit(3);
  }

  const simOrder = state.orders.find((o) => o.id === SIM_ORDER_ID);
  const bolsaOrder = state.orders.find((o) => o.id === BOLSA_ORDER_ID);
  if (!simOrder || simOrder.payment_status !== "paid") {
    console.error("SIM order not paid");
    process.exit(2);
  }
  if (!bolsaOrder || bolsaOrder.credit_status !== "credited") {
    console.error("Bolsa order not credited");
    process.exit(2);
  }

  if (!APPLY) {
    console.log("PLAN", {
      correction_credit: RESTORE_SMS,
      before: { available_sms: beforeAvail, total_purchased_sms: beforeTotal },
      after: { available_sms: afterAvail, total_purchased_sms: afterTotal },
      idempotency_key: IDEMPOTENCY_KEY,
    });
    console.log("Run with --apply to execute.");
    await client.end();
    return;
  }

  if (state.existingRestore) {
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    const txId = randomUUID();
    await client.query(
      `INSERT INTO wallet_transactions (
         id, company_id, wallet_id, type, sms_amount, balance_before, balance_after,
         reference_type, reference_id, description, metadata
       ) VALUES ($1,$2,$3,'manual_credit',$4,$5,$6,'sms_order',$7,$8,$9::jsonb)`,
      [
        txId,
        REAL_COMPANY_ID,
        state.wallet.id,
        RESTORE_SMS,
        beforeAvail,
        afterAvail,
        SIM_ORDER_ID,
        "Restauración SMS incluidos plan Starter SIM (corrección forward)",
        JSON.stringify({
          idempotency_key: IDEMPOTENCY_KEY,
          reason: "restore_starter_included_sms_after_wrong_reversal",
          source: "qa_correction_starter_business_rule",
          reference_order_ref: SIM_ORDER_REF,
          correction_type: "starter_included_sms_restore",
        }),
      ],
    );

    const wu = await client.query(
      `UPDATE company_sms_wallets SET available_sms=$2, total_purchased_sms=$3, updated_at=now()
       WHERE id=$1 AND available_sms=$4 AND total_purchased_sms=$5 RETURNING *`,
      [state.wallet.id, afterAvail, afterTotal, beforeAvail, beforeTotal],
    );
    if (!wu.rowCount) throw new Error("wallet_lock_failed");

    const metaPatch = {
      starter_included_sms_confirmed: true,
      starter_included_sms_restored: true,
      starter_included_sms_restored_at: new Date().toISOString(),
      starter_included_sms_restore_reason: "business_rule_starter_includes_1000_sms",
      starter_included_sms_restore_idempotency_key: IDEMPOTENCY_KEY,
    };

    await client.query(
      `UPDATE sms_orders SET credit_status='credited', credited_at=COALESCE(credited_at, now()),
       metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb, updated_at=now()
       WHERE id=$1`,
      [SIM_ORDER_ID, JSON.stringify(metaPatch)],
    );

    await client.query("COMMIT");
    console.log("APPLIED restore_tx", txId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }

  console.log("POST", JSON.stringify(await audit(), null, 2));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
