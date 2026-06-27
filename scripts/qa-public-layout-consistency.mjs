#!/usr/bin/env node
/**
 * QA — layout público consistente: nav/footer compartidos en todas las páginas públicas.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.QA_BASE_URL || "https://www.telvoice.cl/").replace(/\/?$/, "/");
const HOME = "https://www.telvoice.cl/";
const OUT = join(process.cwd(), "qa-evidence/public-layout-consistency");

const PAGES = [
  { id: "home-desktop", url: BASE, viewport: { width: 1440, height: 900 }, isHome: true },
  { id: "home-mobile", url: BASE, viewport: { width: 390, height: 844 }, isHome: true },
  { id: "numeracion-sim-desktop", url: `${BASE}numeracion-sim.html`, viewport: { width: 1440, height: 900 } },
  { id: "numeracion-sim-mobile", url: `${BASE}numeracion-sim.html`, viewport: { width: 390, height: 844 } },
  { id: "terminos-desktop", url: `${BASE}terminos-y-condiciones/`, viewport: { width: 1440, height: 900 } },
  { id: "terminos-mobile", url: `${BASE}terminos-y-condiciones/`, viewport: { width: 390, height: 844 } },
  { id: "privacidad-desktop", url: `${BASE}politica-de-privacidad/`, viewport: { width: 1440, height: 900 } },
  { id: "privacidad-mobile", url: `${BASE}politica-de-privacidad/`, viewport: { width: 390, height: 844 } },
  { id: "uso-responsable", url: `${BASE}uso-responsable/`, viewport: { width: 1440, height: 900 } },
  { id: "ayuda", url: `${BASE}ayuda/`, viewport: { width: 1440, height: 900 } },
  { id: "pago-exitoso", url: `${BASE}pago-exitoso/`, viewport: { width: 1440, height: 900 } },
  { id: "pago-pendiente", url: `${BASE}pago-pendiente/`, viewport: { width: 1440, height: 900 } },
  { id: "pago-fallido", url: `${BASE}pago-fallido/`, viewport: { width: 1440, height: 900 } },
  { id: "pago-error", url: `${BASE}pago-error/`, viewport: { width: 1440, height: 900 } },
];

const INVALID_LOCAL_HASH = [
  /numeracion-sim\.html#/,
  /terminos-y-condiciones\/#/,
  /politica-de-privacidad\/#/,
  /pago-(exitoso|pendiente|fallido|error)\/#/,
  /ayuda\/#/,
];

function normalizeHref(href) {
  return (href || "").replace(/index\.html(?=#)/, "");
}

async function auditPage(page) {
  return page.evaluate(({ HOME, INVALID_LOCAL_HASH }) => {
    const navs = Array.from(document.querySelectorAll("body > nav"));
    const footers = document.querySelectorAll(
      "#telvoice-site-footer footer, #telvoice-site-footer .tv-site-footer, footer.tv-site-footer"
    );
    const footerMount = document.getElementById("telvoice-site-footer");
    const logo = document.querySelector('body > nav a[data-telvoice-home], body > nav a[href="https://www.telvoice.cl/"]');
    const comprar = document.getElementById("nav-comprar-sms");
    const agentToggle = document.getElementById("nav-floating-agent-toggle");
    const loginBtn = document.querySelector("body > nav .nav-login-btn");
    const navLinks = Array.from(document.querySelectorAll("body > nav a[href]")).map((a) => ({
      text: (a.textContent || "").trim(),
      href: a.getAttribute("href") || "",
    }));

    const footerLegal = Array.from(
      document.querySelectorAll(
        '#telvoice-site-footer a[href*="terminos-y-condiciones"], #telvoice-site-footer a[href*="politica-de-privacidad"]'
      )
    ).map((a) => a.getAttribute("href") || "");

    const invalidNav = navLinks.filter((item) =>
      INVALID_LOCAL_HASH.some((re) => re.test(item.href))
    );

    const comprarHref = comprar ? comprar.getAttribute("href") || "" : "";
    const logoHref = logo ? logo.getAttribute("href") || "" : "";

    return {
      navCount: navs.length,
      footerCount: footers.length,
      hasFooterMount: !!footerMount,
      hasFooterContent: footers.length > 0 || (footerMount && footerMount.innerHTML.trim().length > 50),
      logoHref,
      comprarHref,
      hasAgentToggle: !!agentToggle,
      hasLoginBtn: !!loginBtn,
      hasComprarSms: !!comprar,
      invalidNav,
      footerLegal,
      navHasPreciosDropdown: !!document.getElementById("nav-precios-toggle"),
      navHasNumeracionLink: navLinks.some((l) => l.text === "Numeración"),
      navHasCasosLink: navLinks.some((l) => l.text === "Casos de uso"),
    };
  }, { HOME, INVALID_LOCAL_HASH });
}

async function testPage(browserPage, spec, outDir) {
  await browserPage.setViewportSize(spec.viewport);
  await browserPage.goto(spec.url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await browserPage.waitForSelector("body > nav", { timeout: 30000 });
  await browserPage.waitForTimeout(spec.id.includes("ayuda") ? 2500 : 1200);

  const audit = await auditPage(browserPage);

  const expectedComprar = spec.isHome ? "#calculadora" : `${HOME}#calculadora`;
  const comprarOk =
    audit.comprarHref === expectedComprar ||
    audit.comprarHref === `${HOME}#calculadora`;

  const logoOk = logoHrefClean(audit.logoHref);
  const layoutOk =
    audit.navCount === 1 &&
    audit.hasFooterMount &&
    audit.hasFooterContent &&
    audit.invalidNav.length === 0 &&
    audit.hasComprarSms &&
    audit.hasLoginBtn &&
    audit.hasAgentToggle &&
    audit.navHasPreciosDropdown &&
    audit.navHasNumeracionLink &&
    audit.navHasCasosLink &&
    comprarOk &&
    logoOk;

  await browserPage.screenshot({
    path: join(outDir, `${spec.id}-header.png`),
    clip: { x: 0, y: 0, width: spec.viewport.width, height: 120 },
  });

  await browserPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await browserPage.waitForTimeout(400);

  await browserPage.screenshot({
    path: join(outDir, `${spec.id}-footer.png`),
    clip: {
      x: 0,
      y: Math.max(0, spec.viewport.height - 220),
      width: spec.viewport.width,
      height: Math.min(220, spec.viewport.height),
    },
  });

  return {
    id: spec.id,
    url: spec.url,
    viewport: spec.viewport,
    audit,
    checks: {
      singleNav: audit.navCount === 1,
      footerMount: audit.hasFooterMount,
      footerRendered: audit.hasFooterContent,
      logoHome: logoOk,
      comprarSms: comprarOk,
      agentToggle: audit.hasAgentToggle,
      noInvalidNavHashes: audit.invalidNav.length === 0,
    },
    pass: layoutOk,
  };
}

function logoHrefClean(href) {
  const normalized = normalizeHref(href);
  return normalized === HOME || normalized === "https://www.telvoice.cl";
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  for (const spec of PAGES) {
    results.push(await testPage(page, spec, OUT));
  }

  await browser.close();

  const report = {
    baseUrl: BASE,
    generatedAt: new Date().toISOString(),
    allPass: results.every((r) => r.pass),
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).map((r) => r.id),
    results,
  };

  await writeFile(join(OUT, "qa-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
