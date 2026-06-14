/**
 * Reversa idempotente del crédito wallet erróneo (+1000 SMS) en orden SIM Licantravel.
 * Uso: node scripts/reverse-sim-wallet-credit-licantravel.mjs [--apply]
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

const REAL_COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";
const SIM_ORDER_ID = "51ed271d-e45c-47ce-8dbc-fe75d22f4dde";
const SIM_ORDER_REF = "TV-MQB4Z880-38FE01";
const BOLSA_ORDER_ID = "23002d41-72fb-4901-bf35-e02f920fb81d";
const BOLSA_ORDER_REF = "TV-MQBE4TGZ-4C24FA";
const EXPECTED_WALLET_SMS = 200;
const REVERSAL_SMS = 1000;
const IDEMPOTENCY_KEY = "reverse-sim-credit-TV-MQB4Z880-38FE01";
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
    `SELECT id, company_id, available_sms, total_purchased_sms, consumed_sms, reserved_sms, status
     FROM company_sms_wallets WHERE company_id = $1`,
    [REAL_COMPANY_ID],
  );
  const txs = await client.query(
    `SELECT id, type, sms_amount, balance_before, balance_after, reference_type, reference_id, description, metadata, created_at
     FROM wallet_transactions WHERE company_id = $1 ORDER BY created_at`,
    [REAL_COMPANY_ID],
  );
  const orders = await client.query(
    `SELECT id, public_checkout_reference, payment_status, credit_status, sms_quantity, package_id, metadata
     FROM sms_orders WHERE id = ANY($1::uuid[])`,
    [[SIM_ORDER_ID, BOLSA_ORDER_ID]],
  );
  const reversal = await client.query(
    `SELECT id FROM wallet_transactions
     WHERE company_id = $1
       AND metadata->>'idempotency_key' = $2`,
    [REAL_COMPANY_ID, IDEMPOTENCY_KEY],
  );
  const emails = await client.query(
    `SELECT id, template_key, status FROM email_logs WHERE order_id = $1 AND template_key = 'payment_received_pending_claim'`,
    [BOLSA_ORDER_ID],
  );
  const cn = await client.query(
    `SELECT id, status, company_id, right(regexp_replace(number, '[^0-9]', '', 'g'), 3) AS suffix
     FROM client_numbers WHERE company_id = $1 AND status = 'active'`,
    [REAL_COMPANY_ID],
  );
  return {
    wallet: wallet.rows[0] ?? null,
    transactions: txs.rows,
    orders: orders.rows,
    existingReversal: reversal.rows[0] ?? null,
    bolsaEmails: emails.rows,
    clientNumber: cn.rows[0] ?? null,
  };
}

function findTx(txs, orderId, type) {
  return txs.find((t) => t.reference_id === orderId && t.type === type);
}

async function main() {
  await client.connect();
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN ===");

  const state = await audit();
  console.log("AUDIT", JSON.stringify(state, null, 2));

  const blockers = [];
  if (!state.wallet) blockers.push("wallet_missing");
  if (!state.orders.find((o) => o.id === SIM_ORDER_ID)) blockers.push("sim_order_missing");
  if (!state.orders.find((o) => o.id === BOLSA_ORDER_ID)) blockers.push("bolsa_order_missing");

  const bolsaTx = findTx(state.transactions, BOLSA_ORDER_ID, "purchase_credit");
  const simTx = findTx(state.transactions, SIM_ORDER_ID, "purchase_credit");
  if (!bolsaTx || bolsaTx.sms_amount !== 200) blockers.push("bolsa_purchase_credit_missing_or_wrong");
  if (!simTx || simTx.sms_amount !== 1000) blockers.push("sim_erroneous_credit_missing_or_wrong");

  const simOrder = state.orders.find((o) => o.id === SIM_ORDER_ID);
  const bolsaOrder = state.orders.find((o) => o.id === BOLSA_ORDER_ID);
  if (bolsaOrder?.payment_status !== "paid" || bolsaOrder?.credit_status !== "credited") {
    blockers.push("bolsa_order_not_paid_credited");
  }

  if (state.existingReversal) {
    console.log("IDEMPOTENT: reversal already exists", state.existingReversal.id);
    if (state.wallet.available_sms === EXPECTED_WALLET_SMS) {
      console.log("Wallet already at target", EXPECTED_WALLET_SMS);
      await client.end();
      return;
    }
    blockers.push("reversal_exists_but_wallet_not_200");
  }

  if (blockers.length) {
    console.error("BLOCKERS", blockers);
    process.exit(2);
  }

  const beforeAvailable = state.wallet.available_sms;
  const beforeTotal = state.wallet.total_purchased_sms;
  const afterAvailable = beforeAvailable - REVERSAL_SMS;
  const afterTotal = beforeTotal - REVERSAL_SMS;

  if (afterAvailable !== EXPECTED_WALLET_SMS) {
    console.error("UNEXPECTED_TARGET", { beforeAvailable, afterAvailable, expected: EXPECTED_WALLET_SMS });
    process.exit(3);
  }

  const plan = {
    wallet_id: state.wallet.id,
    before: { available_sms: beforeAvailable, total_purchased_sms: beforeTotal },
    after: { available_sms: afterAvailable, total_purchased_sms: afterTotal },
    reversal: {
      type: "reversal",
      sms_amount: REVERSAL_SMS,
      balance_before: beforeAvailable,
      balance_after: afterAvailable,
      reference_type: "sms_order",
      reference_id: SIM_ORDER_ID,
      idempotency_key: IDEMPOTENCY_KEY,
      erroneous_tx_id: simTx.id,
    },
    sim_order: {
      credit_status: "pending",
      credited_at: null,
      metadata_patch: {
        wallet_credit_reversed: true,
        wallet_credit_reversal_reason: "sim_bundle_should_not_credit_wallet",
        wallet_credit_reversal_sms: REVERSAL_SMS,
        wallet_credit_reversed_at: new Date().toISOString(),
        wallet_credit_reversal_source: "qa_correction_before_inbound_sms",
        wallet_credit_reversal_idempotency_key: IDEMPOTENCY_KEY,
      },
    },
    email_pending_to_skip: state.bolsaEmails.filter((e) => e.status === "pending"),
  };

  console.log("PLAN", JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log("Run with --apply to execute.");
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    const reversalId = randomUUID();
    await client.query(
      `INSERT INTO wallet_transactions (
         id, company_id, wallet_id, type, sms_amount, balance_before, balance_after,
         reference_type, reference_id, description, metadata
       ) VALUES ($1,$2,$3,'reversal',$4,$5,$6,'sms_order',$7,$8,$9::jsonb)`,
      [
        reversalId,
        REAL_COMPANY_ID,
        state.wallet.id,
        REVERSAL_SMS,
        beforeAvailable,
        afterAvailable,
        SIM_ORDER_ID,
        "Reversa crédito wallet erróneo — orden SIM no es bolsa SMS",
        JSON.stringify({
          idempotency_key: IDEMPOTENCY_KEY,
          reason: "reverse_erroneous_sim_wallet_credit",
          source: "qa_correction_before_inbound_sms",
          reference_order_ref: SIM_ORDER_REF,
          erroneous_purchase_credit_id: simTx.id,
          correction_type: "sim_wrong_credit_reversal",
        }),
      ],
    );

    const walletUpdate = await client.query(
      `UPDATE company_sms_wallets
       SET available_sms = $2, total_purchased_sms = $3, updated_at = now()
       WHERE id = $1 AND available_sms = $4 AND total_purchased_sms = $5
       RETURNING *`,
      [state.wallet.id, afterAvailable, afterTotal, beforeAvailable, beforeTotal],
    );
    if (!walletUpdate.rowCount) throw new Error("wallet_optimistic_lock_failed");

    await client.query(
      `UPDATE sms_orders
       SET credit_status = 'pending',
           credited_at = NULL,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [SIM_ORDER_ID, JSON.stringify(plan.sim_order.metadata_patch)],
    );

    for (const email of plan.email_pending_to_skip) {
      await client.query(
        `UPDATE email_logs
         SET status = 'skipped',
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE id = $1 AND status = 'pending'`,
        [
          email.id,
          JSON.stringify({
            superseded_reason: "duplicate_pending_race",
            superseded_at: new Date().toISOString(),
            superseded_by: "reverse-sim-wallet-credit-licantravel",
          }),
        ],
      );
    }

    await client.query("COMMIT");
    console.log("APPLIED reversal_id", reversalId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  const after = await audit();
  console.log("POST_AUDIT", JSON.stringify(after, null, 2));
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
