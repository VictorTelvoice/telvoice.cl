#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const DEMO = "6cd1db92-d5c7-45e0-8548-df8907843350";
const LICA = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const RETAIL = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";

const cs = process.env.DATABASE_URL;
const c = new pg.Client({
  connectionString: cs,
  ssl: cs?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const orders = (
  await c.query(
    `SELECT o.id, o.checkout_email, o.payment_status, o.credit_status, o.claim_status,
            o.company_id, o.sms_quantity, o.amount, o.public_checkout_reference,
            o.created_at, o.claimed_at, p.name AS package_name
     FROM sms_orders o
     LEFT JOIN sms_packages p ON p.id = o.package_id
     WHERE o.company_id IS NULL OR o.company_id NOT IN ($1, $2)
     ORDER BY o.created_at DESC LIMIT 20`,
    [DEMO, LICA],
  )
).rows;

const companies = (
  await c.query(
    `SELECT c.id, c.name, c.billing_email, c.status, c.created_at,
            w.id AS wallet_id, w.available_sms
     FROM companies c
     LEFT JOIN company_sms_wallets w ON w.company_id = c.id
     WHERE c.id NOT IN ($1, $2)
     ORDER BY c.created_at DESC LIMIT 15`,
    [DEMO, LICA],
  )
).rows;

for (const co of companies) {
  const crp = (
    await c.query(
      `SELECT traffic_type, campaigns_enabled, api_enabled, max_tps, live_enabled, rate_plan_id
       FROM company_rate_plans WHERE company_id=$1 AND country='CL'`,
      [co.id],
    )
  ).rows;
  co.rate_plans = crp;
  const ord = (
    await c.query(
      `SELECT id, checkout_email, payment_status, credit_status, claim_status, sms_quantity
       FROM sms_orders WHERE company_id=$1 ORDER BY created_at DESC LIMIT 3`,
      [co.id],
    )
  ).rows;
  co.orders = ord;
}

console.log(JSON.stringify({ orders, companies }, null, 2));
await c.end();
