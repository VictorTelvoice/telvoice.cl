#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const DEMO = "6cd1db92-d5c7-45e0-8548-df8907843350";
const LICA = "54601663-f35f-4c26-9410-a9d2dc0ad697";

const cs = process.env.DATABASE_URL;
const c = new pg.Client({
  connectionString: cs,
  ssl: cs?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const paid = (
  await c.query(
    `SELECT o.id, o.checkout_email, o.payment_status, o.credit_status, o.claim_status,
            o.company_id, o.sms_quantity, o.created_at, o.claimed_at,
            p.name AS package_name, c.name AS company_name, c.billing_email,
            w.id AS wallet_id, w.available_sms
     FROM sms_orders o
     LEFT JOIN sms_packages p ON p.id = o.package_id
     LEFT JOIN companies c ON c.id = o.company_id
     LEFT JOIN company_sms_wallets w ON w.company_id = c.id
     WHERE o.payment_status = 'paid'
       AND (o.company_id IS NULL OR o.company_id NOT IN ($1, $2))
       AND COALESCE(o.checkout_email, '') NOT LIKE '%telvoice.test%'
       AND COALESCE(o.checkout_email, '') NOT LIKE '%@example.%'
       AND COALESCE(o.checkout_email, '') NOT LIKE 'qa.%'
       AND COALESCE(o.checkout_email, '') NOT LIKE 'qa-%'
       AND COALESCE(o.checkout_email, '') NOT LIKE 'qa+%'
       AND COALESCE(c.name, '') NOT LIKE 'QA %'
     ORDER BY o.created_at DESC LIMIT 25`,
    [DEMO, LICA],
  )
).rows;

const pendingClaim = (
  await c.query(
    `SELECT o.id, o.checkout_email, o.payment_status, o.credit_status, o.claim_status,
            o.company_id, o.sms_quantity, p.name AS package_name, o.created_at
     FROM sms_orders o
     LEFT JOIN sms_packages p ON p.id = o.package_id
     WHERE o.payment_status = 'paid'
       AND o.credit_status = 'pending_claim'
       AND o.claim_status = 'unclaimed'
       AND COALESCE(o.checkout_email, '') NOT LIKE '%telvoice.test%'
     ORDER BY o.created_at DESC LIMIT 15`,
  )
).rows;

const commercialClaimed = (
  await c.query(
    `SELECT o.id, o.checkout_email, o.claim_status, o.credit_status,
            c.id AS company_id, c.name, w.available_sms, p.name AS package_name
     FROM sms_orders o
     JOIN companies c ON c.id = o.company_id
     LEFT JOIN company_sms_wallets w ON w.company_id = c.id
     LEFT JOIN sms_packages p ON p.id = o.package_id
     WHERE o.claim_status = 'claimed'
       AND o.payment_status = 'paid'
       AND o.company_id NOT IN ($1, $2)
       AND p.name NOT ILIKE '%prueba%'
       AND p.name NOT ILIKE '%test%'
       AND c.name NOT ILIKE 'QA %'
     ORDER BY o.claimed_at DESC NULLS LAST LIMIT 10`,
    [DEMO, LICA],
  )
).rows;

console.log(
  JSON.stringify(
    { paid_non_qa: paid, pending_claim_realish: pendingClaim, commercial_claimed: commercialClaimed },
    null,
    2,
  ),
);
await c.end();
