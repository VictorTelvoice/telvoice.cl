#!/usr/bin/env node
/**
 * QA producción — consistencia botón nav vs agente flotante real.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.QA_BASE_URL || "https://www.telvoice.cl/").replace(/\/?$/, "/");
const OUT = join(process.cwd(), "qa-evidence/nav-agent-toggle-sync");

function auditConsistencyScript() {
  return () => {
    const navToggle = document.getElementById("nav-floating-agent-toggle");
    const avatar = navToggle?.querySelector(".nav-floating-agent-toggle__avatar");
    const avatarStyle = avatar ? getComputedStyle(avatar) : null;
    const navGray = !!navToggle?.classList.contains("is-agent-live");
    const navColor = !!navToggle?.classList.contains("is-agent-dormant");

    const chip = document.getElementById("tva-floating-agent-restore");
    const chipRect = chip && !chip.hidden ? chip.getBoundingClientRect() : null;
    const chipVisible =
      !!chipRect &&
      chipRect.width > 20 &&
      chipRect.height > 20 &&
      getComputedStyle(chip).visibility !== "hidden";

    const floatRoot = document.getElementById("telvoice-web-agent");
    const floatStyle = floatRoot ? getComputedStyle(floatRoot) : null;
    const bodyHiding =
      document.body.classList.contains("tva-floating-agent-hidden") ||
      document.body.classList.contains("tva-floating-agent-minimized") ||
      document.documentElement.classList.contains("tva-floating-agent-prehidden");

    const launcher = floatRoot?.querySelector(".tva-launcher");
    const launcherRect = launcher?.getBoundingClientRect();
    const panel = floatRoot?.querySelector(".tva-panel.is-open");
    const panelRect = panel?.getBoundingClientRect();

    const launcherVisible =
      !bodyHiding &&
      !!launcherRect &&
      launcherRect.width > 20 &&
      launcherRect.height > 20 &&
      floatStyle?.display !== "none" &&
      floatStyle?.visibility !== "hidden";

    const panelVisible =
      !bodyHiding &&
      !!panelRect &&
      panelRect.height > 80 &&
      getComputedStyle(panel).visibility !== "hidden";

    const agentActive = chipVisible || launcherVisible || panelVisible;
    const consistent =
      (agentActive && navGray && !navColor) || (!agentActive && navColor && !navGray);

    return {
      url: location.href,
      toggleCount: document.querySelectorAll("#nav-floating-agent-toggle").length,
      navGray,
      navColor,
      avatarOpacity: avatarStyle ? parseFloat(avatarStyle.opacity) : null,
      agentActive,
      chipVisible,
      launcherVisible,
      panelVisible,
      bodyHiding,
      consistent,
      stored: localStorage.getItem("telvoice:floating-agent-state:public"),
    };
  };
}

async function waitForAgent(page) {
  await page.waitForSelector("#telvoice-web-agent.tva-root--ready", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function shot(page, name, clip) {
  const path = join(OUT, name);
  if (clip) await page.screenshot({ path, clip });
  else await page.screenshot({ path, fullPage: false });
  return path;
}

async function resetOpen(page) {
  await page.evaluate(() => {
    localStorage.setItem("telvoice:floating-agent-state:public", "open");
    localStorage.setItem("telvoice:floating-agent-visible", "true");
  });
}

async function runScenario(page, { name, url, viewport, clip, steps }) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await resetOpen(page);
  await page.reload({ waitUntil: "networkidle" });
  await waitForAgent(page);

  const results = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.action === "clickNav") {
      await page.locator("#nav-floating-agent-toggle").click();
      await page.waitForTimeout(step.wait || 1400);
    } else if (step.action === "clickLauncher") {
      await page.locator("#telvoice-web-agent .tva-launcher").click();
      await page.waitForTimeout(step.wait || 900);
    } else if (step.action === "minimize") {
      await page.evaluate(() => {
        document.dispatchEvent(
          new CustomEvent("telvoice:agent-chrome", { detail: { action: "minimize" } }),
        );
      });
      await page.waitForTimeout(step.wait || 1200);
    } else if (step.action === "reload") {
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(step.wait || 1800);
    } else if (step.action === "setStorage") {
      await page.evaluate((state) => {
        localStorage.setItem("telvoice:floating-agent-state:public", state);
        localStorage.setItem("telvoice:floating-agent-visible", state === "open" ? "true" : "false");
      }, step.state);
      await page.reload({ waitUntil: "networkidle" });
      if (step.state === "hidden") {
        await page.waitForFunction(
          () => document.getElementById("nav-floating-agent-toggle")?.classList.contains("is-agent-dormant"),
          { timeout: 30000 },
        );
      } else if (step.state === "minimized") {
        await page.waitForSelector("#tva-floating-agent-restore:not([hidden])", { timeout: 15000 }).catch(() => {});
      } else {
        await waitForAgent(page);
      }
      await page.waitForTimeout(step.wait || 1200);
    }

    const audit = await page.evaluate(auditConsistencyScript());
    audit.step = step.label;
    audit.expect = step.expect;
    audit.pass =
      audit.consistent &&
      audit.toggleCount === 1 &&
      (step.expect.agentActive == null || audit.agentActive === step.expect.agentActive) &&
      (step.expect.navGray == null || audit.navGray === step.expect.navGray) &&
      (step.expect.navColor == null || audit.navColor === step.expect.navColor) &&
      (step.expect.stored == null || audit.stored === step.expect.stored);

    if (step.shot) {
      await shot(page, `${name}-${step.shot}.png`, clip);
    }
    results.push(audit);
  }
  return results;
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

  const desktopClip = { x: 860, y: 0, width: 580, height: 88 };
  const mobileClip = { x: 0, y: 0, width: 390, height: 72 };

  const homeInitial = await runScenario(page, {
    name: "01-home",
    url: BASE,
    viewport: { width: 1440, height: 900 },
    clip: desktopClip,
    steps: [
      {
        label: "initial-open",
        expect: { agentActive: true, navGray: true, navColor: false },
        shot: "visible-gray",
      },
      {
        label: "hide",
        action: "clickNav",
        expect: { agentActive: false, navGray: false, navColor: true, stored: "hidden" },
        shot: "hidden-color",
      },
      {
        label: "restore",
        action: "clickNav",
        expect: { agentActive: true, navGray: true, navColor: false, stored: "open" },
        shot: "restored-gray",
      },
      {
        label: "panel-open",
        action: "clickLauncher",
        expect: { agentActive: true, navGray: true, navColor: false },
        shot: "panel-open-gray",
      },
      {
        label: "minimized",
        action: "minimize",
        expect: { agentActive: true, navGray: true, navColor: false, stored: "minimized" },
        shot: "minimized-gray",
      },
    ],
  });

  const refreshOpen = await runScenario(page, {
    name: "02-refresh-open",
    url: BASE,
    viewport: { width: 1440, height: 900 },
    clip: desktopClip,
    steps: [
      {
        label: "set-open-reload",
        action: "setStorage",
        state: "open",
        expect: { agentActive: true, navGray: true, navColor: false, stored: "open" },
      },
    ],
  });

  const refreshHidden = await runScenario(page, {
    name: "03-refresh-hidden",
    url: BASE,
    viewport: { width: 1440, height: 900 },
    clip: desktopClip,
    steps: [
      {
        label: "set-hidden-reload",
        action: "setStorage",
        state: "hidden",
        expect: { agentActive: false, navGray: false, navColor: true, stored: "hidden" },
        shot: "refresh-hidden-color",
      },
    ],
  });

  const refreshMinimized = await runScenario(page, {
    name: "04-refresh-minimized",
    url: BASE,
    viewport: { width: 1440, height: 900 },
    clip: desktopClip,
    steps: [
      {
        label: "set-minimized-reload",
        action: "setStorage",
        state: "minimized",
        expect: { agentActive: true, navGray: true, navColor: false, stored: "minimized" },
        shot: "refresh-minimized-gray",
      },
    ],
  });

  const numeracionHash = await runScenario(page, {
    name: "05-numeracion-hash",
    url: `${BASE}#numeracion`,
    viewport: { width: 1440, height: 900 },
    clip: desktopClip,
    steps: [
      {
        label: "hash-open",
        expect: { agentActive: true, navGray: true, navColor: false },
      },
    ],
  });

  const calculadoraHash = await runScenario(page, {
    name: "06-calculadora-hash",
    url: `${BASE}index.html#calculadora`,
    viewport: { width: 1440, height: 900 },
    clip: desktopClip,
    steps: [
      {
        label: "calculadora-open",
        expect: { agentActive: true, navGray: true, navColor: false },
      },
    ],
  });

  const simDesktop = await runScenario(page, {
    name: "07-numeracion-sim-desktop",
    url: `${BASE}numeracion-sim.html`,
    viewport: { width: 1440, height: 900 },
    clip: desktopClip,
    steps: [
      {
        label: "sim-open",
        expect: { agentActive: true, navGray: true, navColor: false },
        shot: "sim-visible-gray",
      },
      {
        label: "sim-hide",
        action: "clickNav",
        expect: { agentActive: false, navGray: false, navColor: true },
        shot: "sim-hidden-color",
      },
      {
        label: "sim-restore",
        action: "clickNav",
        expect: { agentActive: true, navGray: true, navColor: false },
      },
    ],
  });

  const simMobile = await runScenario(page, {
    name: "08-numeracion-sim-mobile",
    url: `${BASE}numeracion-sim.html`,
    viewport: { width: 390, height: 844 },
    clip: mobileClip,
    steps: [
      {
        label: "sim-mobile-open",
        expect: { agentActive: true, navGray: true, navColor: false },
        shot: "sim-mobile-gray",
      },
    ],
  });

  await browser.close();

  const allResults = [
    ...homeInitial,
    ...refreshOpen,
    ...refreshHidden,
    ...refreshMinimized,
    ...numeracionHash,
    ...calculadoraHash,
    ...simDesktop,
    ...simMobile,
  ];
  const allPass = allResults.every((r) => r.pass);

  const report = {
    baseUrl: BASE,
    generatedAt: new Date().toISOString(),
    allPass,
    total: allResults.length,
    passed: allResults.filter((r) => r.pass).length,
    failed: allResults.filter((r) => !r.pass),
    scenarios: {
      homeInitial,
      refreshOpen,
      refreshHidden,
      refreshMinimized,
      numeracionHash,
      calculadoraHash,
      simDesktop,
      simMobile,
    },
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
