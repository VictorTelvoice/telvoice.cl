#!/usr/bin/env node
/**
 * Auditoría read-only: login Google multi-tenant (Licantravel / GoClub).
 *
 * Uso:
 *   DATABASE_URL=... node scripts/audit-google-login-tenant-prod.mjs
 *   node scripts/audit-google-login-tenant-prod.mjs --email=licantravel@gmail.com
 *
 * Solo SELECT. No modifica datos.
 * Wallets: tabla `company_sms_wallets` (no `sms_wallets`).
 */
import "dotenv/config";
import pg from "pg";

const EMAIL =
  process.argv.find((a) => a.startsWith("--email="))?.split("=")[1]?.trim().toLowerCase() ??
  "licantravel@gmail.com";

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido (read-only audit)");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

const q = async (label, sql, params = []) => {
  const r = await client.query(sql, params);
  console.log(`\n=== ${label} (${r.rowCount} rows) ===`);
  console.log(JSON.stringify(r.rows, null, 2));
  return r.rows;
};

console.log("=== Auditoría login Google multi-tenant (READ ONLY) ===");
console.log(`Email foco: ${EMAIL}`);
console.log(`At: ${new Date().toISOString()}`);

const companies = await q(
  "companies Licantravel / GoClub",
  `
  SELECT id, name, legal_name, billing_email, status, created_at, updated_at
  FROM companies
  WHERE name ILIKE '%lican%'
     OR legal_name ILIKE '%lican%'
     OR name ILIKE '%goclub%'
     OR legal_name ILIKE '%goclub%'
     OR billing_email ILIKE '%lican%'
     OR billing_email ILIKE '%goclub%'
  ORDER BY created_at
  `,
);

const companyIds = companies.map((c) => c.id);

await q(
  "user_profiles por email Lican / GoClub / foco",
  `
  SELECT id, admin_user_id, user_id, company_id, email, full_name, role, status, created_at, updated_at
  FROM user_profiles
  WHERE email ILIKE $1
     OR email ILIKE '%lican%'
     OR email ILIKE '%goclub%'
  ORDER BY updated_at DESC
  `,
  [`%${EMAIL.split("@")[0]}%`],
);

await q(
  "admin_users por email",
  `
  SELECT id, email, name, role, created_at, updated_at
  FROM admin_users
  WHERE email ILIKE $1
     OR email ILIKE '%lican%'
     OR email ILIKE '%goclub%'
  ORDER BY updated_at DESC
  `,
  [`%${EMAIL.split("@")[0]}%`],
);

if (companyIds.length > 0) {
  await q(
    "company_sms_wallets Licantravel / GoClub",
    `
    SELECT company_id, available_sms, total_purchased_sms, consumed_sms, updated_at
    FROM company_sms_wallets
    WHERE company_id = ANY($1::uuid[])
    ORDER BY company_id
    `,
    [companyIds],
  );
}

await q(
  "sms_orders por checkout/payer email foco",
  `
  SELECT id, company_id, checkout_email, payer_email, payment_status, credit_status,
         claim_status, amount, sms_quantity, created_at, updated_at
  FROM sms_orders
  WHERE checkout_email ILIKE $1
     OR payer_email ILIKE $1
  ORDER BY created_at DESC
  LIMIT 50
  `,
  [`%${EMAIL}%`],
);

await q(
  "emails duplicados en billing_email (multi-tenant risk)",
  `
  SELECT lower(trim(billing_email)) AS billing_email_norm, count(*)::int AS company_count,
         array_agg(id ORDER BY created_at) AS company_ids,
         array_agg(name ORDER BY created_at) AS company_names
  FROM companies
  WHERE billing_email IS NOT NULL AND trim(billing_email) <> ''
  GROUP BY lower(trim(billing_email))
  HAVING count(*) > 1
  ORDER BY company_count DESC
  LIMIT 30
  `,
);

await q(
  "perfiles con email en más de una company",
  `
  SELECT lower(trim(email)) AS email_norm, count(DISTINCT company_id)::int AS company_count,
         array_agg(DISTINCT company_id) AS company_ids
  FROM user_profiles
  WHERE email IS NOT NULL AND company_id IS NOT NULL
  GROUP BY lower(trim(email))
  HAVING count(DISTINCT company_id) > 1
  ORDER BY company_count DESC
  LIMIT 30
  `,
);

await q(
  "admin_user foco + perfil + company",
  `
  SELECT au.id AS admin_user_id, au.email AS admin_email,
         up.id AS profile_id, up.company_id, up.email AS profile_email,
         up.updated_at AS profile_updated_at,
         c.name AS company_name, c.billing_email
  FROM admin_users au
  LEFT JOIN user_profiles up ON up.admin_user_id = au.id
  LEFT JOIN companies c ON c.id = up.company_id
  WHERE lower(trim(au.email)) = $1
  `,
  [EMAIL],
);

console.log("\n=== Fin auditoría (sin modificaciones) ===");
await client.end();
