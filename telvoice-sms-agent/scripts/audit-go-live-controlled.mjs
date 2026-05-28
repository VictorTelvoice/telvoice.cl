#!/usr/bin/env node
/**
 * Auditoría go-live controlado (solo lectura).
 */
import "dotenv/config";
import pg from "pg";

const RETAIL = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";
const BOLSA_PRUEBA = "204786a5-0e70-43d4-8339-8403ccf810c4";
const LICAN = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const AGENT = "https://agent.telvoice.cl";

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const out = { ts: new Date().toISOString() };

await client.connect();
try {
  const q = await client.query(
    `select status, count(*)::int n from sms_send_queue
     where status in ('pending','processing','scheduled')
     group by status order by status`,
  );
  out.sms_send_queue_pending = q.rows;

  const pkg = await client.query(
    `select id, name, sms_quantity, metadata
     from sms_packages where id = $1`,
    [BOLSA_PRUEBA],
  );
  out.bolsa_prueba = pkg.rows[0] ?? null;

  const lic = await client.query(
    `select w.id as wallet_id, w.available_sms,
            crp.rate_plan_id, crp.max_tps, crp.live_enabled,
            crp.campaigns_enabled, crp.api_enabled, crp.status
     from company_sms_wallets w
     left join company_rate_plans crp
       on crp.company_id = w.company_id and crp.status = 'active'
     where w.company_id = $1`,
    [LICAN],
  );
  out.licantravel = lic.rows;

  const emails = await client.query(
    `select template_key, provider, status, created_at
     from email_logs
     where created_at > now() - interval '14 days'
     order by created_at desc limit 10`,
  );
  out.recent_transactional_emails = emails.rows;

  const bill = await client.query(
    `select status, provider, created_at
     from billing_email_logs
     where created_at > now() - interval '14 days'
     order by created_at desc limit 8`,
  );
  out.recent_billing_emails = bill.rows;

  const lastPaid = await client.query(
    `select id, payment_status, credit_status, claim_status, checkout_email, company_id, created_at
     from sms_orders
     where source = 'landing' or metadata->>'source' = 'landing'
     order by created_at desc limit 5`,
  );
  out.recent_landing_orders = lastPaid.rows;
} finally {
  await client.end();
}

const health = await fetch(`${AGENT}/health`).then((r) => r.json());
out.health = health;

const products = await fetch(`${AGENT}/api/public/products`).then((r) => r.json());
out.public_products_count = products.products?.length ?? 0;
out.public_has_bolsa_prueba = Boolean(
  products.products?.some((p) => p.package_id === BOLSA_PRUEBA),
);
out.public_has_qa_unmapped = Boolean(
  products.products?.some((p) => (p.product_name || "").includes("QA Unmapped")),
);

out.env_flags = {
  EMAIL_MODE: process.env.EMAIL_MODE,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  BILLING_EMAIL_MODE: process.env.BILLING_EMAIL_MODE,
  BILLING_EMAIL_PROVIDER: process.env.BILLING_EMAIL_PROVIDER,
  PUBLIC_CHECKOUT_DEFAULT_RATE_PLAN_ID:
    process.env.PUBLIC_CHECKOUT_DEFAULT_RATE_PLAN_ID || RETAIL,
  SMS_PROVIDER_MODE: process.env.SMS_PROVIDER_MODE,
  SMS_LIVE_TEST_ENABLED: process.env.SMS_LIVE_TEST_ENABLED,
  SMS_LIVE_TEST_ALLOWED_COMPANY_IDS: process.env.SMS_LIVE_TEST_ALLOWED_COMPANY_IDS,
  SMS_LIVE_TEST_ALLOWED_NUMBERS: process.env.SMS_LIVE_TEST_ALLOWED_NUMBERS,
  SMS_CAMPAIGN_ENABLED: process.env.SMS_CAMPAIGN_ENABLED,
  SMS_QUEUE_SCHEDULER_ENABLED: process.env.SMS_QUEUE_SCHEDULER_ENABLED,
};

console.log(JSON.stringify(out, null, 2));
