#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const CID = process.argv[2] || "f31d0b0d-fb76-416b-9791-26f14e20d69d";
const CO = "54601663-f35f-4c26-9410-a9d2dc0ad697";

function mask(p) {
  const d = String(p ?? "").replace(/[^\d+]/g, "");
  return d.length < 6 ? "***" : d.slice(0, 4) + "****" + d.slice(-3);
}

const cs = process.env.DATABASE_URL;
const c = new pg.Client({
  connectionString: cs,
  ssl: cs?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const camp = (await c.query(`SELECT * FROM sms_campaigns WHERE id=$1`, [CID]))
  .rows[0];
const msgs = (
  await c.query(
    `SELECT id, recipient_number, status, provider, provider_message_id, sender_id,
            mode, cost_sms, segments, delivered_at, error_code, error_message, created_at
     FROM panel_sms_messages WHERE campaign_id=$1 ORDER BY created_at`,
    [CID],
  )
).rows;
const queue = (
  await c.query(
    `SELECT id, status, attempts, error_code, error_message, message_id
     FROM sms_send_queue WHERE campaign_id=$1`,
    [CID],
  )
).rows;
const ids = msgs.map((m) => m.id);
const deb = (
  await c.query(
    `SELECT id, sms_amount, reference_id, reference_type, balance_before, balance_after, created_at
     FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_id = ANY($2::uuid[])`,
    [CO, ids],
  )
).rows;
const dlr = (
  await c.query(
    `SELECT message_id, status, provider_message_id, created_at
     FROM panel_sms_delivery_events WHERE message_id = ANY($1::uuid[]) ORDER BY created_at`,
    [ids],
  )
).rows;
const wallet = (
  await c.query(
    `SELECT available_sms FROM company_sms_wallets WHERE company_id=$1`,
    [CO],
  )
).rows[0];
const crp = (
  await c.query(
    `SELECT traffic_type, campaigns_enabled, api_enabled, max_tps, live_enabled
     FROM company_rate_plans WHERE company_id=$1 AND country='CL'`,
    [CO],
  )
).rows;
const dupDeb = (
  await c.query(
    `SELECT reference_id, count(*)::int c FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_id = ANY($2::uuid[])
     GROUP BY reference_id HAVING count(*) > 1`,
    [CO, ids],
  )
).rows;

const byStatus = msgs.reduce((a, m) => {
  a[m.status] = (a[m.status] ?? 0) + 1;
  return a;
}, {});

console.log(
  JSON.stringify(
    {
      campaign_id: CID,
      campaign_status: camp?.status,
      campaign_mode: camp?.mode,
      campaign_metadata: camp?.metadata,
      recipients_valid: msgs.length,
      messages_by_status: byStatus,
      messages: msgs.map((m) => ({
        id: m.id,
        recipient: mask(m.recipient_number),
        status: m.status,
        provider: m.provider,
        provider_message_id: m.provider_message_id,
        sender_id: m.sender_id,
        mode: m.mode,
        cost_sms: m.cost_sms,
        segments: m.segments,
        delivered_at: m.delivered_at,
      })),
      queue,
      wallet_debits: deb,
      wallet_debit_total_sms: deb.reduce((s, d) => s + Number(d.sms_amount || 0), 0),
      wallet_available_now: wallet?.available_sms,
      dlr_events: dlr,
      company_rate_plans: crp,
      duplicate_debits: dupDeb,
      env: {
        SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST:
          process.env.SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST,
        SMS_PROVIDER_MODE: process.env.SMS_PROVIDER_MODE,
      },
    },
    null,
    2,
  ),
);
await c.end();
