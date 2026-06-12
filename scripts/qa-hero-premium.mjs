/**
 * QA visual hero premium — capturas + checks básicos (local).
 * Uso: node scripts/qa-hero-premium.mjs [baseUrl]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const OUT = join(process.cwd(), "preview/hero-premium-qa");

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(BASE + "/index.html", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2500);

    const hero = page.locator("#inicio");
    await hero.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const shot = join(OUT, `hero-${vp.name}.png`);
    await hero.screenshot({ path: shot });
    results.push({ viewport: vp.name, screenshot: shot });

    if (vp.name === "desktop-1440") {
      const fullShot = join(OUT, "page-desktop-1440-full.png");
      await page.screenshot({ path: fullShot, fullPage: false });
    }

    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const checks = {};

  checks.titleVisible = await page.locator(".tv-hero-title").isVisible();
  checks.subtitleVisible = await page.locator(".tv-hero-subtitle").isVisible();
  checks.primaryCta = (await page.locator(".hero-cta-primary").textContent()).trim();
  checks.secondaryCta = (await page.locator("#hero-cta-agent").textContent()).trim();

  const primaryStyles = await page.locator(".hero-cta-primary").evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      bg: s.backgroundColor,
      fontWeight: s.fontWeight,
      padding: s.padding,
    };
  });
  const secondaryStyles = await page.locator("#hero-cta-agent").evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      bg: s.backgroundColor,
      border: s.border,
      color: s.color,
    };
  });
  checks.primaryDominant = primaryStyles.bg.includes("11, 92, 255") || primaryStyles.bg.includes("rgb(11, 92, 255)");
  checks.secondaryIsOutline = secondaryStyles.bg.includes("255, 255, 255") || secondaryStyles.bg === "rgba(0, 0, 0, 0)";

  checks.sections = {};
  for (const id of ["calculadora", "casos-uso", "api", "contacto"]) {
    const el = page.locator(`#${id}`);
    checks.sections[id] = (await el.count()) > 0 && (await el.isVisible()) === false;
    await el.scrollIntoViewIfNeeded();
    checks.sections[id + "_visible"] = await el.isVisible();
  }

  const helpLink = page.locator('a[href="ayuda/"]');
  checks.helpLink = (await helpLink.count()) > 0;

  await page.locator(".hero-cta-primary").click();
  await page.waitForTimeout(800);
  const calcInView = await page.evaluate(() => {
    const el = document.getElementById("calculadora");
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight * 0.4 && r.bottom > 0;
  });
  checks.comprarSmsScroll = calcInView;

  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.locator("#hero-cta-agent").click();
  await page.waitForTimeout(1000);
  checks.agentPanelOrEmbed =
    (await page.locator("#hero-agent-embed .tva-panel--inline").count()) > 0 ||
    (await page.locator("#telvoice-web-agent .tva-panel.is-open").count()) > 0;

  await page.locator("#nav-precios-toggle").click();
  await page.waitForTimeout(300);
  checks.preciosMenu = !(await page.locator("#nav-precios-menu").getAttribute("hidden"));

  await page.locator("#nav-demo").click();
  await page.waitForTimeout(800);
  checks.navAgentClick = true;

  const float = page.locator("#telvoice-web-agent");
  const floatVisible = await float.isVisible().catch(() => false);
  checks.floatVisibleOnHero = floatVisible;
  if (floatVisible) {
    checks.floatVsHero = await page.evaluate(() => {
      const f = document.getElementById("telvoice-web-agent");
      const h = document.getElementById("inicio");
      if (!f || !h) return null;
      const fr = f.getBoundingClientRect();
      const hr = h.getBoundingClientRect();
      return {
        floatArea: fr.width * fr.height,
        heroArea: hr.width * hr.height,
        floatBottomRight: fr.x > hr.width * 0.55,
      };
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  checks.mobileHeroTitle = await page.locator(".tv-hero-title").isVisible();
  checks.mobilePhone = await page.locator(".hero-phone-float--agent").isVisible();

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    viewports: results,
    checks,
    primaryStyles,
    secondaryStyles,
  };

  await writeFile(join(OUT, "qa-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
