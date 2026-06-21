#!/usr/bin/env node
/**
 * Auditoría read-only completa — login Google tenant isolation.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/audit-google-login-tenant-prod-full.mjs
 *
 * Solo SELECT. No ejecuta UPDATE/DELETE/INSERT/UPSERT ni muta datos.
 * Wallets: tabla `company_sms_wallets` (no `sms_wallets`).
 */
import "dotenv/config";
import pg from "pg";

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

function maskDbUrl(url) {
  return url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@").replace(/@([^/]+)/, "@***");
}

const q = async (label, sql, params = []) => {
  const r = await client.query(sql, params);
  console.log(`\n=== ${label} (${r.rowCount} rows) ===`);
  console.log(JSON.stringify(r.rows, null, 2));
  return r.rows;
};

await client.connect();

console.log("=== Auditoría completa login Google tenant isolation (READ ONLY) ===");
console.log(`At: ${new Date().toISOString()}`);
console.log(`DATABASE_URL: ${maskDbUrl(cs)}`);

const envRows = await q("env hints from DB", `
  SELECT current_database() AS db, current_user AS db_user, version() AS pg_version
`);

await q("A — companies Licantravel / GoClub", `
  SELECT id, name, legal_name, billing_email, status, created_at, updated_at
  FROM companies
  WHERE name ILIKE '%lican%'
     OR legal_name ILIKE '%lican%'
     OR billing_email ILIKE '%lican%'
     OR name ILIKE '%goclub%'
     OR legal_name ILIKE '%goclub%'
     OR billing_email ILIKE '%goclub%'
  ORDER BY created_at DESC
`);

await q("B — user_profiles relacionados", `
  SELECT id, admin_user_id, user_id, company_id, email, full_name, role, status, created_at, updated_at
  FROM user_profiles
  WHERE email ILIKE '%lican%'
     OR email ILIKE '%goclub%'
     OR lower(trim(email)) = 'licantravel@gmail.com'
     OR lower(trim(email)) = 'goclubai@gmail.com'
  ORDER BY updated_at DESC
`);

await q("C — admin_users relacionados", `
  SELECT id, email, name, role, created_at, updated_at
  FROM admin_users
  WHERE email ILIKE '%lican%'
     OR email ILIKE '%goclub%'
     OR lower(trim(email)) = 'licantravel@gmail.com'
     OR lower(trim(email)) = 'goclubai@gmail.com'
  ORDER BY updated_at DESC
`);

await q("D — company_sms_wallets Licantravel / GoClub", `
  SELECT w.company_id, c.name AS company_name, w.available_sms, w.total_purchased_sms,
         w.consumed_sms, w.updated_at
  FROM company_sms_wallets w
  JOIN companies c ON c.id = w.company_id
  WHERE c.name ILIKE '%lican%'
     OR c.legal_name ILIKE '%lican%'
     OR c.billing_email ILIKE '%lican%'
     OR c.name ILIKE '%goclub%'
     OR c.legal_name ILIKE '%goclub%'
     OR c.billing_email ILIKE '%goclub%'
  ORDER BY w.company_id
`);

await q("E — sms_orders Licantravel / GoClub emails", `
  SELECT id, company_id, checkout_email, payer_email, payment_status, credit_status,
         amount, sms_quantity, created_at, updated_at
  FROM sms_orders
  WHERE checkout_email ILIKE '%lican%'
     OR payer_email ILIKE '%lican%'
     OR checkout_email ILIKE '%goclub%'
     OR payer_email ILIKE '%goclub%'
     OR lower(trim(checkout_email)) = 'licantravel@gmail.com'
     OR lower(trim(payer_email)) = 'licantravel@gmail.com'
     OR lower(trim(checkout_email)) = 'goclubai@gmail.com'
     OR lower(trim(payer_email)) = 'goclubai@gmail.com'
  ORDER BY created_at DESC
  LIMIT 100
`);

await q("5a — emails en múltiples companies (user_profiles)", `
  SELECT lower(trim(email)) AS email,
         count(DISTINCT company_id)::int AS companies_count,
         array_agg(DISTINCT company_id ORDER BY company_id) AS company_ids
  FROM user_profiles
  WHERE email IS NOT NULL AND company_id IS NOT NULL
  GROUP BY lower(trim(email))
  HAVING count(DISTINCT company_id) > 1
  ORDER BY companies_count DESC
  LIMIT 50
`);

await q("5b — billing_email duplicado en companies", `
  SELECT lower(trim(billing_email)) AS billing_email,
         count(*)::int AS companies_count,
         array_agg(id ORDER BY created_at) AS company_ids,
         array_agg(name ORDER BY created_at) AS company_names
  FROM companies
  WHERE billing_email IS NOT NULL AND trim(billing_email) <> ''
  GROUP BY lower(trim(billing_email))
  HAVING count(*) > 1
  ORDER BY companies_count DESC
  LIMIT 50
`);

await q("5c — cruce profile email ↔ company billing_email (multi-match)", `
  SELECT lower(trim(up.email)) AS email,
         count(DISTINCT c.id)::int AS matching_companies,
         array_agg(DISTINCT c.id ORDER BY c.id) AS company_ids,
         array_agg(DISTINCT c.name ORDER BY c.name) AS company_names
  FROM user_profiles up
  JOIN companies c ON lower(trim(c.billing_email)) = lower(trim(up.email))
  WHERE up.email IS NOT NULL AND c.billing_email IS NOT NULL
  GROUP BY lower(trim(up.email))
  HAVING count(DISTINCT c.id) > 1
  ORDER BY matching_companies DESC
  LIMIT 50
`);

await q("candidatos findCompanyCandidatesByEmail — licantravel@gmail.com", `
  SELECT c.id, c.name, c.billing_email, 'billing_email' AS source
  FROM companies c
  WHERE lower(trim(c.billing_email)) = 'licantravel@gmail.com'
  UNION
  SELECT c.id, c.name, c.billing_email, 'user_profile' AS source
  FROM user_profiles up
  JOIN companies c ON c.id = up.company_id
  WHERE lower(trim(up.email)) = 'licantravel@gmail.com' AND up.company_id IS NOT NULL
`);

await q("candidatos findCompanyCandidatesByEmail — goclubai@gmail.com", `
  SELECT c.id, c.name, c.billing_email, 'billing_email' AS source
  FROM companies c
  WHERE lower(trim(c.billing_email)) = 'goclubai@gmail.com'
  UNION
  SELECT c.id, c.name, c.billing_email, 'user_profile' AS source
  FROM user_profiles up
  JOIN companies c ON c.id = up.company_id
  WHERE lower(trim(up.email)) = 'goclubai@gmail.com' AND up.company_id IS NOT NULL
`);

await q("join admin + profile + company — emails foco", `
  SELECT au.id AS admin_user_id, au.email AS admin_email,
         up.id AS profile_id, up.company_id, up.email AS profile_email,
         up.updated_at AS profile_updated_at,
         c.name AS company_name, c.billing_email, c.status AS company_status
  FROM admin_users au
  LEFT JOIN user_profiles up ON up.admin_user_id = au.id
  LEFT JOIN companies c ON c.id = up.company_id
  WHERE lower(trim(au.email)) IN ('licantravel@gmail.com', 'goclubai@gmail.com')
  ORDER BY au.email
`);

await q("órdenes licantravel@gmail.com por company_id", `
  SELECT company_id, count(*)::int AS order_count,
         sum(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END)::int AS paid_count
  FROM sms_orders
  WHERE lower(trim(coalesce(checkout_email, payer_email, ''))) = 'licantravel@gmail.com'
  GROUP BY company_id
  ORDER BY order_count DESC
`);

console.log("\n=== Fin auditoría completa (sin modificaciones) ===");
await client.end();
