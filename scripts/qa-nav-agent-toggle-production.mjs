#!/usr/bin/env node
/**
 * QA producción — botón avatar nav ocultar/mostrar agente flotante.
 * Capturas en qa-evidence/nav-agent-toggle/
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "https://www.telvoice.cl/";
const OUT = join(process.cwd(), "qa-evidence/nav-agent-toggle");

async function waitForAgent(page) {
  await page.waitForSelector("#telvoice-web-agent", { timeout: 45000 });
  await page.waitForTimeout(2500);
}

async function shot(page, name, clip) {
  const path = join(OUT, name);
  if (clip) {
    await page.screenshot({ path, clip });
  } else {
    await page.screenshot({ path, fullPage: false });
  }
  return path;
}

async function auditNavToggle(page) {
  return page.evaluate(() => {
    const navToggle = document.getElementById("nav-floating-agent-toggle");
    const chip = document.getElementById("tva-floating-agent-restore");
    const floatRoot = document.getElementById("telvoice-web-agent");
    const avatar = navToggle?.querySelector(".nav-floating-agent-toggle__avatar");
    const avatarStyle = avatar ? getComputedStyle(avatar) : null;
    const floatRect = floatRoot?.getBoundingClientRect();
    const floatStyle = floatRoot ? getComputedStyle(floatRoot) : null;
    const floatVisible =
      !!floatRect &&
      floatRect.width > 0 &&
      floatStyle?.display !== "none" &&
      floatStyle?.visibility !== "hidden" &&
      !document.body.classList.contains("tva-floating-agent-hidden") &&
      !document.body.classList.contains("tva-floating-agent-minimized");
    const chipHidden = chip ? chip.hidden : true;
    const chipRect = chip && !chipHidden ? chip.getBoundingClientRect() : null;
    const chipClickable =
      !!chipRect &&
      chipRect.width > 0 &&
      chipRect.height > 0 &&
      getComputedStyle(chip).visibility !== "hidden";
    const invisibleHitbox =
      floatRoot &&
      !floatVisible &&
      floatRect &&
      floatRect.width > 0 &&
      floatStyle?.pointerEvents !== "none" &&
      floatStyle?.visibility !== "hidden";
    return {
      navTogglePresent: !!navToggle,
      navToggleLive: navToggle?.classList.contains("is-agent-live") ?? false,
      navToggleDormant: navToggle?.classList.contains("is-agent-dormant") ?? false,
      navToggleMinimized: navToggle?.classList.contains("is-agent-minimized") ?? false,
      navToggleLabel: navToggle?.getAttribute("aria-label") ?? null,
      avatarGrayscale: avatarStyle
        ? parseFloat(avatarStyle.opacity) < 0.6 || parseFloat(avatarStyle.filter?.includes("saturate") ? "0.65" : "1") <= 0.7
        : null,
      avatarOpacity: avatarStyle ? parseFloat(avatarStyle.opacity) : null,
      floatVisible,
      chipHidden,
      chipClickable,
      invisibleHitbox: !!invisibleHitbox,
      state: localStorage.getItem("telvoice:floating-agent-state:public"),
      legacy: localStorage.getItem("telvoice:floating-agent-visible"),
      hash: window.location.hash,
      calcSectionTop: document.getElementById("calculadora")?.getBoundingClientRect().top ?? null,
    };
  });
}

async function runDesktopNavFlow(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
  await waitForAgent(page);

  const s1 = await auditNavToggle(page);
  await shot(page, "01-desktop-header-agent-live-gray.png", { x: 900, y: 0, width: 540, height: 88 });
  await shot(page, "01b-desktop-full-agent-visible.png");

  await page.locator("#nav-floating-agent-toggle").click();
  await page.waitForTimeout(1400);

  const s2 = await auditNavToggle(page);
  await shot(page, "02-desktop-header-agent-dormant-color.png", { x: 900, y: 0, width: 540, height: 88 });
  await shot(page, "02b-desktop-agent-hidden-nav-only.png");

  await page.locator("#nav-floating-agent-toggle").click();
  await page.waitForTimeout(2000);

  const s3 = await auditNavToggle(page);
  await shot(page, "03-desktop-agent-restored.png");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const s4 = await auditNavToggle(page);
  await shot(page, "04-desktop-persist-after-reload.png");

  return { s1, s2, s3, s4 };
}

async function runMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
  await waitForAgent(page);

  const m1 = await auditNavToggle(page);
  await shot(page, "05-mobile-header-toggle-visible.png", { x: 0, y: 0, width: 390, height: 72 });

  await page.locator("#nav-floating-agent-toggle").click();
  await page.waitForTimeout(1200);
  const m2 = await auditNavToggle(page);
  await shot(page, "06-mobile-agent-hidden.png", { x: 0, y: 0, width: 390, height: 72 });

  await page.locator("#nav-floating-agent-toggle").click();
  await page.waitForTimeout(1500);
  const m3 = await auditNavToggle(page);

  return { m1, m2, m3 };
}

async function runHashCalculadora(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE.replace(/\/?$/, "/")}index.html#calculadora`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const calc = await page.evaluate(() => {
    const el = document.getElementById("calculadora");
    const rect = el?.getBoundingClientRect();
    return {
      hash: window.location.hash,
      scrollY: Math.round(window.scrollY),
      calcTop: rect ? Math.round(rect.top) : null,
      navTogglePresent: !!document.getElementById("nav-floating-agent-toggle"),
    };
  });
  await shot(page, "07-calculadora-hash.png");
  return calc;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const desktop = await runDesktopNavFlow(page);
  const mobile = await runMobile(page);
  const calculadora = await runHashCalculadora(page);
  await browser.close();

  const allPass =
    desktop.s1.navTogglePresent &&
    desktop.s1.navToggleLive &&
    desktop.s1.floatVisible &&
    desktop.s2.navToggleDormant &&
    !desktop.s2.floatVisible &&
    desktop.s2.chipHidden &&
    !desktop.s2.invisibleHitbox &&
    desktop.s3.navToggleLive &&
    desktop.s3.floatVisible &&
    mobile.m1.navTogglePresent &&
    mobile.m2.navToggleDormant &&
    mobile.m3.floatVisible &&
    calculadora.hash === "#calculadora" &&
    calculadora.navTogglePresent &&
    (calculadora.calcTop === null || calculadora.calcTop < 120);

  const report = {
    baseUrl: BASE,
    generatedAt: new Date().toISOString(),
    allPass,
    desktop,
    mobile,
    calculadora,
    consoleErrors: [...new Set(errors)],
  };

  await writeFile(join(OUT, "qa-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
