#!/usr/bin/env node
/**
 * Reset completo cuenta Licantravel para recompra desde landing.
 *
 * Uso:
 *   node scripts/reset-licantravel-account.mjs
 *   node scripts/reset-licantravel-account.mjs --apply
 *   node scripts/reset-licantravel-account.mjs --apply --qa-checkout
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROTECTED_COMPANY_IDS = new Set([
  "6cd1db92-d5c7-45e0-8548-df8907843350",
  "8d95a776-8527-41bc-8fa1-387b756733a5",
]);

const DEFAULT_EMAIL = "licantravel@gmail.com";
const DEFAULT_COMPANY_ID = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const DEFAULT_WALLET_ID = "6d873673-947b-4657-96f0-031d14db45fd";
const DEFAULT_ORDER_ID = "128174e8-0eec-4ff2-84b1-f857e8f94fa3";
const DEFAULT_CAMPAIGN_ID = "f31d0b0d-fb76-416b-9791-26f14e20d69d";
const BOLSA_200 = "204786a5-0e70-43d4-8339-8403ccf810c4";
const AGENT = process.env.QA_AGENT_URL?.trim() || "https://agent.telvoice.cl";

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const apply = process.argv.includes("--apply");
const qaCheckout = process.argv.includes("--qa-checkout");
const email = (arg("email") ?? DEFAULT_EMAIL).trim().toLowerCase();
const seedCompanyId = arg("company-id")?.trim() ?? DEFAULT_COMPANY_ID;

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

function assertSafe(ids, label) {
  for (const id of ids) {
    if (PROTECTED_COMPANY_IDS.has(id)) {
      throw new Error(`Bloqueado: ${label} incluye empresa protegida ${id}`);
    }
  }
}

function sanitizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const copy = structuredClone(row);
  const meta = copy.metadata;
  if (meta && typeof meta === "object") {
    delete meta.claim_token_enc;
    delete meta.claim_token;
    delete meta.mercadopago_init_point;
  }
  return copy;
}

async function countRows(client, sql, params) {
  const r = await client.query(
    `SELECT count(*)::int AS c FROM (${sql}) t`,
    params,
  );
  return r.rows[0]?.c ?? 0;
}

async function selectRows(client, sql, params) {
  const r = await client.query(sql, params);
  return r.rows;
}

async function discover(client) {
  const companies = (
    await client.query(
      `SELECT id, name, billing_email, status, created_at
       FROM companies
       WHERE id = $2
          OR lower(coalesce(billing_email, '')) = $1
          OR name ILIKE '%lican%'
       ORDER BY created_at`,
      [email, seedCompanyId],
    )
  ).rows;

  const companyIds = [
    ...new Set(companies.map((c) => c.id).filter(Boolean)),
  ];
  assertSafe(companyIds, "companies");

  const orders = (
    await client.query(
      `SELECT id, company_id, checkout_email, payer_email, payment_status,
              credit_status, claim_status, claimed_by_user_id, public_checkout_reference,
              created_at
       FROM sms_orders
       WHERE id = $3
          OR lower(coalesce(checkout_email, '')) = $1
          OR lower(coalesce(payer_email, '')) = $1
          OR company_id = ANY($2::uuid[])
       ORDER BY created_at`,
      [email, companyIds, DEFAULT_ORDER_ID],
    )
  ).rows;

  const orderIds = [...new Set(orders.map((o) => o.id))];
  for (const o of orders) {
    if (o.company_id && !companyIds.includes(o.company_id)) {
      if (!PROTECTED_COMPANY_IDS.has(o.company_id)) {
        companyIds.push(o.company_id);
      }
    }
  }
  assertSafe(companyIds, "companies (expanded)");

  const wallets = companyIds.length
    ? (
        await client.query(
          `SELECT id, company_id, available_sms, status
           FROM company_sms_wallets
           WHERE company_id = ANY($1::uuid[]) OR id = $2`,
          [companyIds, DEFAULT_WALLET_ID],
        )
      ).rows
    : [];

  const walletIds = [...new Set(wallets.map((w) => w.id))];

  const campaigns = companyIds.length
    ? (
        await client.query(
          `SELECT id, company_id, name, status, created_at
           FROM sms_campaigns
           WHERE company_id = ANY($1::uuid[]) OR id = $2`,
          [companyIds, DEFAULT_CAMPAIGN_ID],
        )
      ).rows
    : [];

  const campaignIds = [...new Set(campaigns.map((c) => c.id))];

  const messages = companyIds.length
    ? (
        await client.query(
          `SELECT id, company_id, campaign_id, status, created_at
           FROM panel_sms_messages WHERE company_id = ANY($1::uuid[])`,
          [companyIds],
        )
      ).rows
    : [];

  const messageIds = messages.map((m) => m.id);

  const profiles = (
    await client.query(
      `SELECT id, user_id, admin_user_id, email, company_id, status, created_at
       FROM user_profiles
       WHERE lower(coalesce(email, '')) = $1
          OR company_id = ANY($2::uuid[])`,
      [email, companyIds],
    )
  ).rows;

  const profileIds = profiles.map((p) => p.id);
  const userIdsFromProfiles = profiles
    .map((p) => p.user_id)
    .filter(Boolean);

  const claimedUserIds = orders
    .map((o) => o.claimed_by_user_id)
    .filter(Boolean);

  let authUsers = [];
  try {
    authUsers = (
      await client.query(
        `SELECT id, email, created_at, last_sign_in_at
         FROM auth.users WHERE lower(email) = $1`,
        [email],
      )
    ).rows;
  } catch (e) {
    authUsers = { error: String(e.message ?? e) };
  }

  const authUserIds = Array.isArray(authUsers)
    ? authUsers.map((u) => u.id)
    : [];

  const allUserIds = [
    ...new Set([...userIdsFromProfiles, ...claimedUserIds, ...authUserIds]),
  ];

  const inventory = {
    email,
    companies,
    companyIds,
    wallets,
    walletIds,
    orders,
    orderIds,
    campaigns,
    campaignIds,
    messagesCount: messages.length,
    messageIdsSample: messageIds.slice(0, 5),
    profiles,
    profileIds,
    authUsers,
    authUserIds: allUserIds,
  };

  const counts = {};
  const countDefs = [
    ["sms_send_queue", `SELECT id FROM sms_send_queue WHERE company_id = ANY($1::uuid[])`, [companyIds]],
    [
      "panel_sms_delivery_events",
      `SELECT id FROM panel_sms_delivery_events WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "panel_sms_messages",
      `SELECT id FROM panel_sms_messages WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "sms_campaigns",
      `SELECT id FROM sms_campaigns WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "contact_import_rows",
      `SELECT r.id FROM contact_import_rows r
       JOIN contact_import_jobs j ON j.id = r.job_id
       WHERE j.company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "contact_import_jobs",
      `SELECT id FROM contact_import_jobs WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "contact_tag_assignments",
      `SELECT id FROM contact_tag_assignments WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "contact_list_members",
      `SELECT id FROM contact_list_members WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    ["contacts", `SELECT id FROM contacts WHERE company_id = ANY($1::uuid[])`, [companyIds]],
    [
      "contact_lists",
      `SELECT id FROM contact_lists WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "contact_tags",
      `SELECT id FROM contact_tags WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "billing_events",
      `SELECT id FROM billing_events WHERE company_id = ANY($1::uuid[])
        OR invoice_id IN (SELECT id FROM billing_invoices WHERE company_id = ANY($1::uuid[]))`,
      [companyIds],
    ],
    [
      "billing_email_logs",
      `SELECT id FROM billing_email_logs WHERE company_id = ANY($1::uuid[])
        OR invoice_id IN (SELECT id FROM billing_invoices WHERE company_id = ANY($1::uuid[]))`,
      [companyIds],
    ],
    [
      "billing_invoice_items",
      `SELECT id FROM billing_invoice_items WHERE invoice_id IN (
         SELECT id FROM billing_invoices WHERE company_id = ANY($1::uuid[])
       )`,
      [companyIds],
    ],
    [
      "billing_invoices",
      `SELECT id FROM billing_invoices WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "email_logs",
      `SELECT id FROM email_logs WHERE company_id = ANY($1::uuid[])
        OR order_id = ANY($2::uuid[])
        OR lower(recipient_email) = $3`,
      [companyIds, orderIds, email],
    ],
    [
      "wallet_transactions",
      `SELECT id FROM wallet_transactions WHERE company_id = ANY($1::uuid[])
        OR wallet_id = ANY($2::uuid[])
        OR reference_id = ANY($3::uuid[])`,
      [companyIds, walletIds, orderIds],
    ],
    [
      "company_sms_wallets",
      `SELECT id FROM company_sms_wallets WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "company_rate_plans",
      `SELECT id FROM company_rate_plans WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "sms_orders",
      `SELECT id FROM sms_orders WHERE id = ANY($2::uuid[])
        OR company_id = ANY($1::uuid[])
        OR lower(coalesce(checkout_email,'')) = $3
        OR lower(coalesce(payer_email,'')) = $3`,
      [companyIds, orderIds, email],
    ],
    [
      "sms_send_idempotency",
      `SELECT id FROM sms_send_idempotency WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "company_users",
      `SELECT id FROM company_users WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "audit_logs",
      `SELECT id FROM audit_logs WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "user_profiles",
      `SELECT id FROM user_profiles WHERE id = ANY($2::uuid[])
        OR company_id = ANY($1::uuid[])
        OR lower(coalesce(email,'')) = $3`,
      [companyIds, profileIds, email],
    ],
    [
      "admin_users",
      `SELECT id FROM admin_users WHERE lower(coalesce(email,'')) = $1`,
      [email],
    ],
    [
      "clients_linked",
      `SELECT id FROM clients WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ],
    [
      "sms_tps_counters",
      `SELECT id FROM sms_tps_counters WHERE scope_id = ANY($1::uuid[])`,
      [companyIds],
    ],
  ];

  for (const [table, sql, params] of countDefs) {
    if (
      (params[0]?.length === 0 && table !== "public_leads" && table !== "email_logs") ||
      (table === "email_logs" && params[0]?.length === 0 && params[1]?.length === 0)
    ) {
      counts[table] = 0;
      continue;
    }
    try {
      counts[table] = await countRows(client, sql, params);
    } catch (e) {
      counts[table] = { error: String(e.message ?? e) };
    }
  }

  inventory.counts = counts;
  return inventory;
}

async function fetchBackupPayload(client, inv) {
  const { companyIds, orderIds, walletIds, campaignIds, profileIds } = inv;
  const payload = { exported_at: new Date().toISOString(), email };

  const tables = [
    ["companies", `SELECT * FROM companies WHERE id = ANY($1::uuid[])`, [companyIds]],
    ["company_sms_wallets", `SELECT * FROM company_sms_wallets WHERE company_id = ANY($1::uuid[])`, [companyIds]],
    ["company_rate_plans", `SELECT * FROM company_rate_plans WHERE company_id = ANY($1::uuid[])`, [companyIds]],
    ["sms_orders", `SELECT * FROM sms_orders WHERE id = ANY($2::uuid[]) OR company_id = ANY($1::uuid[])`, [companyIds, orderIds]],
    ["wallet_transactions", `SELECT * FROM wallet_transactions WHERE company_id = ANY($1::uuid[])`, [companyIds]],
    ["billing_invoices", `SELECT * FROM billing_invoices WHERE company_id = ANY($1::uuid[])`, [companyIds]],
    ["email_logs", `SELECT * FROM email_logs WHERE company_id = ANY($1::uuid[]) OR order_id = ANY($2::uuid[])`, [companyIds, orderIds]],
    ["sms_campaigns", `SELECT * FROM sms_campaigns WHERE company_id = ANY($1::uuid[])`, [companyIds]],
    ["panel_sms_messages", `SELECT id, company_id, campaign_id, status, recipient_number, sender_id, created_at FROM panel_sms_messages WHERE company_id = ANY($1::uuid[]) LIMIT 500`, [companyIds]],
    ["user_profiles", `SELECT id, user_id, email, company_id, role, status, created_at FROM user_profiles WHERE company_id = ANY($1::uuid[]) OR lower(email)=$2`, [companyIds, email]],
    ["auth_users", `SELECT id, email, created_at FROM auth.users WHERE lower(email)=$1`, [email]],
  ];

  for (const [key, sql, params] of tables) {
    if (!params[0]?.length && key !== "auth_users") {
      payload[key] = [];
      continue;
    }
    try {
      const rows = await selectRows(client, sql, params);
      payload[key] = rows.map(sanitizeRow);
    } catch (e) {
      payload[key] = { error: String(e.message ?? e) };
    }
  }

  payload.summary = {
    companyIds,
    orderIds,
    walletIds,
    campaignIds,
    profileIds,
    counts: inv.counts,
  };
  return payload;
}

async function deleteByCompany(client, inv) {
  const { companyIds, orderIds, email: em, profileIds } = inv;
  const deleted = {};

  async function run(label, sql, params) {
    const r = await client.query(sql, params);
    deleted[label] = r.rowCount ?? 0;
  }

  await client.query("BEGIN");
  try {
    await run(
      "sms_send_queue",
      `DELETE FROM sms_send_queue WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "panel_sms_delivery_events",
      `DELETE FROM panel_sms_delivery_events WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "panel_sms_messages",
      `DELETE FROM panel_sms_messages WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "sms_campaigns",
      `DELETE FROM sms_campaigns WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "sms_send_idempotency",
      `DELETE FROM sms_send_idempotency WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "contact_import_rows",
      `DELETE FROM contact_import_rows WHERE job_id IN (
         SELECT id FROM contact_import_jobs WHERE company_id = ANY($1::uuid[])
       )`,
      [companyIds],
    );
    await run(
      "contact_import_jobs",
      `DELETE FROM contact_import_jobs WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "contact_tag_assignments",
      `DELETE FROM contact_tag_assignments WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "contact_list_members",
      `DELETE FROM contact_list_members WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "contact_tags",
      `DELETE FROM contact_tags WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "contact_lists",
      `DELETE FROM contact_lists WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "contacts",
      `DELETE FROM contacts WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "billing_events",
      `DELETE FROM billing_events WHERE invoice_id IN (
         SELECT id FROM billing_invoices WHERE company_id = ANY($1::uuid[])
       )`,
      [companyIds],
    );
    await run(
      "billing_email_logs",
      `DELETE FROM billing_email_logs WHERE invoice_id IN (
         SELECT id FROM billing_invoices WHERE company_id = ANY($1::uuid[])
       ) OR company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "billing_invoice_items",
      `DELETE FROM billing_invoice_items WHERE invoice_id IN (
         SELECT id FROM billing_invoices WHERE company_id = ANY($1::uuid[])
       )`,
      [companyIds],
    );
    await run(
      "billing_invoices",
      `DELETE FROM billing_invoices WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "email_logs",
      `DELETE FROM email_logs WHERE company_id = ANY($1::uuid[])
        OR order_id = ANY($2::uuid[])
        OR lower(recipient_email) = $3`,
      [companyIds, orderIds, em],
    );
    await run(
      "wallet_transactions",
      `DELETE FROM wallet_transactions WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "company_sms_wallets",
      `DELETE FROM company_sms_wallets WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "company_rate_plans",
      `DELETE FROM company_rate_plans WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "sms_orders",
      `DELETE FROM sms_orders WHERE company_id = ANY($1::uuid[])
        OR id = ANY($2::uuid[])
        OR lower(coalesce(checkout_email,'')) = $3
        OR lower(coalesce(payer_email,'')) = $3`,
      [companyIds, orderIds, em],
    );
    await run(
      "company_users",
      `DELETE FROM company_users WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "audit_logs",
      `DELETE FROM audit_logs WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "clients_unlink",
      `UPDATE clients SET company_id = NULL WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "sms_tps_counters",
      `DELETE FROM sms_tps_counters WHERE scope_id = ANY($1::uuid[])`,
      [companyIds],
    );
    await run(
      "user_profiles",
      `DELETE FROM user_profiles WHERE company_id = ANY($1::uuid[])
        OR id = ANY($2::uuid[])
        OR lower(coalesce(email,'')) = $3`,
      [companyIds, profileIds, em],
    );
    await run(
      "admin_users",
      `DELETE FROM admin_users WHERE lower(coalesce(email,'')) = $1`,
      [em],
    );
    await run(
      "companies",
      `DELETE FROM companies WHERE id = ANY($1::uuid[])`,
      [companyIds],
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }

  return deleted;
}

async function deleteAuthUsers(authUserIds) {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || authUserIds.length === 0) {
    return { skipped: true, results: [] };
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results = [];
  for (const id of authUserIds) {
    const { error } = await sb.auth.admin.deleteUser(id);
    results.push({
      id,
      ok: !error,
      error: error?.message ?? null,
    });
  }
  return { skipped: false, results };
}

async function verifyPost(client, em) {
  const checks = {};
  const queries = [
    ["sms_orders", `SELECT count(*)::int c FROM sms_orders WHERE lower(coalesce(checkout_email,''))=$1 OR lower(coalesce(payer_email,''))=$1`, [em]],
    ["email_logs", `SELECT count(*)::int c FROM email_logs WHERE lower(recipient_email)=$1`, [em]],
    ["companies", `SELECT count(*)::int c FROM companies WHERE lower(coalesce(billing_email,''))=$1 OR name ILIKE '%lican%'`, [em]],
    ["user_profiles", `SELECT count(*)::int c FROM user_profiles WHERE lower(coalesce(email,''))=$1`, [em]],
    ["admin_users", `SELECT count(*)::int c FROM admin_users WHERE lower(coalesce(email,''))=$1`, [em]],
  ];
  for (const [k, sql, params] of queries) {
    checks[k] = (await client.query(sql, params)).rows[0].c;
  }
  try {
    checks.auth_users = (
      await client.query(
        `SELECT count(*)::int c FROM auth.users WHERE lower(email)=$1`,
        [em],
      )
    ).rows[0].c;
  } catch {
    checks.auth_users = "n/a";
  }
  return checks;
}

async function runQaCheckout(client) {
  const res = await fetch(`${AGENT}/api/public/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      package_id: BOLSA_200,
      checkout_email: email,
      payer_email: email,
      payer_name: "Licantravel QA Reset",
      source: "landing",
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(`checkout QA failed: ${JSON.stringify(body)}`);
  }

  await client.query(
    `UPDATE sms_orders SET metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [
      body.order_id,
      JSON.stringify({ qa_after_licantravel_reset: true }),
    ],
  );

  const ord = (
    await client.query(
      `SELECT id, payment_status, credit_status, claim_status, company_id,
              public_checkout_reference, claim_token_hash IS NOT NULL AS has_claim
       FROM sms_orders WHERE id = $1`,
      [body.order_id],
    )
  ).rows[0];

  return { checkout: body, order: ord };
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

const report = {
  mode: apply ? "apply" : "dry-run",
  email,
  timestamp: new Date().toISOString(),
};

try {
  const inventory = await discover(client);
  report.inventory = {
    companies: inventory.companies,
    companyIds: inventory.companyIds,
    orderIds: inventory.orderIds,
    walletIds: inventory.walletIds,
    campaignIds: inventory.campaignIds,
    profiles: inventory.profiles,
    authUsers: inventory.authUsers,
    counts: inventory.counts,
    messagesCount: inventory.messagesCount,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = join(__dirname, "../backups");
  const backupPath = join(backupDir, `licantravel-reset-${ts}.json`);

  const backupPayload = await fetchBackupPayload(client, inventory);
  if (apply) {
    await mkdir(backupDir, { recursive: true });
    await writeFile(backupPath, JSON.stringify(backupPayload, null, 2), "utf8");
    report.backupPath = backupPath;
  } else {
    report.backupWouldWrite = backupPath;
  }

  if (!apply) {
    report.message =
      "Dry-run completado. Ejecuta con --apply para borrar y crear backup.";
    console.log(JSON.stringify(report, null, 2));
    await client.end();
    process.exit(0);
  }

  if (inventory.companyIds.length === 0 && inventory.orderIds.length === 0) {
    report.deleted = {};
    report.note = "Nada que borrar en DB (ya limpio).";
  } else {
    report.deleted = await deleteByCompany(client, inventory);
  }

  report.authDelete = await deleteAuthUsers(inventory.authUserIds);

  report.postVerify = await verifyPost(client, email);

  if (qaCheckout) {
    report.qaCheckout = await runQaCheckout(client);
  }

  report.productionChecks = {
    health: await fetch(`${AGENT}/health`).then((r) => r.json()),
    productsBolsa200: await fetch(`${AGENT}/api/public/products`)
      .then((r) => r.json())
      .then((b) =>
        (b.products ?? []).some((p) => p.package_id === BOLSA_200),
      ),
  };

  console.log(JSON.stringify(report, null, 2));
} catch (err) {
  console.error(JSON.stringify({ error: String(err.message ?? err) }, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
