#!/usr/bin/env node
/**
 * Smoke test autenticado superadmin — solo lectura, sin enviar SMS.
 */
import "dotenv/config";

const BASE = process.env.SMOKE_ADMIN_BASE_URL?.trim() || "https://admin.telvoice.cl";
const LOGIN_PATH = process.env.SMOKE_ADMIN_LOGIN_PATH?.trim() || "/login";
const EMAIL = process.env.SUPERADMIN_EMAIL?.trim();
const PASSWORD = process.env.SUPERADMIN_PASSWORD?.trim();
const QA_COMPANY_ID = "6cd1db92-d5c7-45e0-8548-df8907843350";
const PROVIDER_IDS = ["22563988", "22363217", "22363201"];

if (!EMAIL || !PASSWORD) {
  console.error("Faltan SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD");
  process.exit(1);
}

/** @type {Map<string, string>} */
const jar = new Map();

function storeCookies(headers) {
  const raw = headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const part = line.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchWithCookies(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  const ck = cookieHeader();
  if (ck) headers.set("cookie", ck);
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  storeCookies(res.headers);
  return res;
}

async function followRedirects(res, max = 5) {
  let current = res;
  let hops = 0;
  while (
    hops < max &&
    current.status >= 300 &&
    current.status < 400 &&
    current.headers.get("location")
  ) {
    const loc = current.headers.get("location");
    const next = loc.startsWith("http") ? loc : new URL(loc, BASE).href;
    current = await fetchWithCookies(next, { method: "GET" });
    hops++;
  }
  return current;
}

async function login() {
  const body = new URLSearchParams({
    email: EMAIL,
    password: PASSWORD,
    next: "/admin/test",
  });
  const res = await fetchWithCookies(`${BASE}${LOGIN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const final = await followRedirects(res);
  const ok =
    final.status === 200 &&
    !final.url.includes("/login") &&
    jar.size > 0;
  return { ok, status: final.status, url: final.url, cookies: jar.size };
}

function htmlChecks(html, label) {
  const lower = html.toLowerCase();
  return {
    label,
    hasFelipe: /felipevalenciao|958688d8-0b85-4e35-9449-5dd6375fd2e4/i.test(html),
    hasVictorCommercial:
      /victor garc[eé]s/i.test(html) &&
      !/victor@telvoice\.net/i.test(html) === false,
    hasVictorEmail: /victor@telvoice\.net/i.test(html),
    hasDemoCompany: /empresa demo telvoice/i.test(html),
    hasTelvoiceQa: /telvoice qa/i.test(html),
    hasQaContextCard: /contexto qa interno/i.test(html),
    hasQaContextBadges: /qa interno/i.test(html) && /no cliente real/i.test(html),
    hasVerifyTest: /verify test|verify_test|app_send_sms_verify_test/i.test(html),
    hasTestPage: /test|telsim|l[ií]nea qa/i.test(lower),
    hasSendForm: /tv-send-qa-form|tv-test-send|name="message"/i.test(html),
  };
}

async function fetchPage(path) {
  const res = await fetchWithCookies(`${BASE}${path}`, { method: "GET" });
  const final = await followRedirects(res);
  const html = await final.text();
  return { status: final.status, url: final.url, html };
}

async function healthCheck() {
  const res = await fetch("https://agent.telvoice.cl/health");
  return res.json();
}

async function main() {
  const report = {
    login: null,
    health: null,
    adminTest: null,
    messages: {},
    walletBaseline: null,
    allPassed: true,
  };

  report.health = await healthCheck();

  report.login = await login();
  if (!report.login.ok) {
    report.allPassed = false;
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const testPage = await fetchPage("/admin/test");
  report.adminTest = {
    status: testPage.status,
    url: testPage.url,
    checks: htmlChecks(testPage.html, "/admin/test"),
  };
  if (
    report.adminTest.checks.hasFelipe ||
    report.adminTest.checks.hasVictorEmail
  ) {
    report.allPassed = false;
  }
  if (
    !report.adminTest.checks.hasQaContextCard ||
    !report.adminTest.checks.hasDemoCompany ||
    !report.adminTest.checks.hasTelvoiceQa
  ) {
    report.allPassed = false;
  }
  if (testPage.status !== 200 || testPage.url.includes("/login")) {
    report.allPassed = false;
  }

  for (const pid of PROVIDER_IDS) {
    const page = await fetchPage(`/admin/messages?q=${pid}`);
    const checks = htmlChecks(page.html, pid);
    const rowMatch = page.html.includes(pid);
    report.messages[pid] = {
      status: page.status,
      rowFound: rowMatch,
      checks,
      clientOk:
        rowMatch &&
        (checks.hasTelvoiceQa || checks.hasDemoCompany) &&
        !checks.hasFelipe &&
        !checks.hasVictorEmail,
      originOk: rowMatch && checks.hasVerifyTest,
    };
    if (rowMatch && (!report.messages[pid].clientOk || !report.messages[pid].originOk)) {
      report.allPassed = false;
    }
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
