#!/usr/bin/env node
/**
 * Regresión obligatoria — scroll hero, anchors/hash y agente flotante (landing pública).
 *
 * Ejecutar ANTES de merge/deploy si se toca cualquiera de:
 *   - index.html
 *   - js/telvoice-app.js
 *   - js/telvoice-web-agent-loader.js
 *   - js/telvoice-floating-agent-pref.js
 *   - js/telvoice-floating-agent-toggle.js
 *   - js/telvoice-web-agent.js
 *
 * No modificar scroll inicial, navegación por hash/anchors ni visibilidad del agente
 * flotante sin pasar esta batería.
 *
 * Uso:
 *   npm run test:landing-scroll-agent-qa
 *   QA_BASE_URL=http://127.0.0.1:8765 node scripts/qa-landing-scroll-agent-validation.mjs
 *
 * Evidencia: qa-evidence/landing-scroll-agent-validation/ (+ qa-report.json)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "https://www.telvoice.cl/";
const OUT = join(process.cwd(), "qa-evidence/landing-scroll-agent-validation");

const LEGACY_CONFLICT = {
  "telvoice:floating-agent-state:public": "open",
  "telvoice:floating-agent-visible": "false",
};

const HASH_SETTLE_MS = 4500;

async function waitForAgent(page) {
  await page.waitForSelector("#telvoice-web-agent", { timeout: 60000 });
  await page.waitForFunction(
    () => {
      const root = document.getElementById("telvoice-web-agent");
      return root && root.classList.contains("tva-root--ready");
    },
    { timeout: 60000 },
  );
  await page.waitForTimeout(800);
}

async function waitForHashScroll(page) {
  await page.waitForTimeout(HASH_SETTLE_MS);
}

async function auditLanding(page, sectionId) {
  return page.evaluate((id) => {
    const el = id ? document.getElementById(id) : null;
    const rect = el?.getBoundingClientRect();
    const nav = document.querySelector("body > nav");
    const navH = nav ? nav.getBoundingClientRect().height : 0;
    const heroTitle = document.getElementById("hero-title");
    const heroRect = heroTitle?.getBoundingClientRect();
    const floatRoot = document.getElementById("telvoice-web-agent");
    const launcher = floatRoot?.querySelector(".tva-launcher");
    const launcherRect = launcher?.getBoundingClientRect();
    const floatStyle = floatRoot ? getComputedStyle(floatRoot) : null;

    const heroMisaligned =
      !!heroRect && heroRect.top < navH - 8 && heroRect.bottom > navH + 20;

    return {
      hash: location.hash,
      scrollY: Math.round(window.scrollY),
      sectionTop: rect ? Math.round(rect.top) : null,
      sectionInView:
        !!rect && rect.top <= navH + 32 && rect.top >= navH - 48 && rect.bottom > navH + 80,
      heroTitleTop: heroRect ? Math.round(heroRect.top) : null,
      heroMisaligned,
      heroFirstLineVisible:
        !!heroTitle &&
        heroRect.top >= navH - 2 &&
        heroRect.top < window.innerHeight * 0.45,
      bodyHidden: document.body.classList.contains("tva-floating-agent-hidden"),
      floatDisplay: floatStyle?.display ?? null,
      floatVisibility: floatStyle?.visibility ?? null,
      floatReady: floatRoot?.classList.contains("tva-root--ready") ?? false,
      launcherVisible:
        !!launcherRect && launcherRect.width > 20 && launcherRect.height > 20,
      launcherBottomRight:
        !!launcherRect &&
        launcherRect.right > window.innerWidth - 48 &&
        launcherRect.bottom > window.innerHeight - 48,
    };
  }, sectionId);
}

async function setLegacyConflict(page) {
  await page.evaluate((keys) => {
    Object.entries(keys).forEach(([k, v]) => localStorage.setItem(k, v));
  }, LEGACY_CONFLICT);
}

function calcUrl(hash) {
  const root = BASE.replace(/\/$/, "");
  return `${root}/index.html${hash ? `#${hash.replace(/^#/, "")}` : ""}`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "es-CL",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = { baseUrl: BASE, generatedAt: new Date().toISOString(), cases: {} };

  // A. Entrada directa /index.html#calculadora (incógnito simulado)
  await context.clearCookies();
  await page.goto(calcUrl("calculadora"), { waitUntil: "networkidle" });
  await waitForAgent(page);
  await waitForHashScroll(page);
  results.cases.directLoadIndexCalculadora = await auditLanding(page, "calculadora");
  await page.screenshot({
    path: join(OUT, "08-desktop-direct-index-calculadora.png"),
    fullPage: false,
  });
  await page.screenshot({
    path: join(OUT, "08b-desktop-direct-calculadora-float-crop.png"),
    clip: { x: 1060, y: 600, width: 380, height: 300 },
  });

  // B1. Comprar SMS desde header (home)
  await page.goto(BASE, { waitUntil: "networkidle" });
  await waitForAgent(page);
  await page.click("#nav-comprar-sms");
  await waitForHashScroll(page);
  results.cases.comprarSmsFromTop = await auditLanding(page, "calculadora");

  // B2. Comprar SMS desde Contacto
  await page.goto(BASE, { waitUntil: "networkidle" });
  await waitForAgent(page);
  await page.click('a[href="#contacto"]');
  await page.waitForTimeout(800);
  await page.click("#nav-comprar-sms");
  await waitForHashScroll(page);
  results.cases.comprarSmsFromContacto = await auditLanding(page, "calculadora");
  await page.screenshot({
    path: join(OUT, "09-desktop-comprar-sms-from-contacto.png"),
    fullPage: false,
  });

  // C. Refresh con hash #calculadora
  await page.goto(calcUrl("calculadora"), { waitUntil: "networkidle" });
  await waitForAgent(page);
  await waitForHashScroll(page);
  const scrollBeforeHashReload = await page.evaluate(() => Math.round(window.scrollY));
  await page.reload({ waitUntil: "networkidle" });
  await waitForAgent(page);
  await waitForHashScroll(page);
  results.cases.refreshOnCalculadoraHash = {
    scrollBeforeHashReload,
    ...(await auditLanding(page, "calculadora")),
  };
  await page.screenshot({
    path: join(OUT, "10-desktop-refresh-on-calculadora-hash.png"),
    fullPage: false,
  });

  // D. Legacy localStorage + hash calculadora
  await page.goto(calcUrl("calculadora"), { waitUntil: "domcontentloaded" });
  await setLegacyConflict(page);
  await page.reload({ waitUntil: "networkidle" });
  await waitForAgent(page);
  await waitForHashScroll(page);
  results.cases.legacyConflictOnCalculadoraHash = await auditLanding(page, "calculadora");

  // Back/forward entre hashes
  await page.goto(calcUrl("contacto"), { waitUntil: "networkidle" });
  await waitForHashScroll(page);
  const contactAudit = await auditLanding(page, "contacto");
  await page.goBack({ waitUntil: "networkidle" });
  await waitForHashScroll(page);
  const backToCalc = await auditLanding(page, "calculadora");
  await page.goForward({ waitUntil: "networkidle" });
  await waitForHashScroll(page);
  const forwardContacto = await auditLanding(page, "contacto");
  results.cases.hashBackForward = { contactAudit, backToCalc, forwardContacto };

  // Sin hash: refresh desde sección inferior → hero completo
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, 4500));
  await page.waitForTimeout(400);
  const scrollBeforeReload = await page.evaluate(() => Math.round(window.scrollY));
  await page.reload({ waitUntil: "networkidle" });
  await waitForAgent(page);
  results.cases.desktopRefreshFromBottom = {
    scrollBeforeReload,
    ...(await auditLanding(page, "inicio")),
  };
  await page.screenshot({
    path: join(OUT, "03-desktop-1440-after-refresh-from-bottom.png"),
    fullPage: false,
  });

  // Legacy sin hash
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await setLegacyConflict(page);
  await page.reload({ waitUntil: "networkidle" });
  await waitForAgent(page);
  results.cases.desktopLegacyConflictFirstLoad = await auditLanding(page, "inicio");
  await page.screenshot({ path: join(OUT, "01-desktop-1440-hero-full.png"), fullPage: false });
  await page.screenshot({
    path: join(OUT, "02-desktop-1440-float-launcher-crop.png"),
    clip: { x: 1080, y: 620, width: 360, height: 280 },
  });

  // Hash anchors adicionales
  const hashTests = {};
  for (const hash of ["precios", "contacto"]) {
    await page.goto(calcUrl(hash), { waitUntil: "networkidle" });
    await waitForHashScroll(page);
    hashTests[hash] = await auditLanding(page, hash);
  }
  results.cases.hashAnchors = hashTests;

  // Menú interno
  const menuClicks = {};
  const links = [
    { name: "casos-uso", selector: 'a[href="#casos-uso"]' },
    { name: "numeracion", selector: 'a[href="#numeracion"]' },
    { name: "api", selector: 'a[href="#api"]' },
    { name: "contacto", selector: 'a[href="#contacto"]' },
  ];
  for (const link of links) {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click(link.selector, { timeout: 10000 });
    await page.waitForTimeout(600);
    menuClicks[link.name] = await auditLanding(page, link.name);
  }
  results.cases.menuClicks = menuClicks;

  // Agente flotante abierto en #calculadora
  await page.goto(calcUrl("calculadora"), { waitUntil: "networkidle" });
  await waitForAgent(page);
  await waitForHashScroll(page);
  await page.click(".tva-launcher");
  await page.waitForTimeout(600);
  results.cases.agentOpenOnCalculadoraHash = await auditLanding(page, "calculadora");
  await page.screenshot({
    path: join(OUT, "04-desktop-1440-agent-panel-open.png"),
    fullPage: false,
  });

  // Mobile 390 + #calculadora (contexto limpio)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-CL",
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(calcUrl("calculadora"), { waitUntil: "networkidle" });
  await waitForAgent(mobilePage);
  await waitForHashScroll(mobilePage);
  await mobilePage.waitForFunction(
    () => {
      const launcher = document.querySelector("#telvoice-web-agent .tva-launcher");
      const rect = launcher?.getBoundingClientRect();
      return !!rect && rect.width > 20 && rect.height > 20;
    },
    { timeout: 15000 },
  );
  results.cases.mobileCalculadoraHash = await auditLanding(mobilePage, "calculadora");
  await mobilePage.screenshot({
    path: join(OUT, "06-mobile-390-float-visible.png"),
    fullPage: false,
  });
  await mobilePage.screenshot({
    path: join(OUT, "07-mobile-390-float-crop.png"),
    clip: { x: 210, y: 670, width: 180, height: 174 },
  });
  await mobileContext.close();

  results.consoleErrors = [...new Set(errors)];
  results.pass = {
    directLoadCalculadora:
      results.cases.directLoadIndexCalculadora.sectionInView &&
      !results.cases.directLoadIndexCalculadora.heroMisaligned &&
      results.cases.directLoadIndexCalculadora.launcherVisible,
    comprarSmsFromTop:
      results.cases.comprarSmsFromTop.sectionInView &&
      !results.cases.comprarSmsFromTop.heroMisaligned &&
      results.cases.comprarSmsFromTop.hash === "#calculadora",
    comprarSmsFromContacto:
      results.cases.comprarSmsFromContacto.sectionInView &&
      !results.cases.comprarSmsFromContacto.heroMisaligned,
    refreshOnCalculadoraHash:
      results.cases.refreshOnCalculadoraHash.sectionInView &&
      !results.cases.refreshOnCalculadoraHash.heroMisaligned &&
      results.cases.refreshOnCalculadoraHash.hash === "#calculadora",
    legacyOnCalculadoraHash:
      results.cases.legacyConflictOnCalculadoraHash.sectionInView &&
      results.cases.legacyConflictOnCalculadoraHash.launcherVisible &&
      !results.cases.legacyConflictOnCalculadoraHash.bodyHidden,
    hashBackForward:
      results.cases.hashBackForward.backToCalc.sectionInView &&
      results.cases.hashBackForward.forwardContacto.sectionInView,
    heroTitleCompleteOnReload:
      results.cases.desktopRefreshFromBottom.scrollY <= 5 &&
      results.cases.desktopRefreshFromBottom.heroFirstLineVisible,
    legacyConflictLauncherVisible:
      results.cases.desktopLegacyConflictFirstLoad.launcherVisible &&
      !results.cases.desktopLegacyConflictFirstLoad.bodyHidden,
    hashPrecios: results.cases.hashAnchors.precios?.sectionInView,
    hashContacto: results.cases.hashAnchors.contacto?.sectionInView,
    menuNavigation: Object.values(results.cases.menuClicks).every((c) => c.sectionInView),
    mobileCalculadoraHash:
      results.cases.mobileCalculadoraHash.sectionInView &&
      !results.cases.mobileCalculadoraHash.heroMisaligned &&
      results.cases.mobileCalculadoraHash.launcherVisible &&
      !results.cases.mobileCalculadoraHash.bodyHidden,
    agentOpenOnCalculadora:
      results.cases.agentOpenOnCalculadoraHash.sectionInView &&
      results.cases.agentOpenOnCalculadoraHash.launcherVisible,
  };
  results.allPass = Object.values(results.pass).every(Boolean);

  await writeFile(join(OUT, "qa-report.json"), JSON.stringify(results, null, 2));
  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  if (!results.allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
