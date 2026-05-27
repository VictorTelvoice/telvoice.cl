#!/usr/bin/env node
/** Pre-checks QA live controlada — solo lectura DB. */
import 'dotenv/config';
import pg from 'pg';

const COMPANY_ID = '6cd1db92-d5c7-45e0-8548-df8907843350';
const conn = process.env.DATABASE_URL?.trim();
if (!conn) {
  console.error('DATABASE_URL requerido');
  process.exit(2);
}

const c = new pg.Client({
  connectionString: conn,
  ssl: conn.includes('supabase') ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const wallet = await c.query(
  'select available_sms, reserved_sms, updated_at from company_sms_wallets where company_id=$1',
  [COMPANY_ID],
);

const crp = await c.query(
  `select id, status, campaigns_enabled, live_enabled, max_tps, rate_plan_id
   from company_rate_plans where company_id=$1 and status='active'`,
  [COMPANY_ID],
);

const providers = await c.query(
  `select id, code, name, status, type from sms_providers where status='active'`,
);

const routes = await c.query(
  `select id, name, status, provider_id, country, traffic_type, is_default
   from sms_routes where status='active'`,
);

const liveQueuePending = await c.query(
  `select q.id, q.status, q.attempts, q.max_attempts, q.scheduled_at, q.error_message,
          q.campaign_id, q.message_id, q.provider_id, q.route_id
   from sms_send_queue q
   join sms_campaigns c on c.id=q.campaign_id
   where c.company_id=$1 and c.mode='live' and q.status in ('queued','processing','paused')
   order by q.created_at desc limit 25`,
  [COMPANY_ID],
);

const liveProcessingCampaigns = await c.query(
  `select id, name, status, mode, updated_at
   from sms_campaigns
   where company_id=$1 and mode='live' and status='processing'
   order by updated_at desc limit 25`,
  [COMPANY_ID],
);

console.log(JSON.stringify({
  wallet: wallet.rows[0] ?? null,
  company_rate_plans_active: crp.rows,
  active_providers: providers.rows,
  active_routes: routes.rows,
  pending_live_queue_items: liveQueuePending.rows,
  processing_live_campaigns: liveProcessingCampaigns.rows,
}, null, 2));

await c.end();
