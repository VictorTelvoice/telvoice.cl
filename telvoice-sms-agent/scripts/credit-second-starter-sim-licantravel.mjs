/**
 * Reparación idempotente — segunda SIM Starter Licantravel (TV-MQBHXN76-290BEA).
 * - Acredita +1000 SMS incluidos del segundo Starter
 * - Deduplica client_numbers ***021 (conserva el vinculado a inventario)
 *
 * Uso VPS:
 *   node scripts/credit-second-starter-sim-licantravel.mjs
 *   node scripts/credit-second-starter-sim-licantravel.mjs --apply
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

const REAL_COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";
const ORDER_ID = "abb46c1f-3fed-4437-b443-035d08835f03";
const ORDER_REF = "TV-MQBHXN76-290BEA";
const MP_PAYMENT_ID = "163051078027";
const INVENTORY_ID = "b001bb25-f520-4ac7-94de-4ce08292c88f";
const KEEP_CLIENT_NUMBER_ID = "6f0f7869-1d5d-4972-983e-7e09c285f138";
const DUPLICATE_CLIENT_NUMBER_ID = "9833b57d-b412-4a4b-8d2a-ed0952c5153e";
const SMS_CREDIT = 1000;
const EXPECTED_BEFORE_AVAILABLE = 1199;
const EXPECTED_AFTER_AVAILABLE = 2199;
const IDEMPOTENCY_KEY = "credit-second-starter-TV-MQBHXN76-290BEA";
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
  const order = await client.query(
    `SELECT id, public_checkout_reference, payment_status, credit_status, amount, company_id,
            metadata->>'mercadopago_payment_id' AS mp_payment_id,
            metadata->>'product_type' AS product_type,
            metadata->>'sim_plan_id' AS sim_plan_id,
            metadata->>'included_sms_monthly' AS included_sms_monthly,
            metadata->>'inventory_number_id' AS inventory_number_id
     FROM sms_orders WHERE public_checkout_reference = $1`,
    [ORDER_REF],
  );
  const wallet = await client.query(
    `SELECT id, available_sms, total_purchased_sms, consumed_sms
     FROM company_sms_wallets WHERE company_id = $1`,
    [REAL_COMPANY_ID],
  );
  const creditTx = await client.query(
    `SELECT id, type, sms_amount, balance_before, balance_after, metadata
     FROM wallet_transactions
     WHERE company_id = $1
       AND (reference_id = $2 OR metadata->>'idempotency_key' = $3)
     ORDER BY created_at`,
    [REAL_COMPANY_ID, ORDER_ID, IDEMPOTENCY_KEY],
  );
  const cn = await client.query(
    `SELECT id, status, right(regexp_replace(number, '[^0-9]', '', 'g'), 3) AS suffix, created_at
     FROM client_numbers WHERE company_id = $1 ORDER BY created_at`,
    [REAL_COMPANY_ID],
  );
  const inv = await client.query(
    `SELECT id, sales_status, current_company_id, current_client_number_id
     FROM real_number_inventory WHERE id = $1`,
    [INVENTORY_ID],
  );
  const act = await client.query(
    `SELECT id, activation_status, client_number_id, inventory_number_id
     FROM sim_activation_requests WHERE order_id = $1`,
    [ORDER_ID],
  );
  const emails = await client.query(
    `SELECT template_key, status, count(*)::int AS n
     FROM email_logs WHERE order_id = $1 GROUP BY template_key, status ORDER BY 1, 2`,
    [ORDER_ID],
  );
  return {
    order: order.rows[0],
    wallet: wallet.rows[0],
    creditTx: creditTx.rows,
    clientNumbers: cn.rows,
    inventory: inv.rows[0],
    activation: act.rows[0],
    emails: emails.rows,
  };
}

function validatePre(state) {
  const blockers = [];
  if (!state.order) blockers.push("order_not_found");
  if (state.order?.payment_status !== "paid") blockers.push("order_not_paid");
  if (String(state.order?.mp_payment_id) !== MP_PAYMENT_ID) {
    blockers.push(`mp_payment_mismatch:${state.order?.mp_payment_id}`);
  }
  if (state.order?.product_type !== "sim_agent_bundle") blockers.push("not_sim_agent_bundle");
  if (state.order?.sim_plan_id !== "sim_starter") blockers.push("not_sim_starter");
  if (Number(state.order?.included_sms_monthly) !== SMS_CREDIT) {
    blockers.push(`included_sms_mismatch:${state.order?.included_sms_monthly}`);
  }
  if (state.order?.company_id !== REAL_COMPANY_ID) blockers.push("company_mismatch");
  if (state.order?.inventory_number_id !== INVENTORY_ID) blockers.push("inventory_mismatch");
  if (!state.wallet) blockers.push("wallet_not_found");
  if (state.creditTx.some((t) => t.type === "purchase_credit" || t.type === "manual_credit")) {
    // ok if idempotent re-run
  }
  if (state.inventory?.current_client_number_id !== KEEP_CLIENT_NUMBER_ID) {
    blockers.push(
      `inventory_points_to:${state.inventory?.current_client_number_id ?? "null"}`,
    );
  }
  if (state.activation?.client_number_id !== KEEP_CLIENT_NUMBER_ID) {
    blockers.push(`activation_points_to:${state.activation?.client_number_id ?? "null"}`);
  }
  return blockers;
}

async function main() {
  await client.connect();
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN ===");
  const before = await audit();
  console.log("AUDIT_BEFORE", JSON.stringify(before, null, 2));

  const blockers = validatePre(before);
  if (blockers.length) {
    console.error("PRECONDITION_FAILED", blockers);
    process.exit(2);
  }

  const existingCredit = before.creditTx.find(
    (t) => t.metadata?.idempotency_key === IDEMPOTENCY_KEY,
  );
  const dup021 = before.clientNumbers.filter((r) => r.suffix === "021" && r.status === "active");

  const plan = {
    wallet_before: before.wallet.available_sms,
    wallet_after: existingCredit
      ? before.wallet.available_sms
      : before.wallet.available_sms + SMS_CREDIT,
    credit_idempotent: Boolean(existingCredit),
    dedup_needed: dup021.length > 1,
    keep_client_number: KEEP_CLIENT_NUMBER_ID,
    remove_client_number: DUPLICATE_CLIENT_NUMBER_ID,
    idempotency_key: IDEMPOTENCY_KEY,
  };

  if (!existingCredit && before.wallet.available_sms !== EXPECTED_BEFORE_AVAILABLE) {
    console.warn("WARN wallet before unexpected", {
      expected: EXPECTED_BEFORE_AVAILABLE,
      actual: before.wallet.available_sms,
    });
  }

  if (!APPLY) {
    console.log("PLAN", JSON.stringify(plan, null, 2));
    console.log("Run with --apply to execute.");
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    if (!existingCredit) {
      const beforeAvail = before.wallet.available_sms;
      const beforeTotal = before.wallet.total_purchased_sms;
      const afterAvail = beforeAvail + SMS_CREDIT;
      const afterTotal = beforeTotal + SMS_CREDIT;
      const txId = randomUUID();

      await client.query(
        `INSERT INTO wallet_transactions (
           id, company_id, wallet_id, type, sms_amount, balance_before, balance_after,
           reference_type, reference_id, description, metadata
         ) VALUES ($1,$2,$3,'manual_credit',$4,$5,$6,'sms_order',$7,$8,$9::jsonb)`,
        [
          txId,
          REAL_COMPANY_ID,
          before.wallet.id,
          SMS_CREDIT,
          beforeAvail,
          afterAvail,
          ORDER_ID,
          "SMS incluidos plan Starter SIM — segunda numeración Licantravel",
          JSON.stringify({
            idempotency_key: IDEMPOTENCY_KEY,
            reason: "second_starter_included_sms",
            source: "qa_repair_second_sim_starter",
            reference_order_ref: ORDER_REF,
            correction_type: "second_starter_included_sms",
          }),
        ],
      );

      const wu = await client.query(
        `UPDATE company_sms_wallets
         SET available_sms = $2, total_purchased_sms = $3, updated_at = now()
         WHERE id = $1 AND available_sms = $4 AND total_purchased_sms = $5
         RETURNING available_sms, total_purchased_sms`,
        [before.wallet.id, afterAvail, afterTotal, beforeAvail, beforeTotal],
      );
      if (!wu.rowCount) throw new Error("wallet_lock_failed");
    }

    const metaPatch = {
      starter_included_sms_confirmed: true,
      included_sms_credited: SMS_CREDIT,
      included_sms_credit_reason: "second_starter_purchase",
      included_sms_credit_idempotency_key: IDEMPOTENCY_KEY,
    };

    await client.query(
      `UPDATE sms_orders
       SET credit_status = 'credited',
           credited_at = COALESCE(credited_at, now()),
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [ORDER_ID, JSON.stringify(metaPatch)],
    );

    const dupRow = await client.query(
      `SELECT id, status FROM client_numbers WHERE id = $1 AND company_id = $2`,
      [DUPLICATE_CLIENT_NUMBER_ID, REAL_COMPANY_ID],
    );
    if (dupRow.rowCount && dupRow.rows[0].status === "active") {
      await client.query(
        `UPDATE client_numbers SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND company_id = $2 AND status = 'active'`,
        [DUPLICATE_CLIENT_NUMBER_ID, REAL_COMPANY_ID],
      );
    }

    await client.query(
      `UPDATE real_number_inventory
       SET current_client_number_id = $2, current_company_id = $3, updated_at = now()
       WHERE id = $1`,
      [INVENTORY_ID, KEEP_CLIENT_NUMBER_ID, REAL_COMPANY_ID],
    );

    await client.query(
      `UPDATE sim_activation_requests
       SET client_number_id = $2, activation_status = 'active', updated_at = now()
       WHERE order_id = $1`,
      [ORDER_ID, KEEP_CLIENT_NUMBER_ID],
    );

    await client.query(
      `UPDATE email_logs
       SET status = 'skipped', metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE order_id = $1 AND status = 'pending'`,
      [
        ORDER_ID,
        JSON.stringify({
          skipped_reason: "superseded_by_sent_duplicate_race",
          repair_script: "credit-second-starter-sim-licantravel",
        }),
      ],
    );

    await client.query("COMMIT");
    console.log("APPLIED_OK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }

  const after = await audit();
  console.log("AUDIT_AFTER", JSON.stringify(after, null, 2));

  const activeCn = after.clientNumbers.filter((r) => r.status === "active");
  if (after.wallet.available_sms !== EXPECTED_AFTER_AVAILABLE) {
    console.error("POST wallet mismatch", after.wallet.available_sms);
    process.exit(3);
  }
  if (activeCn.length !== 2) {
    console.error("POST client_numbers active count", activeCn.length);
    process.exit(3);
  }
  if (after.order.credit_status !== "credited") {
    console.error("POST credit_status", after.order.credit_status);
    process.exit(3);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
