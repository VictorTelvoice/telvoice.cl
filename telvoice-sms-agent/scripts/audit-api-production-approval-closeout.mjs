#!/usr/bin/env node
/**
 * Auditoría de cierre — aprobación production API Keys (solo lectura + QA temporal con limpieza).
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(/\/$/, "");
const DEMO = process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";
const DEMO_EMAIL = "cliente.demo@telvoice.cl";
const QA_PREFIX = `QA Audit ProdApproval ${Date.now()}`;

const report = {
  columns: [],
  rls: null,
  productionKeys: { total: 0, approved: 0, pending: 0, qaLike: [] },
  qaResiduesBefore: {},
  qaResiduesAfter: {},
  wallet: {},
  realSms: {},
  qaFlow: [],
  smoke: [],
  ui: [],
  cleanup: [],
  errors: [],
};

function ok(section, msg) {
  report.qaFlow.push({ ok: true, section, msg });
  console.log(`✅ [${section}] ${msg}`);
}
function bad(section, msg) {
  report.errors.push({ section, msg });
  console.error(`❌ [${section}] ${msg}`);
}

async function pgQuery(text, params) {
  const conn = process.env.DATABASE_URL?.trim();
  if (!conn) throw new Error("DATABASE_URL no definido");
  const c = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  try {
    return await c.query(text, params);
  } finally {
    await c.end();
  }
}

async function clientCookie() {
  const { rows } = await pgQuery(
    `select au.id, au.email, au.name, up.role from admin_users au
     join user_profiles up on up.admin_user_id = au.id where lower(au.email)=lower($1)`,
    [DEMO_EMAIL],
  );
  const u = rows[0];
  const token = jwt.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  return `tv_client_session=${token}`;
}

async function adminCookie() {
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email: process.env.SUPERADMIN_EMAIL,
      password: process.env.SUPERADMIN_PASSWORD,
    }),
    redirect: "manual",
  });
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return raw.flatMap((c) => (Array.isArray(c) ? c : [c])).map((c) => c.split(";")[0]).join("; ");
}

async function walletSnapshot() {
  const { rows } = await pgQuery(
    `select available_sms, reserved_sms from company_sms_wallets where company_id=$1 and country='CL'`,
    [DEMO],
  );
  const { rows: tx } = await pgQuery(
    `select count(*)::int as c from wallet_transactions wt
     join company_sms_wallets w on w.id=wt.wallet_id where w.company_id=$1`,
    [DEMO],
  );
  const { rows: prodCost } = await pgQuery(
    `select count(*)::int as c from sms_api_messages m
     join client_api_keys k on k.id=m.api_key_id
     where k.environment='production' and coalesce(m.cost_sms,0)>0`,
  );
  return {
    available: rows[0]?.available_sms,
    reserved: rows[0]?.reserved_sms,
    txCount: tx[0]?.c,
    prodCostSms: prodCost[0]?.c,
  };
}

console.log("=== 1. Columnas BD ===\n");
const { rows: cols } = await pgQuery(
  `select column_name, data_type
   from information_schema.columns
   where table_schema='public' and table_name='client_api_keys'
     and column_name in (
       'production_approved','production_approved_at',
       'production_approved_by_admin_id','production_approval_notes'
     )
   order by column_name`,
);
report.columns = cols;
for (const c of cols) console.log(`  ${c.column_name}: ${c.data_type}`);
if (cols.length !== 4) bad("columns", `Esperadas 4 columnas, encontradas ${cols.length}`);
else ok("columns", "4 columnas production approval presentes");

console.log("\n=== 2. RLS ===\n");
const { rows: rlsRows } = await pgQuery(
  `select relname, relrowsecurity from pg_class where relname='client_api_keys'`,
);
report.rls = rlsRows[0];
console.log(`  relrowsecurity=${report.rls?.relrowsecurity}`);
if (report.rls?.relrowsecurity !== false) bad("rls", "RLS habilitado en client_api_keys");
else ok("rls", "relrowsecurity=false");

console.log("\n=== 3. Production keys existentes ===\n");
const { rows: prodKeys } = await pgQuery(
  `select id, company_id, name, key_masked, status, environment,
          production_approved, production_approved_at, production_approved_by_admin_id, created_at
   from client_api_keys where environment='production' order by created_at desc`,
);
report.productionKeys.total = prodKeys.length;
report.productionKeys.approved = prodKeys.filter((k) => k.production_approved).length;
report.productionKeys.pending = prodKeys.filter((k) => !k.production_approved).length;
report.productionKeys.qaLike = prodKeys.filter((k) => /qa/i.test(k.name || ""));
console.log(`  Total: ${report.productionKeys.total}`);
console.log(`  Aprobadas: ${report.productionKeys.approved}`);
console.log(`  Pendientes: ${report.productionKeys.pending}`);
if (report.productionKeys.qaLike.length) {
  console.log(`  ⚠ Posibles QA (${report.productionKeys.qaLike.length}):`);
  for (const k of report.productionKeys.qaLike) {
    console.log(`    - ${k.id} ${k.name} (${k.key_masked})`);
  }
} else ok("prod-keys", "Sin production keys con nombre QA en inventario previo");

console.log("\n=== 4. Residuos QA (antes) ===\n");
const qaBefore = await Promise.all([
  pgQuery(`select count(*)::int as c from client_api_keys where name ilike '%QA%'`),
  pgQuery(
    `select count(*)::int as c from client_api_requests
     where metadata::text ilike '%qa%' or coalesce(error_code,'') ilike '%QA%'`,
  ),
  pgQuery(
    `select count(*)::int as c from sms_api_messages
     where coalesce(external_reference,'') ilike '%qa%' or metadata::text ilike '%qa%'`,
  ),
]);
report.qaResiduesBefore = {
  keys: qaBefore[0].rows[0].c,
  requests: qaBefore[1].rows[0].c,
  messages: qaBefore[2].rows[0].c,
};
console.log(`  qa_keys: ${report.qaResiduesBefore.keys}`);
console.log(`  qa_requests: ${report.qaResiduesBefore.requests}`);
console.log(`  qa_messages: ${report.qaResiduesBefore.messages}`);
if (report.qaResiduesBefore.keys > 0) {
  const { rows: qaKeyList } = await pgQuery(
    `select id, name, key_masked, environment, created_at from client_api_keys where name ilike '%QA%' order by created_at desc limit 20`,
  );
  console.log("  Detalle keys QA (no se borran automáticamente):");
  for (const k of qaKeyList) console.log(`    ${k.id} | ${k.name} | ${k.environment}`);
}

console.log("\n=== 5–9. QA controlado ===\n");
const clientCk = await clientCookie();
const adminCk = await adminCookie();
report.wallet.before = await walletSnapshot();

const prodCreate = await fetch(`${BASE}/app/api/keys`, {
  method: "POST",
  headers: { Cookie: clientCk, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: `${QA_PREFIX} production`,
    environment: "production",
    scopes: ["sms:send", "balance:read"],
  }),
});
const prodBody = await prodCreate.json();
const prodKeyId = prodBody.key?.id;
const prodPlain = prodBody.plainTextKey;
if (!prodKeyId || !prodPlain) {
  bad("qa-A", "No se creó production key QA");
  process.exit(1);
}
const { rows: afterCreate } = await pgQuery(
  `select environment, production_approved from client_api_keys where id=$1`,
  [prodKeyId],
);
if (afterCreate[0]?.environment !== "production" || afterCreate[0]?.production_approved !== false) {
  bad("qa-A", JSON.stringify(afterCreate[0]));
} else ok("qa-A", "production key QA: approved=false");

const app1 = await (await fetch(`${BASE}/app/api`, { headers: { Cookie: clientCk } })).text();
if (!app1.includes("Producción pendiente de aprobación") || !app1.includes("no habilitada para envío real")) {
  bad("qa-B", "Badges/texto cliente pendiente");
} else ok("qa-B", "/app/api badge pendiente + aviso envío real");

const admin1 = await (await fetch(`${BASE}/admin/api-usage`, { headers: { Cookie: adminCk } })).text();
if (!admin1.includes("Pendiente") || !admin1.includes("Aprobar production")) {
  bad("qa-C", "Admin no muestra pendiente/aprobar");
} else ok("qa-C", "/admin/api-usage pendiente + acción aprobar");

const approveRes = await fetch(`${BASE}/admin/api-usage/keys/${prodKeyId}/approve-production`, {
  method: "POST",
  headers: { Cookie: adminCk, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ notes: QA_PREFIX }),
  redirect: "manual",
});
if (approveRes.status !== 302 && approveRes.status !== 303) bad("qa-D", `approve HTTP ${approveRes.status}`);
const { rows: approved } = await pgQuery(
  `select production_approved, production_approved_at, production_approved_by_admin_id, metadata
   from client_api_keys where id=$1`,
  [prodKeyId],
);
const meta = approved[0]?.metadata ?? {};
if (
  !approved[0]?.production_approved ||
  !approved[0]?.production_approved_at ||
  !approved[0]?.production_approved_by_admin_id ||
  !meta.audit_log?.some((e) => e.action === "production_approved")
) {
  bad("qa-D", JSON.stringify(approved[0]));
} else ok("qa-D", "Aprobación BD + audit_log");

const app2 = await (await fetch(`${BASE}/app/api`, { headers: { Cookie: clientCk } })).text();
if (!app2.includes("Producción aprobada") || !app2.includes("fase posterior por Telvoice")) {
  bad("qa-E", "Cliente post-aprobación");
} else ok("qa-E", "/app/api badge aprobada + texto envío real inactivo");

if (app2.includes(prodPlain)) bad("ui-client", "Key completa visible en HTML");
else ok("ui-client", "No expone key completa tras recargar");

if (admin1.match(/key_hash|tv_live_[a-z0-9]{20,}/i)) bad("ui-admin", "Posible secreto en HTML admin");
else ok("ui-admin", "Admin no muestra key_hash/key completa (muestra previa)");

const send1 = await fetch(`${BASE}/api/v1/sms/send`, {
  method: "POST",
  headers: { Authorization: `Bearer ${prodPlain}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    to: "+56912345678",
    message: "QA audit prod approval",
    sender: "Telvoice",
    country: "CL",
    external_reference: `qa-audit-prod-appr-${Date.now()}`,
  }),
});
const send1Body = await send1.json();
if (send1.status !== 403 || send1Body.error?.code !== "PRODUCTION_SEND_NOT_ENABLED") {
  bad("qa-F", JSON.stringify({ status: send1.status, body: send1Body }));
} else ok("qa-F", "POST sms/send → 403 PRODUCTION_SEND_NOT_ENABLED");
const { rows: log1 } = await pgQuery(`select metadata from client_api_requests where request_id=$1`, [
  send1Body.request_id,
]);
const lm1 = log1[0]?.metadata ?? {};
if (lm1.production_approved !== true || lm1.reason !== "production_send_not_enabled") {
  bad("qa-F-log", JSON.stringify(lm1));
} else ok("qa-F-log", "Log metadata production_approved=true");

const revokeRes = await fetch(
  `${BASE}/admin/api-usage/keys/${prodKeyId}/revoke-production-approval`,
  {
    method: "POST",
    headers: { Cookie: adminCk, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ reason: `${QA_PREFIX} revoke` }),
    redirect: "manual",
  },
);
if (revokeRes.status !== 302 && revokeRes.status !== 303) bad("qa-G", `revoke HTTP ${revokeRes.status}`);
const { rows: revoked } = await pgQuery(
  `select production_approved, production_approval_notes, metadata from client_api_keys where id=$1`,
  [prodKeyId],
);
const meta2 = revoked[0]?.metadata ?? {};
if (
  revoked[0]?.production_approved !== false ||
  !meta2.audit_log?.some((e) => e.action === "production_approval_revoked")
) {
  bad("qa-G", JSON.stringify(revoked[0]));
} else ok("qa-G", "Revocación + audit_log + notas");

const send2 = await fetch(`${BASE}/api/v1/sms/send`, {
  method: "POST",
  headers: { Authorization: `Bearer ${prodPlain}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    to: "+56912345678",
    message: "QA audit post revoke",
    sender: "Telvoice",
    country: "CL",
    external_reference: `qa-audit-prod-appr-rev-${Date.now()}`,
  }),
});
const send2Body = await send2.json();
const { rows: log2 } = await pgQuery(`select metadata from client_api_requests where request_id=$1`, [
  send2Body.request_id,
]);
const lm2 = log2[0]?.metadata ?? {};
if (send2.status !== 403 || lm2.production_approved !== false) {
  bad("qa-H", JSON.stringify({ status: send2.status, lm2 }));
} else ok("qa-H", "Post-revoke send bloqueado, log production_approved=false");

report.wallet.after = await walletSnapshot();
if (
  report.wallet.before.available !== report.wallet.after.available ||
  report.wallet.before.reserved !== report.wallet.after.reserved ||
  report.wallet.before.txCount !== report.wallet.after.txCount
) {
  bad("wallet", JSON.stringify(report.wallet));
} else ok("wallet", "available/reserved/txCount sin cambios");

if (report.wallet.after.prodCostSms !== 0) bad("wallet", `production cost_sms>0: ${report.wallet.after.prodCostSms}`);
else ok("wallet", "0 mensajes production con cost_sms>0");

const { rows: realCheck } = await pgQuery(
  `select count(*)::int as with_provider from sms_api_messages
   where api_key_id=$1 and provider_message_id is not null`,
  [prodKeyId],
);
const { rows: dlrCheck } = await pgQuery(
  `select count(*)::int as with_dlr from sms_api_messages where api_key_id=$1 and dlr_status is not null`,
  [prodKeyId],
);
report.realSms = { provider: realCheck[0]?.with_provider, dlr: dlrCheck[0]?.with_dlr };
if (report.realSms.provider > 0 || report.realSms.dlr > 0) bad("real-sms", JSON.stringify(report.realSms));
else ok("real-sms", "Sin provider_message_id ni dlr_status en mensajes QA");

console.log("\n=== 9. Limpieza QA (solo esta auditoría) ===\n");
await pgQuery(`delete from client_api_requests where api_key_id=$1`, [prodKeyId]);
await pgQuery(`delete from sms_api_messages where api_key_id=$1`, [prodKeyId]);
await pgQuery(`delete from client_api_keys where id=$1`, [prodKeyId]);
report.cleanup.push(prodKeyId);
ok("cleanup", `Eliminada key QA ${prodKeyId} + logs/mensajes asociados`);

const qaAfter = await Promise.all([
  pgQuery(`select count(*)::int as c from client_api_keys where name ilike '%QA%'`),
  pgQuery(
    `select count(*)::int as c from client_api_requests
     where metadata::text ilike '%qa%' or coalesce(error_code,'') ilike '%QA%'`,
  ),
  pgQuery(
    `select count(*)::int as c from sms_api_messages
     where coalesce(external_reference,'') ilike '%qa%' or metadata::text ilike '%qa%'`,
  ),
]);
report.qaResiduesAfter = {
  keys: qaAfter[0].rows[0].c,
  requests: qaAfter[1].rows[0].c,
  messages: qaAfter[2].rows[0].c,
};

console.log("\n=== 10. Smoke test ===\n");
const clientPaths = [
  "/app/api",
  "/app/wallet",
  "/app/orders",
  "/app/support",
  "/app/templates",
  "/app/settings",
  "/app/dashboard",
];
for (const p of clientPaths) {
  const r = await fetch(`${BASE}${p}`, { headers: { Cookie: clientCk }, redirect: "manual" });
  const okStatus = r.status === 200 || r.status === 302;
  report.smoke.push({ path: p, status: r.status, ok: okStatus });
  if (okStatus) ok("smoke", `${p} → ${r.status}`);
  else bad("smoke", `${p} → ${r.status}`);
}

const adminPaths = ["/admin", "/admin/support", "/admin/api-usage"];
for (const p of adminPaths) {
  const r = await fetch(`${BASE}${p}`, { headers: { Cookie: adminCk }, redirect: "manual" });
  const okStatus = r.status === 200 || r.status === 302;
  report.smoke.push({ path: p, status: r.status, ok: okStatus });
  if (okStatus) ok("smoke", `${p} → ${r.status}`);
  else bad("smoke", `${p} → ${r.status}`);
}

const sbCreate = await fetch(`${BASE}/app/api/keys`, {
  method: "POST",
  headers: { Cookie: clientCk, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: `${QA_PREFIX} sandbox-smoke`,
    environment: "sandbox",
    scopes: ["sms:send", "balance:read", "messages:read"],
  }),
});
const sbBody = await sbCreate.json();
const sbPlain = sbBody.plainTextKey;
const sbId = sbBody.key?.id;

async function apiFetch(path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${sbPlain}`,
      "Content-Type": "application/json",
      ...(method === "POST" ? { "Idempotency-Key": `qa-smoke-${Date.now()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

if (sbPlain) {
  const bal = await apiFetch("/api/v1/balance");
  if (bal.status === 200 && bal.body.success) ok("smoke-api", "GET /api/v1/balance OK");
  else bad("smoke-api", `balance ${bal.status}`);

  const send = await apiFetch("/api/v1/sms/send", "POST", {
    to: "+56912345678",
    message: "QA smoke sandbox",
    sender: "Telvoice",
    country: "CL",
    external_reference: `qa-smoke-sb-${Date.now()}`,
  });
  if (send.status === 200 || send.status === 201) ok("smoke-api", "POST /api/v1/sms/send sandbox OK");
  else bad("smoke-api", `sms/send ${send.status} ${send.body?.error?.code}`);

  const list = await apiFetch("/api/v1/messages?limit=5");
  if (list.status === 200 && list.body.messages) ok("smoke-api", "GET /api/v1/messages OK");
  else bad("smoke-api", `messages ${list.status}`);

  if (sbId) {
    await pgQuery(`delete from client_api_requests where api_key_id=$1`, [sbId]);
    await pgQuery(`delete from sms_api_messages where api_key_id=$1`, [sbId]);
    await pgQuery(`delete from client_api_keys where id=$1`, [sbId]);
    report.cleanup.push(sbId);
    ok("cleanup", `Sandbox smoke key ${sbId} eliminada`);
  }
} else {
  bad("smoke-api", "No se pudo crear sandbox key para smoke API");
}

console.log("\n=== RESUMEN ===\n");
console.log(JSON.stringify({ errors: report.errors, productionKeys: report.productionKeys, qaResiduesBefore: report.qaResiduesBefore, qaResiduesAfter: report.qaResiduesAfter, wallet: report.wallet, realSms: report.realSms, cleanup: report.cleanup }, null, 2));
if (report.errors.length) process.exit(1);
console.log("\n✅ Auditoría de cierre production approval completada sin errores.");
