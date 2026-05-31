#!/usr/bin/env node
/**
 * QA visual post-deploy wholesale nav (authenticated superadmin).
 */
import "dotenv/config";

const BASE = process.env.QA_BASE_URL?.trim() || "https://admin.telvoice.cl";
const PTG_ID = "ba7a58fa-f0b3-47c7-85b0-2849e7997d74";

async function login() {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email: process.env.SUPERADMIN_EMAIL ?? "",
      password: process.env.SUPERADMIN_PASSWORD ?? "",
    }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .find((c) => c.startsWith("tv_admin_session=") && !c.includes("Max-Age=0") && c.length > 30)
    ?.split(";")[0];
  return { status: res.status, cookie: cookie ?? "" };
}

function has(html, s) {
  return html.includes(s);
}

const { status: loginStatus, cookie } = await login();
console.log("login", loginStatus, "cookie", !!cookie);
if (!cookie) process.exit(1);

const hdr = { Cookie: cookie };

const dash = await (await fetch(`${BASE}/admin`, { headers: hdr })).text();
for (const s of [
  "Retail Chile",
  "Wholesale internacional",
  "NOC / Traffic",
  "Billing",
  "System",
  "Vendor SMPP Accounts",
  "Route Manager",
]) {
  console.log("nav", s, has(dash, s) ? "OK" : "MISSING");
}

const pages = [
  "/admin/wholesale",
  "/admin/wholesale/providers",
  "/admin/wholesale/smpp-lab",
  "/admin/wholesale/international-rates",
  "/admin/wholesale/routes",
];
for (const p of pages) {
  const r = await fetch(`${BASE}${p}`, { headers: hdr, redirect: "manual" });
  console.log("page", p, r.status);
}

const ptgOverview = await (
  await fetch(`${BASE}/admin/wholesale/providers/${PTG_ID}/edit?tab=overview`, { headers: hdr })
).text();
for (const t of ["Overview", "SMPP Accounts", "Vendor Rates", "Routes", "Tests", "Billing", "Notes"]) {
  console.log("tab", t, has(ptgOverview, t) ? "OK" : "MISSING");
}

const ptgSmpp = await (
  await fetch(`${BASE}/admin/wholesale/providers/${PTG_ID}/edit?tab=smpp-accounts`, { headers: hdr })
).text();
for (const s of [
  "SMPP Accounts",
  "New SMPP Account",
  "upstream",
  "Account Name",
  "Last bind result",
]) {
  console.log("smpp_tab", s, has(ptgSmpp, s) ? "OK" : "MISSING");
}
const newLink = ptgSmpp.match(/smpp-lab\/new\?provider_id=[^"']+/);
console.log("new_account_link", newLink ? newLink[0] : "MISSING");

const prefillUrl = `${BASE}/admin/wholesale/smpp-lab/new?provider_id=${PTG_ID}`;
const pre = await (await fetch(prefillUrl, { headers: hdr })).text();
console.log(
  "prefill",
  JSON.stringify({
    provider_ptg: has(pre, "PTG Pacific Telecom"),
    account_ptg_2way: has(pre, "PTG_2WAY"),
    host: has(pre, "213.239.210.94"),
    system_id: has(pre, "telvoice.2way"),
    port_7777: has(pre, "7777"),
    transceiver: has(pre, "transceiver"),
    timeout_300: has(pre, "300"),
    enquire_45: has(pre, "45"),
    speed_10: has(pre, "10"),
    credit_100000: has(pre, "100000"),
    usd: has(pre, "USD"),
    identifier_29: has(pre, "29"),
    password_field_present: has(pre, 'type="password"'),
  }),
);

const rates = await (await fetch(`${BASE}/admin/wholesale/international-rates`, { headers: hdr })).text();
for (const s of ["Buy rate", "Sell rate", "Termination", "pending", "RO", "GB", "CL"]) {
  console.log("rates", s, has(rates, s) ? "OK" : "MISSING");
}

const routes = await (await fetch(`${BASE}/admin/wholesale/routes`, { headers: hdr })).text();
for (const s of ["Route Manager", "SMPP Account", "Rate Plan", "Priority", "Last bind", "Last test", "Margin"]) {
  console.log("routes", s, has(routes, s) ? "OK" : "MISSING");
}

for (const p of [
  ...pages,
  `/admin/wholesale/providers/${PTG_ID}/edit`,
  `/admin/wholesale/smpp-lab/new?provider_id=${PTG_ID}`,
  "/admin/pricing",
  "/admin/orders",
  "/admin/wallets",
]) {
  const r = await fetch(`${BASE}${p}`, { headers: hdr, redirect: "manual" });
  console.log("retail_admin", p, r.status);
  if (r.status >= 500) process.exitCode = 2;
}
