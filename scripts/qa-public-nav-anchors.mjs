#!/usr/bin/env node
/**
 * QA — nav público: anchors de landing deben apuntar al home absoluto, no a subpágina+hash.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.QA_BASE_URL || "https://www.telvoice.cl/").replace(/\/?$/, "/");
const LANDING_HOME = "https://www.telvoice.cl/";

const SUBPAGES = [
  { name: "numeracion-sim-desktop", url: `${BASE}numeracion-sim.html`, viewport: { width: 1440, height: 900 } },
  { name: "numeracion-sim-mobile", url: `${BASE}numeracion-sim.html`, viewport: { width: 390, height: 844 } },
  { name: "pago-pendiente", url: `${BASE}pago-pendiente/`, viewport: { width: 1440, height: 900 } },
  { name: "pago-fallido", url: `${BASE}pago-fallido/`, viewport: { width: 1440, height: 900 } },
  { name: "pago-error", url: `${BASE}pago-error/`, viewport: { width: 1440, height: 900 } },
];

const HOME = LANDING_HOME;

const CLICK_CASES = [
  {
    id: "casos-uso",
    linkText: "Casos de uso",
    expect: `${HOME}#casos-uso`,
    sectionId: "casos-uso",
  },
  {
    id: "contacto",
    linkText: "Contacto",
    expect: `${HOME}#contacto`,
    sectionId: "contacto",
  },
  {
    id: "api",
    linkText: "API",
    expect: `${HOME}#api`,
    sectionId: "api",
  },
  {
    id: "comprar-sms",
    linkText: "Comprar SMS",
    expect: `${HOME}#calculadora`,
    sectionId: "calculadora",
    desktopOnly: true,
  },
];

const INVALID_PATTERNS = [
  /numeracion-sim\.html#/,
  /pago-pendiente\/#/,
  /pago-fallido\/#/,
  /pago-error\/#/,
];

function normalizeUrl(url) {
  return url.replace(/index\.html(?=#)/, "");
}

async function readNavHrefs(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("body > nav");
    if (!nav) return [];
    return Array.from(nav.querySelectorAll("a[href]")).map((a) => ({
      text: (a.textContent || "").trim(),
      href: a.getAttribute("href") || "",
    }));
  });
}

async function clickNavLink(page, linkText, viewportWidth) {
  if (linkText === "Comprar SMS" && viewportWidth >= 640) {
    await page.locator("#nav-comprar-sms").click();
    return;
  }
  if (viewportWidth < 1024) {
    const toggle = page.locator("#menu-toggle");
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(400);
    }
    if (linkText === "Comprar SMS") {
      await page.locator("#nav-comprar-sms-mobile").click();
      return;
    }
    await page.locator("#mobile-panel").getByRole("link", { name: linkText, exact: true }).click();
    return;
  }
  await page.locator("nav ul.hidden.lg\\:flex a").filter({ hasText: linkText }).click();
}

async function testSubpage(page, subpage, outDir) {
  await page.setViewportSize(subpage.viewport);
  await page.goto(subpage.url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("body > nav", { timeout: 30000 });
  await page.waitForTimeout(800);

  const hrefAudit = await readNavHrefs(page);
  const hrefResults = hrefAudit.map((item) => {
    const isLandingHash =
      item.href.includes("#casos-uso") ||
      item.href.includes("#contacto") ||
      item.href.includes("#api") ||
      item.href.includes("#calculadora") ||
      item.href.includes("#numeracion");
    const absoluteOk = !isLandingHash || item.href.startsWith("https://www.telvoice.cl/#");
    const invalid = INVALID_PATTERNS.some((re) => re.test(item.href));
    return { ...item, pass: absoluteOk && !invalid };
  });

  const clickResults = [];
  for (const testCase of CLICK_CASES) {
    if (testCase.desktopOnly && subpage.viewport.width < 640) continue;

    await page.goto(subpage.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("body > nav", { timeout: 30000 });
    await page.waitForTimeout(600);

    await clickNavLink(page, testCase.linkText, subpage.viewport.width);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(testCase.id === "comprar-sms" ? 2500 : 1800);

    const landed = normalizeUrl(page.url());
    const sectionVisible = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.85 && rect.bottom > 80;
    }, testCase.sectionId);

    const pass = landed === testCase.expect && sectionVisible && !INVALID_PATTERNS.some((re) => re.test(landed));
    clickResults.push({
      id: testCase.id,
      expect: testCase.expect,
      landed,
      sectionVisible,
      pass,
    });

    await page.screenshot({
      path: join(outDir, `${subpage.name}-${testCase.id}.png`),
      fullPage: false,
    });
  }

  return {
    page: subpage.name,
    url: subpage.url,
    hrefResults,
    clickResults,
    pass:
      hrefResults.every((r) => r.pass) &&
      clickResults.every((r) => r.pass),
  };
}

async function testHome(page, outDir) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1200);

  await page.locator("#nav-comprar-sms").click();
  await page.waitForTimeout(2000);
  const calcUrl = page.url();
  const calcVisible = await page.evaluate(() => {
    const el = document.getElementById("calculadora");
    const rect = el?.getBoundingClientRect();
    return !!rect && rect.top < window.innerHeight * 0.9;
  });

  await page.goto(`${BASE}#contacto`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.locator('nav a[data-telvoice-home], nav a[href="https://www.telvoice.cl/"]').first().click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
  const logoUrl = page.url();

  await page.screenshot({ path: join(outDir, "home-logo-clean.png"), fullPage: false });

  return {
    page: "home-desktop",
    calculadora: { url: calcUrl, visible: calcVisible, pass: calcUrl.includes("#calculadora") && calcVisible },
    logo: { url: logoUrl, pass: logoUrl === HOME || logoUrl === "https://www.telvoice.cl/" },
    pass:
      calcUrl.includes("#calculadora") &&
      calcVisible &&
      (logoUrl === HOME || logoUrl === "https://www.telvoice.cl/"),
  };
}

async function main() {
  const outDir = join(process.cwd(), "qa-evidence/public-nav-anchors");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const subpageResults = [];
  for (const subpage of SUBPAGES) {
    subpageResults.push(await testSubpage(page, subpage, outDir));
  }

  const homeResult = await testHome(page, outDir);
  await browser.close();

  const allResults = [...subpageResults, homeResult];
  const report = {
    baseUrl: BASE,
    generatedAt: new Date().toISOString(),
    allPass: allResults.every((r) => r.pass),
    total: allResults.length,
    passed: allResults.filter((r) => r.pass).length,
    failed: allResults.filter((r) => !r.pass),
    results: allResults,
  };

  await writeFile(join(outDir, "qa-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
