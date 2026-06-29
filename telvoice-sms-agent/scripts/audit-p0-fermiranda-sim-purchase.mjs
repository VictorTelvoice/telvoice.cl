#!/usr/bin/env node
/**
 * Auditoría P0 — compra SIM fermiranda9303@gmail.com / op MP 164839622838
 */
import "dotenv/config";
import pg from "pg";

const EMAIL = "fermiranda9303@gmail.com";
const OPERATION_ID = "164839622838";

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const q = async (label, sql, params = []) => {
  const r = await c.query(sql, params);
  console.log(`\n=== ${label} (${r.rowCount} rows) ===`);
  console.log(JSON.stringify(r.rows, null, 2));
  return r.rows;
};

await q("companies fermiranda", `
  SELECT c.id, c.name, c.billing_email, c.created_at,
         up.email AS profile_email
  FROM companies c
  LEFT JOIN user_profiles up ON up.company_id = c.id
  WHERE lower(c.billing_email) = $1
     OR lower(up.email) = $1
     OR lower(c.name) LIKE '%fer%'
  ORDER BY c.created_at DESC LIMIT 20
`, [EMAIL]);

await q("sms_orders fermiranda / sim / operation", `
  SELECT o.id, o.company_id, o.checkout_email, o.payment_status, o.credit_status,
         o.claim_status, o.amount, o.sms_quantity, o.payment_reference,
         o.metadata->>'product_type' AS product_type,
         o.metadata->>'plan_id' AS plan_id,
         o.metadata->>'plan_name' AS plan_name,
         o.metadata->>'payer_name' AS payer_name,
         o.metadata->>'mercadopago_payment_id' AS mp_payment_id,
         o.metadata->>'mercadopago_preapproval_id' AS mp_preapproval_id,
         o.metadata->>'inventory_number_id' AS inventory_number_id,
         o.metadata->>'number_suffix' AS number_suffix,
         o.metadata->>'subscription_status' AS subscription_status,
         o.metadata->>'charge_amount_clp' AS charge_amount_clp,
         o.created_at, o.updated_at
  FROM sms_orders o
  WHERE lower(coalesce(o.checkout_email, '')) = $1
     OR o.metadata::text ILIKE $2
     OR o.metadata::text ILIKE $3
     OR (o.metadata->>'product_type' = 'sim_subscription'
         AND o.created_at >= now() - interval '7 days')
  ORDER BY o.created_at DESC LIMIT 30
`, [EMAIL, `%${EMAIL}%`, `%${OPERATION_ID}%`]);

await q("sim_subscriptions fermiranda", `
  SELECT ss.*, o.checkout_email, o.payment_status AS order_payment_status,
         o.metadata->>'payer_name' AS payer_name
  FROM sim_subscriptions ss
  LEFT JOIN sms_orders o ON o.id = ss.order_id
  WHERE lower(ss.checkout_email) = $1
     OR ss.metadata::text ILIKE $2
  ORDER BY ss.created_at DESC LIMIT 20
`, [EMAIL, `%${EMAIL}%`]);

await q("sim_activation_requests fermiranda", `
  SELECT sar.id, sar.order_id, sar.company_id, sar.checkout_email,
         sar.payer_name, sar.activation_status, sar.inventory_number_id,
         sar.created_at
  FROM sim_activation_requests sar
  WHERE lower(sar.checkout_email) = $1
  ORDER BY sar.created_at DESC LIMIT 20
`, [EMAIL]);

await q("real_number_inventory fermiranda orders", `
  SELECT rni.id, rni.e164_number, rni.sales_status, rni.current_company_id,
         rni.current_order_id, rni.reserved_until, rni.metadata,
         rni.updated_at
  FROM real_number_inventory rni
  WHERE rni.current_order_id IN (
    SELECT id FROM sms_orders WHERE lower(checkout_email) = $1
  )
  OR rni.metadata::text ILIKE $2
  ORDER BY rni.updated_at DESC LIMIT 20
`, [EMAIL, `%${EMAIL}%`]);

await q("email_logs fermiranda", `
  SELECT id, template_key, recipient_email, status, order_id,
         metadata->>'idempotency_key' AS idempotency_key, created_at
  FROM email_logs
  WHERE recipient_email ILIKE $1
  ORDER BY created_at DESC LIMIT 30
`, [`%${EMAIL.split("@")[0]}%`]);

await q("licantravel order status (no tocar)", `
  SELECT o.id, o.checkout_email, o.payment_status, o.amount,
         ss.status AS sub_status, ss.mercadopago_preapproval_id
  FROM sms_orders o
  LEFT JOIN sim_subscriptions ss ON ss.order_id = o.id
  WHERE o.id = '6d43ab5b-e59d-4d46-9800-e378c8fd3d67'
`);

await c.end();
console.log("\n=== audit fermiranda complete ===");
