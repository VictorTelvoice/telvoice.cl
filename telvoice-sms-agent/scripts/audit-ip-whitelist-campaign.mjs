#!/usr/bin/env node
/** Auditoría IP not Whitelisted — solo lectura DB + código. */
import "dotenv/config";
import pg from "pg";

const FAILED_CAMPAIGN = "e93a6631-3e24-4f00-9338-c6d53d8956e0";
const FAILED_MSG = "6209386d-9826-4000-a3a7-224e68b409dc";
const FAILED_QUEUE = "3de4eb1a-6dfb-4629-9b79-03a88119951b";
const DEMO = "6cd1db92-d5c7-45e0-8548-df8907843350";

function mask(s) {
  if (!s || typeof s !== "string") return null;
  if (s.length <= 6) return "***";
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

const conn = process.env.DATABASE_URL?.trim();
if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const report = {};

// Failed campaign bundle
const camp = await client.query(
  `SELECT id, name, status, mode, metadata, created_at, updated_at FROM sms_campaigns WHERE id=$1`,
  [FAILED_CAMPAIGN],
);
const msg = await client.query(
  `SELECT id, status, mode, provider, provider_id, route_id, rate_plan_id,
          recipient_number, sender_id, message, segments, cost_sms,
          provider_message_id, error_code, error_message, metadata, created_at, updated_at
   FROM panel_sms_messages WHERE id=$1`,
  [FAILED_MSG],
);
const queue = await client.query(`SELECT * FROM sms_send_queue WHERE id=$1`, [
  FAILED_QUEUE,
]);

report.failed = {
  campaign: camp.rows[0],
  message: msg.rows[0],
  queue: queue.rows[0],
};

// Successful superadmin tests (recent)
const successTests = await client.query(
  `SELECT id, status, mode, provider, provider_id, route_id, rate_plan_id,
          recipient_number, sender_id, provider_message_id, error_code, error_message,
          metadata, created_at
   FROM panel_sms_messages
   WHERE company_id=$1
     AND (
       metadata->>'source' = 'superadmin_provider_test'
       OR mode = 'live_test'
     )
     AND status IN ('sent', 'pending', 'delivered')
   ORDER BY created_at DESC
   LIMIT 10`,
  [DEMO],
);

report.successful_superadmin_or_live_test = successTests.rows.map((r) => ({
  id: r.id,
  status: r.status,
  mode: r.mode,
  provider: r.provider,
  provider_id: r.provider_id,
  route_id: r.route_id,
  rate_plan_id: r.rate_plan_id,
  recipient: r.recipient_number,
  sender_id: r.sender_id,
  provider_message_id: r.provider_message_id,
  created_at: r.created_at,
  metadata_source: r.metadata?.source,
  route_id_meta: r.metadata?.route_id,
  raw_response_status: r.metadata?.raw_response?.status ?? r.metadata?.raw_response?.Status,
  raw_response_remarks: r.metadata?.raw_response?.remarks ?? r.metadata?.raw_response?.Remarks,
}));

// Failed campaign messages with same error recently
const sameError = await client.query(
  `SELECT id, status, mode, metadata->>'source' AS source, error_message, created_at
   FROM panel_sms_messages
   WHERE company_id=$1 AND error_message ILIKE '%whitelist%'
   ORDER BY created_at DESC LIMIT 15`,
  [DEMO],
);
report.other_whitelist_errors = sameError.rows;

// Providers / routes
const providers = await client.query(
  `SELECT id, code, name, status, type, api_base_url, default_sender_id, metadata
   FROM sms_providers WHERE id IN ($1, $2) OR status='active'`,
  [
    report.failed.message?.provider_id,
    report.failed.queue?.provider_id,
  ].filter(Boolean),
);
const routes = await client.query(
  `SELECT r.id, r.name, r.status, r.provider_id, r.country, r.is_default, r.traffic_type,
          p.code AS provider_code
   FROM sms_routes r
   JOIN sms_providers p ON p.id = r.provider_id
   WHERE r.id IN ($1, $2) OR r.status='active'`,
  [report.failed.message?.route_id, report.failed.queue?.route_id].filter(Boolean),
);

report.providers = providers.rows.map((p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  status: p.status,
  api_base_url: p.api_base_url,
  default_sender_id: p.default_sender_id,
  env_prefix: p.metadata?.env_prefix,
}));
report.routes = routes.rows;

// Company rate plans
const crp = await client.query(
  `SELECT crp.id, crp.company_id, crp.rate_plan_id, crp.status, crp.max_tps,
          crp.live_enabled, crp.campaigns_enabled, rp.name AS rate_plan_name
   FROM company_rate_plans crp
   LEFT JOIN sms_rate_plans rp ON rp.id = crp.rate_plan_id
   WHERE crp.company_id=$1 AND crp.status='active'`,
  [DEMO],
);
report.company_rate_plans = crp.rows;

// Wallet unchanged check
const wallet = await client.query(
  `SELECT available_sms, reserved_sms, updated_at FROM company_sms_wallets WHERE company_id=$1`,
  [DEMO],
);
report.wallet = wallet.rows[0];

const debitsFailed = await client.query(
  `SELECT * FROM wallet_transactions WHERE reference_id=$1`,
  [FAILED_MSG],
);
report.debits_on_failed_message = debitsFailed.rows;

// Queue audit log via updated_at timeline
const queueHistory = await client.query(
  `SELECT status, attempts, max_attempts, error_code, error_message,
          locked_by, created_at, updated_at, processed_at
   FROM sms_send_queue WHERE id=$1`,
  [FAILED_QUEUE],
);
report.queue_final = queueHistory.rows[0];

// Live campaign failures
const liveFails = await client.query(
  `SELECT c.id, c.name, c.status, m.id AS message_id, m.status AS msg_status, m.error_message
   FROM sms_campaigns c
   JOIN panel_sms_messages m ON m.campaign_id = c.id
   WHERE c.company_id=$1 AND c.mode='live' AND m.error_message IS NOT NULL
   ORDER BY m.updated_at DESC LIMIT 10`,
  [DEMO],
);
report.live_campaign_failures = liveFails.rows;

// Env vars presence (local .env only — NOT production VPS)
report.local_env_presence = {
  note: "Solo refleja .env local del auditor; producción puede diferir en VPS.",
  ASMSC_API_ID: Boolean(process.env.ASMSC_API_ID?.trim()),
  ASMSC_API_PASSWORD: Boolean(process.env.ASMSC_API_PASSWORD?.trim()),
  ASMSC_BASE_URL: process.env.ASMSC_BASE_URL?.trim() || "(default)",
  ASMSC_DEFAULT_SENDER_ID: process.env.ASMSC_DEFAULT_SENDER_ID?.trim() || "(unset)",
  PUBLIC_WEBHOOK_BASE_URL: process.env.PUBLIC_WEBHOOK_BASE_URL?.trim() || "(unset)",
  SMS_QUEUE_SCHEDULER_ENABLED: process.env.SMS_QUEUE_SCHEDULER_ENABLED ?? "(default true)",
  SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS:
    process.env.SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS ?? "(default 1)",
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? "(unset)",
};

// Mask api id from local if present
if (process.env.ASMSC_API_ID) {
  report.local_env_presence.ASMSC_API_ID_masked = mask(process.env.ASMSC_API_ID);
}

console.log(JSON.stringify(report, null, 2));
await client.end();
