#!/usr/bin/env node
/**
 * E2E Fase 2 admin: solicitud Pro Empresa Demo + numeración QA + SMS inbound.
 * No borra registros al finalizar.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = (process.env.PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "");
const REQUEST_ID = "3e91201e-9aee-43cd-90fe-4fd80cfd0358";
const COMPANY_ID = "6cd1db92-d5c7-45e0-8548-df8907843350";
const DEMO_EMAIL = "cliente.demo@telvoice.cl";
const QA_NUMBER = "+56900005400";
const ADMIN_COOKIE = "tv_admin_session";
const CLIENT_COOKIE = "tv_client_session";

const report = {
  initial: null,
  afterReviewing: null,
  afterApproved: null,
  qaNumber: null,
  subscription: null,
  finalRequest: null,
  webhook: null,
  validations: {},
  errors: [],
};

function pass(id, detail) {
  report.validations[id] = { ok: true, detail };
  console.log(`✓ ${id}: ${detail}`);
}
function fail(id, detail) {
  report.validations[id] = { ok: false, detail };
  report.errors.push({ id, detail });
  console.error(`✗ ${id}: ${detail}`);
}

async function dbQuery(sql, params = []) {
  const conn = process.env.DATABASE_URL?.trim();
  if (!conn) throw new Error("DATABASE_URL requerido");
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function signCookie(email, cookieName, roleFilter) {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET requerido");

  const { rows } = await dbQuery(
    roleFilter === "superadmin"
      ? `SELECT id, email, name, role FROM admin_users WHERE role = 'superadmin' LIMIT 1`
      : `SELECT au.id, au.email, au.name, up.role, up.company_id
         FROM admin_users au
         JOIN user_profiles up ON up.admin_user_id = au.id
         WHERE lower(au.email) = lower($1) LIMIT 1`,
    roleFilter === "superadmin" ? [] : [email],
  );
  const u = rows[0];
  if (!u) throw new Error(`Usuario no encontrado: ${email || "superadmin"}`);

  const token = jwt.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    secret,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  return `${cookieName}=${token}`;
}

async function adminPost(path, cookie, body = {}) {
  const form = new URLSearchParams(body);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") || "" };
}

async function fetchHtml(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "follow",
  });
  return { status: res.status, html: await res.text(), url: res.url };
}

function htmlHasAll(html, needles) {
  const miss = needles.filter((n) => !html.includes(n));
  return { ok: miss.length === 0, miss };
}

async function getRequestState() {
  const { rows } = await dbQuery(
    `SELECT id, company_id, plan_code, status, preferred_number_type, notes, created_at, updated_at
     FROM agent_plan_requests WHERE id = $1`,
    [REQUEST_ID],
  );
  return rows[0] ?? null;
}

async function getActiveSubscription() {
  const { rows } = await dbQuery(
    `SELECT id, company_id, plan_code, status, monthly_price_clp, included_number_id,
            billing_cycle, starts_at, renews_at, created_at
     FROM agent_plan_subscriptions
     WHERE company_id = $1 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [COMPANY_ID],
  );
  return rows[0] ?? null;
}

async function getQaNumber() {
  const { rows } = await dbQuery(
    `SELECT id, number, company_id, type, status, provider, capabilities
     FROM client_numbers WHERE number = $1 LIMIT 1`,
    [QA_NUMBER],
  );
  return rows[0] ?? null;
}

async function main() {
  console.log("=== E2E Fase 2 — Empresa Demo Pro + numeración QA ===\n");

  report.initial = await getRequestState();
  if (!report.initial) {
    fail("request_exists", `Solicitud ${REQUEST_ID} no encontrada`);
    process.exit(1);
  }
  pass("request_exists", `status=${report.initial.status} plan=${report.initial.plan_code}`);

  const adminCookie = await signCookie(null, ADMIN_COOKIE, "superadmin");
  const clientCookie = await signCookie(DEMO_EMAIL, CLIENT_COOKIE, "client");

  // 1. Validar solicitud pendiente (o estado intermedio si re-ejecución)
  const detailPath = `/admin/agent-plans?request=${REQUEST_ID}`;
  const { html: detailHtml, status: detailStatus } = await fetchHtml(detailPath, adminCookie);
  if (detailStatus !== 200) {
    fail("admin_detail_page", `HTTP ${detailStatus}`);
  } else {
    const check = htmlHasAll(detailHtml, [
      "Empresa Demo",
      "Agente Pro",
      REQUEST_ID.slice(0, 8),
    ]);
    if (check.ok) pass("admin_detail_page", "Empresa Demo + Agente Pro visibles");
    else fail("admin_detail_page", `Faltan: ${check.miss.join(", ")}`);
  }

  const currentStatus = report.initial.status;

  // 2. reviewing
  if (currentStatus === "pending") {
    const r = await adminPost(`/admin/agent-plans/requests/${REQUEST_ID}/reviewing`, adminCookie);
    if (r.status !== 303) fail("action_reviewing", `HTTP ${r.status}`);
    else pass("action_reviewing", "POST reviewing → redirect");
    report.afterReviewing = await getRequestState();
    if (report.afterReviewing?.status === "reviewing") {
      pass("db_reviewing", "agent_plan_requests.status = reviewing");
    } else {
      fail("db_reviewing", `status=${report.afterReviewing?.status}`);
    }
  } else {
    pass("action_reviewing", `Omitido (ya en ${currentStatus})`);
    report.afterReviewing = report.initial;
  }

  // 3. approved
  const statusBeforeApprove = (await getRequestState())?.status;
  if (statusBeforeApprove === "reviewing" || statusBeforeApprove === "pending") {
    const r = await adminPost(`/admin/agent-plans/requests/${REQUEST_ID}/approve`, adminCookie);
    if (r.status !== 303) fail("action_approve", `HTTP ${r.status}`);
    else pass("action_approve", "POST approve → redirect");
    report.afterApproved = await getRequestState();
    if (report.afterApproved?.status === "approved") {
      pass("db_approved", "agent_plan_requests.status = approved");
    } else {
      fail("db_approved", `status=${report.afterApproved?.status}`);
    }
    const subBeforeActivate = await getActiveSubscription();
    if (!subBeforeActivate) {
      pass("no_sub_on_approve", "Sin suscripción hasta activar manualmente");
    } else {
      fail("no_sub_on_approve", `Suscripción activa prematura: ${subBeforeActivate.id}`);
    }
  } else if (["approved", "activated"].includes(statusBeforeApprove)) {
    pass("action_approve", `Omitido (ya en ${statusBeforeApprove})`);
    report.afterApproved = await getRequestState();
  }

  // 4. Crear numeración QA
  let qaNumber = await getQaNumber();
  if (qaNumber) {
    pass("qa_number_exists", `Reutilizando ${qaNumber.id} (${QA_NUMBER})`);
    report.qaNumber = qaNumber;
  } else {
    const r = await adminPost("/admin/numeraciones", adminCookie, {
      company_id: COMPANY_ID,
      number: QA_NUMBER,
      country_code: "CL",
      type: "sim_real",
      status: "active",
      provider: "QA / Telvoice Lab",
      gateway_id: "qa-gateway",
      sim_slot: "lab-slot-1",
    });
    if (r.status !== 303) fail("create_qa_number", `HTTP ${r.status}`);
    else pass("create_qa_number", "Numeración QA creada vía admin");
    qaNumber = await getQaNumber();
    report.qaNumber = qaNumber;
    if (qaNumber?.company_id === COMPANY_ID && qaNumber?.status === "active") {
      pass("db_qa_number", `${QA_NUMBER} activa para Empresa Demo`);
    } else {
      fail("db_qa_number", JSON.stringify(qaNumber));
    }
  }

  // 5. Activar plan Pro
  const statusBeforeActivate = (await getRequestState())?.status;
  let subscription = await getActiveSubscription();
  if (statusBeforeActivate === "activated" && subscription) {
    pass("action_activate", `Omitido (ya activated, sub=${subscription.id})`);
    report.subscription = subscription;
  } else if (statusBeforeActivate === "approved") {
    const r = await adminPost(
      `/admin/agent-plans/requests/${REQUEST_ID}/activate`,
      adminCookie,
      { included_number_id: qaNumber?.id ?? "" },
    );
    if (r.status !== 303) fail("action_activate", `HTTP ${r.status} loc=${r.location}`);
    else pass("action_activate", "Plan Pro activado manualmente");
    subscription = await getActiveSubscription();
    report.subscription = subscription;
    report.finalRequest = await getRequestState();

    if (report.finalRequest?.status === "activated") {
      pass("db_request_activated", "agent_plan_requests.status = activated");
    } else {
      fail("db_request_activated", `status=${report.finalRequest?.status}`);
    }
    if (subscription?.plan_code === "pro" && subscription?.status === "active") {
      pass("db_subscription", `sub=${subscription.id} pro active`);
    } else {
      fail("db_subscription", JSON.stringify(subscription));
    }
    if (Number(subscription?.monthly_price_clp) === 59900) {
      pass("db_subscription_price", "monthly_price_clp = 59900");
    } else {
      fail("db_subscription_price", `price=${subscription?.monthly_price_clp}`);
    }
    if (subscription?.included_number_id === qaNumber?.id) {
      pass("db_subscription_number", `included_number_id = ${qaNumber.id}`);
    } else {
      fail("db_subscription_number", `included=${subscription?.included_number_id}`);
    }
  } else {
    fail("action_activate", `Estado inesperado: ${statusBeforeActivate}`);
  }

  // 6. Validar vistas cliente
  for (const [id, path, needles] of [
    ["client_agente", "/app/agente", ["Agente Pro", QA_NUMBER, "Activo"]],
    ["client_numeraciones", "/app/numeraciones", [QA_NUMBER, "SIM real", "Bandeja"]],
    ["client_planes", "/app/planes-agente", ["Agente Pro", "Plan activo", "plan Agente Telvoice activo"]],
  ]) {
    const { html, status } = await fetchHtml(path, clientCookie);
    if (status !== 200) {
      fail(id, `HTTP ${status}`);
      continue;
    }
    const check = htmlHasAll(html, needles);
    if (check.ok) pass(id, needles.join(" · "));
    else fail(id, `Faltan: ${check.miss.join(", ")}`);
  }

  // 7. Webhook inbound SMS
  const webhookRes = await fetch(`${BASE}/api/webhooks/inbound-sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: QA_NUMBER,
      from: "Banco QA",
      body: "Tu código de prueba es 123456",
      provider: "qa-gateway",
    }),
  });
  const webhookJson = await webhookRes.json();
  report.webhook = { status: webhookRes.status, body: webhookJson };

  if (webhookRes.status === 201 && webhookJson.ok) {
    pass("webhook_inbound", `message_id=${webhookJson.message_id}`);
  } else {
    fail("webhook_inbound", JSON.stringify(webhookJson));
  }

  const { rows: smsRows } = await dbQuery(
    `SELECT id, company_id, client_number_id, to_number, from_number, body,
            detected_otp, status, source
     FROM inbound_sms_messages
     WHERE to_number = $1
     ORDER BY received_at DESC LIMIT 1`,
    [QA_NUMBER],
  );
  const sms = smsRows[0];
  if (sms?.detected_otp === "123456" && sms?.status === "received") {
    pass("db_inbound_sms", `OTP=${sms.detected_otp} status=${sms.status}`);
  } else {
    fail("db_inbound_sms", JSON.stringify(sms));
  }
  if (sms?.company_id === COMPANY_ID) {
    pass("db_sms_company", "company_id Empresa Demo");
  } else {
    fail("db_sms_company", `company_id=${sms?.company_id}`);
  }
  if (sms?.client_number_id === qaNumber?.id) {
    pass("db_sms_number", "client_number_id QA correcto");
  } else {
    fail("db_sms_number", `client_number_id=${sms?.client_number_id}`);
  }

  // 8. Bandejas SMS
  for (const [id, path, cookie, needles] of [
    ["client_sms_inbox", "/app/sms-inbox", clientCookie, ["Banco QA", QA_NUMBER, "123456"]],
    ["admin_sms_inbox", "/admin/sms-inbox", adminCookie, ["Empresa Demo", QA_NUMBER, "Banco QA", "123456"]],
  ]) {
    const { html, status } = await fetchHtml(path, cookie);
    if (status !== 200) {
      fail(id, `HTTP ${status}`);
      continue;
    }
    const check = htmlHasAll(html, needles);
    if (check.ok) pass(id, needles.join(" · "));
    else fail(id, `Faltan: ${check.miss.join(", ")}`);
  }

  // 9. Anti-duplicado Pro
  const dupRes = await fetch(`${BASE}/api/app/agent-plan/request`, {
    method: "POST",
    headers: {
      Cookie: clientCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan_code: "pro", preferred_number_type: "either" }),
  });
  const dupJson = await dupRes.json().catch(() => ({}));
  if (dupRes.status === 409 || dupJson?.error?.includes?.("plan agente activo")) {
    pass("anti_duplicate", `Bloqueado (${dupRes.status})`);
  } else {
    fail("anti_duplicate", `status=${dupRes.status} body=${JSON.stringify(dupJson)}`);
  }

  const { rows: dupReqs } = await dbQuery(
    `SELECT COUNT(*)::int AS c FROM agent_plan_requests
     WHERE company_id = $1 AND plan_code = 'pro' AND status NOT IN ('rejected')`,
    [COMPANY_ID],
  );
  if (dupReqs[0]?.c <= 2) {
    pass("no_extra_pro_request", `pro requests activas/pending: ${dupReqs[0].c}`);
  } else {
    fail("no_extra_pro_request", `count=${dupReqs[0]?.c}`);
  }

  // Reporte resumen
  console.log("\n=== RESUMEN ===");
  console.log(JSON.stringify({
    requestId: REQUEST_ID,
    initial: report.initial,
    afterReviewing: report.afterReviewing,
    afterApproved: report.afterApproved,
    qaNumberId: report.qaNumber?.id,
    qaNumber: QA_NUMBER,
    subscriptionId: report.subscription?.id,
    finalRequestStatus: report.finalRequest?.status ?? (await getRequestState())?.status,
    webhook: report.webhook,
    validations: report.validations,
    errors: report.errors,
  }, null, 2));

  const failed = Object.values(report.validations).filter((v) => !v.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
