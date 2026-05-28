#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const COMPANY_ID = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const WALLET_ID = "6d873673-947b-4657-96f0-031d14db45fd";
const EXPECTED_TO = "+56934449937";

const cs = process.env.DATABASE_URL?.trim();
if (!cs) throw new Error("missing DATABASE_URL");
const c = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const wallet = (
  await c.query(
    "SELECT id, available_sms, status, updated_at FROM company_sms_wallets WHERE id = $1",
    [WALLET_ID],
  )
).rows[0];

const messages = (
  await c.query(
    `SELECT id, company_id, campaign_id, recipient_number, sender_id, message, segments,
            cost_sms, status, mode, provider, provider_message_id, error_code, error_message,
            delivered_at, created_at, updated_at, metadata
     FROM panel_sms_messages
     WHERE company_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [COMPANY_ID],
  )
).rows;

const recentMsg = messages.filter((m) => {
  const n = String(m.recipient_number ?? "").replace(/\D/g, "");
  return n.includes("56934449937") || m.recipient_number === EXPECTED_TO;
});

const debits = (
  await c.query(
    `SELECT id, type, sms_amount, balance_before, balance_after,
            reference_type, reference_id, description, created_at
     FROM wallet_transactions
     WHERE company_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [COMPANY_ID],
  )
).rows;

const smsDebits = debits.filter((t) => t.type === "sms_debit");

const campaigns = (
  await c.query(
    `SELECT count(*)::int AS c FROM sms_campaigns WHERE company_id = $1`,
    [COMPANY_ID],
  )
).rows[0].c;

let deliveryEvents = [];
if (messages[0]?.id) {
  const msgIds = messages.map((m) => m.id);
  deliveryEvents = (
    await c.query(
      `SELECT id, message_id, company_id, provider, provider_message_id, status, created_at
       FROM panel_sms_delivery_events
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [COMPANY_ID],
    )
  ).rows;
}

const purchaseCredits = debits.filter((t) => t.type === "purchase_credit");

console.log(
  JSON.stringify(
    {
      wallet,
      panel_messages_total: messages.length,
      messages_matching_dest: recentMsg,
      all_recent_messages: messages,
      sms_debit_transactions: smsDebits,
      purchase_credit_count: purchaseCredits.length,
      recent_wallet_tx: debits.slice(0, 10),
      sms_campaigns_count: campaigns,
      delivery_events: deliveryEvents,
    },
    null,
    2,
  ),
);

await c.end();
