/**
 * Dry-run + archivado idempotente de companies huérfanas Licantravel (race webhook SIM).
 * Uso: node scripts/archive-licantravel-orphans.mjs [--apply]
 */
import "dotenv/config";
import pg from "pg";

const REAL_COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";
const ORPHAN_IDS = [
  "d6f9bb06-ab33-48de-86d5-2e96f71af300",
  "8dfa5854-8b2d-4635-928a-97690a2c962e",
];
const ORDER_REF = "TV-MQB4Z880-38FE01";
const EMAIL = "licantravel@gmail.com";
const APPLY = process.argv.includes("--apply");

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
});

const TABLES = [
  { key: "orders", sql: "SELECT id, payment_status, credit_status, public_checkout_reference FROM sms_orders WHERE company_id = $1" },
  { key: "wallets", sql: "SELECT id, available_sms, total_purchased_sms, status FROM company_sms_wallets WHERE company_id = $1" },
  {
    key: "wallet_transactions",
    sql: "SELECT id, type, sms_amount FROM wallet_transactions WHERE company_id = $1",
  },
  { key: "client_numbers", sql: "SELECT id, status, right(regexp_replace(number, '[^0-9]', '', 'g'), 3) AS suffix FROM client_numbers WHERE company_id = $1" },
  { key: "sim_activation_requests", sql: "SELECT id, activation_status, order_id FROM sim_activation_requests WHERE company_id = $1" },
  { key: "user_profiles", sql: "SELECT id, email, role, user_id FROM user_profiles WHERE company_id = $1" },
  {
    key: "admin_users",
    sql: `SELECT au.id, au.email
          FROM admin_users au
          JOIN user_profiles up ON up.admin_user_id = au.id
          WHERE up.company_id = $1`,
  },
  { key: "contacts", sql: "SELECT id, status FROM contacts WHERE company_id = $1" },
  { key: "campaigns", sql: "SELECT id, status FROM sms_campaigns WHERE company_id = $1" },
  { key: "tickets", sql: "SELECT id, status FROM client_support_tickets WHERE company_id = $1" },
  { key: "agent_plan_requests", sql: "SELECT id, status, plan_code FROM agent_plan_requests WHERE company_id = $1" },
  { key: "email_logs", sql: "SELECT id, template_key, status, order_id FROM email_logs WHERE company_id = $1" },
];

function hasActiveBlockers(audit) {
  const blockers = [];
  const activeNumbers = (audit.client_numbers || []).filter((r) => r.status === "active");
  if (activeNumbers.length) blockers.push(`active client_numbers: ${activeNumbers.length}`);
  if ((audit.user_profiles || []).length) blockers.push(`user_profiles: ${audit.user_profiles.length}`);
  if ((audit.admin_users || []).length) blockers.push(`admin_users: ${audit.admin_users.length}`);
  if ((audit.wallet_transactions || []).length) blockers.push(`wallet_transactions: ${audit.wallet_transactions.length}`);
  const liveOrders = (audit.orders || []).filter((o) => o.payment_status === "paid" || o.payment_status === "pending");
  if (liveOrders.length) blockers.push(`live orders: ${liveOrders.length}`);
  const activeContacts = (audit.contacts || []).filter((r) => r.status === "active");
  if (activeContacts.length) blockers.push(`contacts: ${activeContacts.length}`);
  const activeCampaigns = (audit.campaigns || []).filter((r) =>
    ["draft", "processing", "sent"].includes(r.status),
  );
  if (activeCampaigns.length) blockers.push(`campaigns: ${activeCampaigns.length}`);
  const openTickets = (audit.tickets || []).filter((r) => r.status !== "Resuelto");
  if (openTickets.length) blockers.push(`tickets: ${openTickets.length}`);
  const activeActivations = (audit.sim_activation_requests || []).filter((r) => r.activation_status === "active");
  if (activeActivations.length) blockers.push(`active sim_activation_requests: ${activeActivations.length}`);
  return blockers;
}

async function auditOrphan(id) {
  const { rows: companies } = await client.query(
    `SELECT id, name, status, billing_email, metadata, created_at FROM companies WHERE id = $1`,
    [id],
  );
  const company = companies[0];
  if (!company) throw new Error(`company_not_found:${id}`);

  const audit = { company, resources: {} };
  for (const t of TABLES) {
    const { rows } = await client.query(t.sql, [id]);
    audit.resources[t.key] = rows;
  }
  audit.blockers = hasActiveBlockers(audit.resources);
  audit.safe = audit.blockers.length === 0;
  return audit;
}

async function archiveOrphan(id) {
  await client.query(
    `UPDATE companies
     SET
       status = 'suspended',
       billing_email = NULL,
       metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
         'orphan_merged_into', $2::text,
         'orphan_reason', 'sim_webhook_race_2026-06-12',
         'orphan_archived_at', now()::text,
         'orphan_archived_by', 'qa_cleanup_before_bolsa_200'
       ),
       updated_at = now()
     WHERE id = $1`,
    [id, REAL_COMPANY_ID],
  );

  const { rowCount } = await client.query(
    `UPDATE email_logs
     SET
       company_id = $2,
       metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
         'reassigned_from_orphan_company_id', $1::text,
         'reassigned_at', now()::text,
         'reassigned_by', 'qa_cleanup_before_bolsa_200'
       )
     WHERE company_id = $1`,
    [id, REAL_COMPANY_ID],
  );
  return { emailLogsReassigned: rowCount };
}

async function validatePostCleanup() {
  const out = {};

  const { rows: licanCompanies } = await client.query(
    `SELECT id, name, status, billing_email, metadata->>'orphan_merged_into' AS merged_into
     FROM companies
     WHERE lower(billing_email) = lower($1)
        OR id = ANY($2::uuid[])
     ORDER BY created_at`,
    [EMAIL, [REAL_COMPANY_ID, ...ORPHAN_IDS]],
  );
  out.companies = licanCompanies;

  const { rows: real } = await client.query(
    `SELECT c.id, c.status, c.billing_email,
            (SELECT count(*)::int FROM client_numbers cn WHERE cn.company_id = c.id AND cn.status = 'active') AS active_numbers,
            (SELECT right(regexp_replace(cn.number, '[^0-9]', '', 'g'), 3) FROM client_numbers cn WHERE cn.company_id = c.id AND cn.status = 'active' LIMIT 1) AS suffix,
            (SELECT available_sms FROM company_sms_wallets w WHERE w.company_id = c.id LIMIT 1) AS wallet_sms
     FROM companies c WHERE c.id = $1`,
    [REAL_COMPANY_ID],
  );
  out.realCompany = real[0];

  const { rows: order } = await client.query(
    `SELECT id, company_id, payment_status, credit_status FROM sms_orders WHERE public_checkout_reference = $1`,
    [ORDER_REF],
  );
  out.order = order[0];

  const { rows: activation } = await client.query(
    `SELECT sar.activation_status, sar.company_id
     FROM sim_activation_requests sar
     JOIN sms_orders o ON o.id = sar.order_id
     WHERE o.public_checkout_reference = $1`,
    [ORDER_REF],
  );
  out.activation = activation[0];

  return out;
}

async function main() {
  await client.connect();
  console.log(APPLY ? "=== APPLY MODE ===" : "=== DRY-RUN ===");

  const audits = [];
  for (const id of ORPHAN_IDS) {
    const audit = await auditOrphan(id);
    audits.push(audit);
    console.log(`\n--- ORPHAN ${id.slice(0, 8)} ---`);
    console.log(JSON.stringify({ company: audit.company, blockers: audit.blockers, safe: audit.safe, resources: audit.resources }, null, 2));
  }

  const allSafe = audits.every((a) => a.safe);
  if (!allSafe) {
    console.error("\nSTOP: blockers detected, not applying.");
    process.exit(2);
  }
  console.log("\nDRY-RUN OK: both orphans clean.");

  if (!APPLY) {
    console.log("Run with --apply to archive.");
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    for (const id of ORPHAN_IDS) {
      const result = await archiveOrphan(id);
      console.log(`archived ${id.slice(0, 8)} email_logs_reassigned=${result.emailLogsReassigned}`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  console.log("\n=== POST-CLEANUP VALIDATION ===");
  const validation = await validatePostCleanup();
  console.log(JSON.stringify(validation, null, 2));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
