#!/usr/bin/env node
/** Validación read-only post-habilitación API Felipe / TLV-1001 */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";

const COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";
const ORDER_ID = "33545733-7af1-4387-96e3-f5a86bc2111e";
const PROD = "https://agent.telvoice.cl";

async function pgQuery(text, params) {
  const conn = process.env.DATABASE_URL?.trim();
  const c = new pg.Client({
    connectionString: conn,
    ssl: conn?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  try {
    return await c.query(text, params);
  } finally {
    await c.end();
  }
}

async function felipeCookie() {
  const { rows } = await pgQuery(
    `SELECT au.id, au.email, au.name, up.role FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE up.company_id = $1 LIMIT 1`,
    [COMPANY_ID],
  );
  const u = rows[0];
  const token = jwt.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  return `tv_client_session=${token}`;
}

async function main() {
  const snap = {};
  snap.wallet = (
    await pgQuery(
      "SELECT available_sms, reserved_sms, status FROM company_sms_wallets WHERE company_id=$1",
      [COMPANY_ID],
    )
  ).rows[0];
  snap.purchaseCredits = (
    await pgQuery(
      "SELECT count(*)::int c FROM wallet_transactions WHERE company_id=$1 AND type='purchase_credit'",
      [COMPANY_ID],
    )
  ).rows[0].c;
  snap.ratePlans = (
    await pgQuery(
      `SELECT traffic_type, api_enabled, status, rate_plan_id
       FROM company_rate_plans
       WHERE company_id = $1 AND country = 'CL'`,
      [COMPANY_ID],
    )
  ).rows;
  snap.apiKeys = (
    await pgQuery(
      `SELECT id, key_prefix, status, environment, production_approved, source, scopes
       FROM client_api_keys WHERE company_id = $1`,
      [COMPANY_ID],
    )
  ).rows;
  snap.companyAudit = (
    await pgQuery(
      `SELECT classification, reason, protected, metadata
       FROM admin_data_audit_flags
       WHERE entity_type = 'company' AND entity_id = $1 AND archived_at IS NULL`,
      [COMPANY_ID],
    )
  ).rows[0];
  snap.orderAudit = (
    await pgQuery(
      `SELECT classification, reason
       FROM admin_data_audit_flags
       WHERE entity_type = 'order' AND entity_id = $1 AND archived_at IS NULL`,
      [ORDER_ID],
    )
  ).rows[0];
  snap.ticket = (
    await pgQuery(
      `SELECT status, priority, ticket_code
       FROM client_support_tickets
       WHERE company_id = $1 AND ticket_code = 'TLV-1001'`,
      [COMPANY_ID],
    )
  ).rows[0];

  const cookie = await felipeCookie();
  const apiSettingsRes = await fetch(`${PROD}/app/api/settings`, {
    headers: { Cookie: cookie },
  });
  snap.panelApiSettings = {
    status: apiSettingsRes.status,
    body: await apiSettingsRes.json(),
  };
  const apiKeysRes = await fetch(`${PROD}/app/api/keys`, {
    headers: { Cookie: cookie },
  });
  snap.panelApiKeys = {
    status: apiKeysRes.status,
    body: await apiKeysRes.json(),
  };

  const adminLogin = await fetch(`${PROD}/admin/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SUPERADMIN_EMAIL,
      password: process.env.SUPERADMIN_PASSWORD,
    }),
  });
  const setCookie = adminLogin.headers.getSetCookie?.() || [];
  const adminSession = setCookie.find((c) => c.startsWith("tv_admin_session="));
  if (adminSession) {
    const clientsRes = await fetch(
      `${PROD}/admin/api/clients?search=felipevalenciao`,
      { headers: { Cookie: adminSession.split(";")[0] } },
    );
    snap.adminClients = {
      status: clientsRes.status,
      body: await clientsRes.json(),
    };
  } else {
    snap.adminClients = { skipped: true, loginStatus: adminLogin.status };
  }

  console.log(JSON.stringify(snap, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
