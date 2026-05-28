#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const PKG = "204786a5-0e70-43d4-8339-8403ccf810c4";
const cs = process.env.DATABASE_URL;
const c = new pg.Client({
  connectionString: cs,
  ssl: cs?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();
const { rows } = await c.query(
  `SELECT o.id, o.checkout_email, o.payment_status, o.credit_status, o.claim_status,
          o.company_id, o.created_at, o.metadata
   FROM sms_orders o
   WHERE o.package_id = $1
   ORDER BY o.created_at DESC LIMIT 15`,
  [PKG],
);
console.log(JSON.stringify(rows.map((r) => ({
  id: r.id,
  email: r.checkout_email,
  payment: r.payment_status,
  credit: r.credit_status,
  claim: r.claim_status,
  company_id: r.company_id,
  created_at: r.created_at,
  mp: r.metadata?.mercadopago_preference_id,
})), null, 2));
await c.end();
