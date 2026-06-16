#!/usr/bin/env node
/** Crear/aprobar API key Felipe vía producción HTTP (requiere pepper en servidor). */
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";
import { authenticateClientApiKey, approveProductionApiKey } from "../src/services/clientApiKeyService.ts";
import { readCompanyBalance } from "../src/services/smsWalletService.ts";

const BASE = (
  process.env.PROD_APP_URL ||
  process.env.PUBLIC_APP_URL ||
  "https://agent.telvoice.cl"
).replace(/\/$/, "");
// Forzar producción si .env local apunta a localhost
const PROD_BASE = BASE.includes("localhost")
  ? "https://agent.telvoice.cl"
  : BASE;
const COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";
const TICKET_CODE = "TLV-1001";
const ORDER_ID = "33545733-7af1-4387-96e3-f5a86bc2111e";

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

async function felipeClientCookie() {
  const { rows } = await pgQuery(
    `SELECT au.id, au.email, au.name, up.role FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE up.company_id = $1 LIMIT 1`,
    [COMPANY_ID],
  );
  const u = rows[0];
  if (!u) throw new Error("Perfil Felipe no encontrado");
  const token = jwt.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  return `tv_client_session=${token}`;
}

async function main() {
  const report = {
    actions: [],
    errors: [],
    apiKeyId: null,
    apiKeyPrefix: null,
    apiAuthTest: null,
    balanceTest: null,
  };

  const existing = await pgQuery(
    "SELECT id, key_prefix, status, production_approved FROM client_api_keys WHERE company_id=$1",
    [COMPANY_ID],
  );
  let plainKey = null;

  if (existing.rows.length) {
    report.actions.push("keys already exist");
    report.apiKeyId = existing.rows[0].id;
    report.apiKeyPrefix = existing.rows[0].key_prefix;
  } else {
    const cookie = await felipeClientCookie();
    const res = await fetch(`${PROD_BASE}/app/api/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: `API TLV-1001 ${new Date().toISOString().slice(0, 10)}`,
        environment: "production",
        scopes: ["balance:read", "messages:read", "sms:send"],
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      report.errors.push(`create_http: ${body.error || res.status}`);
    } else {
      report.apiKeyId = body.key?.id;
      report.apiKeyPrefix = body.key?.keyPrefix;
      report.actions.push("created via production HTTP");
      plainKey = body.plainTextKey;
      await pgQuery(
        `UPDATE client_api_keys SET source=$1,
         metadata = coalesce(metadata,'{}'::jsonb) || $2::jsonb WHERE id=$3`,
        [
          "manual_support_activation",
          JSON.stringify({
            ticket_code: TICKET_CODE,
            order_id: ORDER_ID,
            support_activation: true,
          }),
          report.apiKeyId,
        ],
      );
    }
  }

  const keyId = report.apiKeyId;
  if (keyId) {
    const row = (
      await pgQuery(
        "SELECT production_approved, status FROM client_api_keys WHERE id=$1",
        [keyId],
      )
    ).rows[0];
    if (!row?.production_approved) {
      const admin = (
        await pgQuery(
          "SELECT id, email, name FROM admin_users WHERE role='superadmin' LIMIT 1",
        )
      ).rows[0];
      const approved = await approveProductionApiKey(
        keyId,
        {
          adminId: admin.id,
          adminEmail: admin.email,
          adminName: admin.name,
        },
        "TLV-1001 manual API activation",
      );
      if (!approved.ok) report.errors.push(`approve: ${approved.error}`);
      else report.actions.push("production_approved");
    } else {
      report.actions.push("production already approved");
    }

    if (plainKey) {
      const auth = await authenticateClientApiKey(
        `Bearer ${plainKey}`,
        "balance:read",
      );
      report.apiAuthTest = {
        ok: auth.ok,
        code: auth.ok ? null : auth.code,
        productionApproved: auth.ok ? auth.context.productionApproved : null,
      };
      if (auth.ok) {
        const bal = await readCompanyBalance(COMPANY_ID);
        report.balanceTest = {
          availableSms: bal.availableSms,
          reservedSms: bal.reservedSms,
        };
      }
    } else {
      report.apiAuthTest = {
        skipped: true,
        reason: "secret_not_recoverable",
      };
    }
  }

  const afterKeys = await pgQuery(
    `SELECT id, key_prefix, key_masked, status, environment, production_approved, source
     FROM client_api_keys WHERE company_id=$1`,
    [COMPANY_ID],
  );
  report.keysAfter = afterKeys.rows.map((r) => ({
    id: r.id,
    prefix: r.key_prefix,
    masked: r.key_masked,
    status: r.status,
    env: r.environment,
    approved: r.production_approved,
    source: r.source,
  }));

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
