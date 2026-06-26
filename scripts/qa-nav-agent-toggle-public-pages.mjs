#!/usr/bin/env node
/**
 * QA producción — botón avatar del agente en todas las páginas públicas.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.QA_BASE_URL || "https://www.telvoice.cl/").replace(/\/?$/, "/");
const OUT = join(process.cwd(), "qa-evidence/nav-agent-toggle-public");

async function waitForAgent(page) {
  await page.waitForSelector("#telvoice-web-agent", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2200);
}

async function auditPage(page) {
  return page.evaluate(() => {
    const toggles = document.querySelectorAll("#nav-floating-agent-toggle");
    const navToggle = toggles[0] || null;
    const comprar = document.getElementById("nav-comprar-sms");
    const comprarRect = comprar?.getBoundingClientRect();
    const toggleRect = navToggle?.getBoundingClientRect();
    const floatRoot = document.getElementById("telvoice-web-agent");
    const floatStyle = floatRoot ? getComputedStyle(floatRoot) : null;
    const floatVisible =
      !!floatRoot &&
      floatStyle?.display !== "none" &&
      floatStyle?.visibility !== "hidden" &&
      !document.body.classList.contains("tva-floating-agent-hidden") &&
      !document.body.classList.contains("tva-floating-agent-minimized");
    const avatar = navToggle?.querySelector(".nav-floating-agent-toggle__avatar");
    const avatarStyle = avatar ? getComputedStyle(avatar) : null;
    return {
      url: location.href,
      toggleCount: toggles.length,
      togglePresent: toggles.length === 1,
      toggleBeforeComprar:
        !!navToggle &&
        !!comprar &&
        toggleRect &&
        comprarRect &&
        toggleRect.right <= comprarRect.left + 2,
      toggleLive: navToggle?.classList.contains("is-agent-live") ?? false,
      toggleDormant: navToggle?.classList.contains("is-agent-dormant") ?? false,
      toggleLabel: navToggle?.getAttribute("aria-label") ?? null,
      hasDataAttr: navToggle?.getAttribute("data-floating-agent-toggle") === "1",
      avatarOpacity: avatarStyle ? parseFloat(avatarStyle.opacity) : null,
      floatVisible,
      state: localStorage.getItem("telvoice:floating-agent-state:public"),
    };
  });
}

async function shot(page, name, clip) {
  const path = join(OUT, name);
  if (clip) await page.screenshot({ path, clip });
  else await page.screenshot({ path, fullPage: false });
  return path;
}

async function runCase(page, { name, url, viewport, headerClip, hideRestore }) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("telvoice:floating-agent-state:public", "open");
    localStorage.setItem("telvoice:floating-agent-visible", "true");
  });
  await page.reload({ waitUntil: "networkidle" });
  await waitForAgent(page);

  const visible = await auditPage(page);
  await shot(page, `${name}-visible.png`, headerClip);

  let hidden = null;
  let restored = null;
  if (hideRestore) {
    await page.locator("#nav-floating-agent-toggle").click();
    await page.waitForTimeout(1300);
    hidden = await auditPage(page);
    await shot(page, `${name}-hidden.png`, headerClip);

    await page.locator("#nav-floating-agent-toggle").click();
    await page.waitForTimeout(1800);
    restored = await auditPage(page);
    await shot(page, `${name}-restored.png`, headerClip);
  }

  return { visible, hidden, restored };
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

  const desktopHeader = { x: 860, y: 0, width: 580, height: 88 };
  const mobileHeader = { x: 0, y: 0, width: 390, height: 72 };

  const homeDesktop = await runCase(page, {
    name: "01-home-desktop",
    url: BASE,
    viewport: { width: 1440, height: 900 },
    headerClip: desktopHeader,
    hideRestore: false,
  });

  const homeMobile = await runCase(page, {
    name: "02-home-mobile",
    url: BASE,
    viewport: { width: 390, height: 844 },
    headerClip: mobileHeader,
    hideRestore: false,
  });

  const numeracionHash = await runCase(page, {
    name: "03-numeracion-hash-desktop",
    url: `${BASE}#numeracion`,
    viewport: { width: 1440, height: 900 },
    headerClip: desktopHeader,
    hideRestore: false,
  });

  const simDesktop = await runCase(page, {
    name: "04-numeracion-sim-desktop",
    url: `${BASE}numeracion-sim.html`,
    viewport: { width: 1440, height: 900 },
    headerClip: desktopHeader,
    hideRestore: true,
  });

  const simMobile = await runCase(page, {
    name: "05-numeracion-sim-mobile",
    url: `${BASE}numeracion-sim.html`,
    viewport: { width: 390, height: 844 },
    headerClip: mobileHeader,
    hideRestore: false,
  });

  const subpage = await runCase(page, {
    name: "06-pago-pendiente-desktop",
    url: `${BASE}pago-pendiente/`,
    viewport: { width: 1440, height: 900 },
    headerClip: desktopHeader,
    hideRestore: false,
  });

  await browser.close();

  const checks = [
    homeDesktop.visible,
    homeMobile.visible,
    numeracionHash.visible,
    simDesktop.visible,
    simDesktop.hidden,
    simDesktop.restored,
    simMobile.visible,
    subpage.visible,
  ];

  const allPass = checks.every(
    (c) =>
      c &&
      c.toggleCount === 1 &&
      c.togglePresent &&
      c.toggleBeforeComprar &&
      c.hasDataAttr,
  );

  const report = {
    baseUrl: BASE,
    generatedAt: new Date().toISOString(),
    allPass,
    homeDesktop,
    homeMobile,
    numeracionHash,
    simDesktop,
    simMobile,
    subpage,
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
