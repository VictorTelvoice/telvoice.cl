#!/usr/bin/env node
/**
 * QA HTTP producción: /app/settings + smoke rutas críticas.
 * Requiere DATABASE_URL y JWT_SECRET (sin resetear contraseñas).
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(
  /\/$/,
  "",
);
const DEMO_COMPANY = "6cd1db92-d5c7-45e0-8548-df8907843350";
const DEMO_EMAIL = "cliente.demo@telvoice.cl";
const CLIENT_COOKIE = "tv_client_session";

const results = [];
const ok = (id, d) => {
  results.push({ id, ok: true, d });
  console.log(`✓ ${id}: ${d}`);
};
const bad = (id, d) => {
  results.push({ id, ok: false, d });
  console.error(`✗ ${id}: ${d}`);
};

async function getDemoSessionCookie() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET requerido");

  const conn = process.env.DATABASE_URL?.trim();
  if (!conn) throw new Error("DATABASE_URL requerido");

  const client = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT au.id, au.email, au.name, up.role, up.company_id
       FROM admin_users au
       JOIN user_profiles up ON up.admin_user_id = au.id
       WHERE lower(au.email) = lower($1)
       LIMIT 1`,
      [DEMO_EMAIL],
    );
    if (!rows[0]) throw new Error("Usuario demo no encontrado");
    const u = rows[0];
    if (u.company_id !== DEMO_COMPANY) {
      throw new Error(`company_id demo inesperado: ${u.company_id}`);
    }
    const token = jwt.sign(
      {
        sub: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
      },
      secret,
      {
        expiresIn: "1h",
        issuer: "telvoice-sms-agent",
        audience: "telvoice-admin",
      },
    );
    return `${CLIENT_COOKIE}=${token}`;
  } finally {
    await client.end();
  }
}

async function fetchPath(path, cookie, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie, ...opts.headers } : opts.headers,
    redirect: opts.redirect ?? "manual",
    method: opts.method ?? "GET",
    body: opts.body,
  });
  const text = opts.noBody ? "" : await res.text();
  return { status: res.status, text, loc: res.headers.get("location") || "" };
}

function buildQaSettings() {
  return {
    activeTab: "empresa",
    company: {
      name: "Empresa Demo Telvoice",
      rut: "",
      activity: "QA Configuración Supabase",
      website: "https://telvoice.cl",
      country: "Chile",
      city: "",
      address: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
    },
    billing: {
      legalName: "Empresa Demo Telvoice SpA",
      rut: "",
      address: "",
      email: "",
      country: "Chile",
      currency: "CLP",
      sendReceipts: true,
      sendInvoices: true,
      notifyPending: true,
      notifyCredited: true,
    },
    notifications: {
      purchaseStarted: true,
      paymentApproved: true,
      balanceCredited: true,
      paymentRejected: true,
      lowBalance: true,
      campaignFinished: true,
      massDeliveryError: true,
      dlrReports: true,
      apiKeyRegenerated: true,
      webhookErrors: true,
      rateLimit: true,
      ticketNewMessage: true,
      ticketResolved: true,
      ticketWaiting: true,
      lowBalanceThreshold: 123,
    },
    preferences: {
      language: "es",
      timezone: "America/Santiago",
      dateFormat: "DD/MM/YYYY",
      homePage: "dashboard",
      ticketView: "table",
      showQuickHelp: true,
      defaultSender: "QA-TELVOICE",
      defaultCountry: "Chile",
      phoneFormat: "e164",
      warnMultiSms: true,
      confirmMassSend: true,
    },
  };
}

async function checkDbTable() {
  const conn = process.env.DATABASE_URL?.trim();
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const tbl = await client.query(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name = 'client_company_settings'
    `);
    const rls = await client.query(`
      select relname, relrowsecurity from pg_class
      where relname = 'client_company_settings'
    `);
    return {
      tableExists: tbl.rows.length > 0,
      rls: rls.rows[0]?.relrowsecurity === true,
    };
  } finally {
    await client.end();
  }
}

async function readSettingsRow() {
  const conn = process.env.DATABASE_URL?.trim();
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select id, company_id, company_data, billing_data, sms_preferences, updated_at
       from client_company_settings where company_id = $1`,
      [DEMO_COMPANY],
    );
    return rows[0] ?? null;
  } finally {
    await client.end();
  }
}

async function cleanupDemoRow() {
  const conn = process.env.DATABASE_URL?.trim();
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `delete from client_company_settings where company_id = $1`,
      [DEMO_COMPANY],
    );
    return rowCount;
  } finally {
    await client.end();
  }
}

async function verifyCompaniesUntouched() {
  const conn = process.env.DATABASE_URL?.trim();
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select name, updated_at from companies where id = $1`,
      [DEMO_COMPANY],
    );
    return rows[0];
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("=== DB: tabla y RLS ===");
  const db = await checkDbTable();
  if (db.tableExists) ok("db_table", "client_company_settings existe");
  else bad("db_table", "tabla no existe");
  if (!db.rls) ok("db_rls", "relrowsecurity = false");
  else bad("db_rls", "RLS habilitado (no esperado)");

  console.log("\n=== Health ===");
  const health = await fetchPath("/health", null, { noBody: true });
  if (health.status === 200) ok("health", "200");
  else bad("health", `status=${health.status}`);

  console.log("\n=== Sesión demo (JWT firmado, sin reset password) ===");
  const cookie = await getDemoSessionCookie();
  ok("session", "cookie tv_client_session generada");

  console.log("\n=== GET /app/settings ===");
  let r = await fetchPath("/app/settings", cookie, { redirect: "follow" });
  if (r.status === 200) ok("get_settings", "200");
  else bad("get_settings", `status=${r.status}`);

  if (r.text.includes("DB_AVAILABLE = true")) ok("get_db_flag", "DB_AVAILABLE true en HTML");
  else if (r.text.includes("var DB_AVAILABLE = true")) ok("get_db_flag", "DB_AVAILABLE true");
  else bad("get_db_flag", "no se encontró DB_AVAILABLE=true");

  if (!r.text.includes("500") && !r.text.includes("Internal Server Error")) {
    ok("get_no_500", "sin error 500 visible");
  } else bad("get_no_500", "posible 500 en HTML");

  console.log("\n=== POST /app/settings (QA payload) ===");
  const payload = buildQaSettings();
  const companyBefore = await verifyCompaniesUntouched();
  const post = await fetch(`${BASE}/app/settings`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const postBody = await post.json().catch(() => ({}));
  if (post.status === 200 && postBody.ok) ok("post_settings", "200 ok:true");
  else bad("post_settings", `status=${post.status} body=${JSON.stringify(postBody).slice(0, 200)}`);

  const row = await readSettingsRow();
  if (row) {
    const co = row.company_data || {};
    const sp = row.sms_preferences || {};
    if (co.companyName === "Empresa Demo Telvoice") ok("db_company_name", co.companyName);
    else bad("db_company_name", JSON.stringify(co.companyName));
    if (co.businessActivity === "QA Configuración Supabase") ok("db_activity", "OK");
    else bad("db_activity", co.businessActivity);
    if (sp.defaultSender === "QA-TELVOICE") ok("db_sender", sp.defaultSender);
    else bad("db_sender", sp.defaultSender);
    if (row.company_id === DEMO_COMPANY) ok("db_company_id", DEMO_COMPANY);
    else bad("db_company_id", row.company_id);
  } else bad("db_row", "sin fila tras POST");

  const companyAfter = await verifyCompaniesUntouched();
  if (
    companyBefore?.name === companyAfter?.name &&
    String(companyBefore?.updated_at) === String(companyAfter?.updated_at)
  ) {
    ok("companies_unchanged", `name=${companyAfter?.name}`);
  } else {
    bad(
      "companies_unchanged",
      `before=${companyBefore?.updated_at} after=${companyAfter?.updated_at}`,
    );
  }

  console.log("\n=== GET /app/settings (reload) ===");
  r = await fetchPath("/app/settings", cookie, { redirect: "follow" });
  if (r.status === 200 && r.text.includes("QA-TELVOICE")) {
    ok("reload_persist", "QA-TELVOICE en HTML");
  } else bad("reload_persist", "datos QA no visibles");

  if (r.text.includes("Configuración sincronizada con tu empresa")) {
    ok("reload_sync_hint", "hint sincronizada");
  } else bad("reload_sync_hint", "sin hint sincronizada");

  console.log("\n=== Validaciones POST ===");
  const invalidEmail = { ...payload, company: { ...payload.company, contactEmail: "bad" } };
  const inv1 = await fetch(`${BASE}/app/settings`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(invalidEmail),
  });
  const inv1b = await inv1.json().catch(() => ({}));
  if (inv1.status === 400 && !inv1b.ok) ok("val_email", `400 ${inv1b.error || ""}`);
  else bad("val_email", `status=${inv1.status}`);

  const invalidUrl = { ...payload, company: { ...payload.company, website: "not-a-url" } };
  const inv2 = await fetch(`${BASE}/app/settings`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(invalidUrl),
  });
  const inv2b = await inv2.json().catch(() => ({}));
  if (inv2.status === 400 && !inv2b.ok) ok("val_url", `400`);
  else bad("val_url", `status=${inv2.status}`);

  const invalidTh = {
    ...payload,
    notifications: { ...payload.notifications, lowBalanceThreshold: -5 },
  };
  const inv3 = await fetch(`${BASE}/app/settings`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(invalidTh),
  });
  const inv3b = await inv3.json().catch(() => ({}));
  if (inv3.status === 400 && !inv3b.ok) ok("val_threshold", `400`);
  else bad("val_threshold", `status=${inv3.status}`);

  console.log("\n=== Limpieza QA demo ===");
  const removed = await cleanupDemoRow();
  ok("cleanup", `filas eliminadas: ${removed}`);

  const rowAfter = await readSettingsRow();
  if (!rowAfter) ok("cleanup_verify", "sin fila demo");
  else bad("cleanup_verify", "aún existe fila");

  console.log("\n=== Smoke rutas cliente ===");
  const clientRoutes = [
    "/app/dashboard",
    "/app/support",
    "/app/templates",
    "/app/buy-sms",
    "/app/orders",
    "/app/wallet",
    "/app/invoices",
    "/app/api",
  ];
  for (const path of clientRoutes) {
    const sm = await fetchPath(path, cookie, { redirect: "follow" });
    if (sm.status === 200) ok(`smoke${path}`, "200");
    else bad(`smoke${path}`, `status=${sm.status}`);
  }

  console.log("\n=== Smoke admin (superadmin si disponible) ===");
  const adminEmail = process.env.SUPERADMIN_EMAIL?.trim();
  const adminPass = process.env.SUPERADMIN_PASSWORD?.trim();
  if (adminEmail && adminPass) {
    const loginRes = await fetch(`${BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: adminEmail, password: adminPass }),
      redirect: "manual",
    });
    const raw =
      typeof loginRes.headers.getSetCookie === "function"
        ? loginRes.headers.getSetCookie()
        : [loginRes.headers.get("set-cookie")].filter(Boolean);
    const adminCookie = raw
      .flatMap((c) => (Array.isArray(c) ? c : [c]))
      .map((c) => c.split(";")[0])
      .join("; ");
    for (const path of ["/admin", "/admin/support"]) {
      const sm = await fetchPath(path, adminCookie, { redirect: "follow" });
      if (sm.status === 200) ok(`smoke${path}`, "200");
      else bad(`smoke${path}`, `status=${sm.status}`);
    }
  } else {
    console.log("(Smoke admin omitido: SUPERADMIN_EMAIL/PASSWORD)");
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n=== Resumen: ${results.length - failed.length}/${results.length} OK ===`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
