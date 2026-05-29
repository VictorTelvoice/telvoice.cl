#!/usr/bin/env node
/**
 * QA HTTP: sesiones admin/cliente separadas (4 casos).
 * Requiere: SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD; opcional CLIENT_DEMO_PASSWORD.
 */
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcrypt";

const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(
  /\/$/,
  "",
);
const ADMIN_COOKIE = "tv_admin_session";
const CLIENT_COOKIE = "tv_client_session";

const results = [];
const pass = (id, d) => {
  results.push({ id, ok: true, d });
  console.log(`✓ ${id}: ${d}`);
};
const fail = (id, d) => {
  results.push({ id, ok: false, d });
  console.error(`✗ ${id}: ${d}`);
};

function parseCookies(res) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return raw
    .flatMap((c) => (Array.isArray(c) ? c : [c]))
    .map((c) => c.split(";")[0])
    .join("; ");
}

function cookieMap(cookieHeader) {
  const m = new Map();
  if (!cookieHeader) return m;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) m.set(k, v.join("="));
  }
  return m;
}

async function loginAdmin(email, password) {
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }),
    redirect: "manual",
  });
  return { cookie: parseCookies(res), status: res.status, loc: res.headers.get("location") };
}

async function loginClient(email, password) {
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }),
    redirect: "manual",
  });
  const raw = parseCookies(res);
  const m = cookieMap(raw);
  const clientTok = m.get(CLIENT_COOKIE);
  const adminTok = m.get(ADMIN_COOKIE);
  if (clientTok) return `${CLIENT_COOKIE}=${clientTok}`;
  if (adminTok) return `${ADMIN_COOKIE}=${adminTok}`;
  throw new Error(`Login cliente sin cookie: HTTP ${res.status}`);
}

async function get(path, cookie, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
    ...opts,
  });
  const text = opts.noBody ? "" : await res.text();
  return {
    status: res.status,
    loc: res.headers.get("location") || "",
    text,
    setCookie: parseCookies(res),
  };
}

async function main() {
  // Caso A: sin cookies
  let r = await get("/admin/login");
  if (r.status === 200 && !r.loc.includes("/app")) pass("A_admin_login", "200 sin redirect /app");
  else fail("A_admin_login", `status=${r.status} loc=${r.loc}`);

  r = await get("/admin/support");
  if (r.loc.includes("/admin/login")) pass("A_admin_support", "302 login");
  else fail("A_admin_support", `loc=${r.loc}`);

  r = await get("/app/dashboard");
  if (r.loc.includes("/login")) pass("A_app_dashboard", "302 login cliente");
  else fail("A_app_dashboard", `loc=${r.loc}`);

  const demoPass = process.env.CLIENT_DEMO_PASSWORD?.trim();
  if (!demoPass) {
    console.log("(Casos B–D omitidos: sin CLIENT_DEMO_PASSWORD)");
  } else {
    const clientOnly = await loginClient("cliente.demo@telvoice.cl", demoPass);

    // Caso B: solo cliente (tv_client_session simulada; legacy en admin cookie para migración)
    r = await get("/app/dashboard", clientOnly);
    if (r.status === 200) pass("B_app_dashboard", "200");
    else fail("B_app_dashboard", `status=${r.status} loc=${r.loc}`);

    r = await get("/admin/login", clientOnly);
    if (r.status === 200 && !r.loc.includes("/app")) pass("B_admin_login", "200 login admin");
    else fail("B_admin_login", `status=${r.status} loc=${r.loc}`);

    r = await get("/admin/support", clientOnly);
    if (r.loc.includes("/admin/login") && !r.loc.includes("/app"))
      pass("B_admin_support", "302 admin login");
    else fail("B_admin_support", `loc=${r.loc}`);

    // Legacy: solo tv_admin_session con token cliente (reproduce bug original)
    const legacyOnly = clientOnly.replace(`${CLIENT_COOKIE}=`, `${ADMIN_COOKIE}=`);
    r = await get("/admin/login", legacyOnly);
    if (r.status === 200 && !r.loc.includes("/app")) pass("B_legacy_admin_login", "200 (legacy limpiada)");
    else fail("B_legacy_admin_login", `status=${r.status} loc=${r.loc}`);

    const adminEmail = process.env.SUPERADMIN_EMAIL?.trim();
    const adminPass = process.env.SUPERADMIN_PASSWORD?.trim();
    if (adminEmail && adminPass) {
      const { cookie: adminCookie } = await loginAdmin(adminEmail, adminPass);

      r = await get("/admin/login", adminCookie);
      if (r.loc === "/admin" || r.loc?.endsWith("/admin"))
        pass("C_admin_login", "302 /admin");
      else fail("C_admin_login", `loc=${r.loc}`);

      r = await get("/admin/support", adminCookie);
      if (r.status === 200) pass("C_admin_support", "200");
      else fail("C_admin_support", `status=${r.status} loc=${r.loc}`);

      const both = `${clientOnly}; ${adminCookie}`;
      r = await get("/app/dashboard", both);
      if (r.status === 200) pass("D_app_dashboard", "200");
      else fail("D_app_dashboard", `status=${r.status} loc=${r.loc}`);

      r = await get("/admin/support", both);
      if (r.status === 200) pass("D_admin_support", "200");
      else fail("D_admin_support", `status=${r.status} loc=${r.loc}`);

      r = await get("/admin/login", both);
      if (r.loc === "/admin" || r.loc?.endsWith("/admin"))
        pass("D_admin_login", "302 /admin");
      else fail("D_admin_login", `loc=${r.loc}`);
    }
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} OK`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
