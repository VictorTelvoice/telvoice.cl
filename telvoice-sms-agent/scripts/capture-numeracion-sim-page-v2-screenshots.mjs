#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../qa/local-numeracion-sim-page",
);
mkdirSync(OUT, { recursive: true });

const PAGE =
  process.env.LANDING_NUMERACION_URL ||
  "http://127.0.0.1:8088/numeracion-sim.html?demo_numeracion=1";

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();

await page.goto(PAGE, { waitUntil: "networkidle" });
await page.waitForSelector("#nsim-hero-title", { timeout: 15000 });
await page.screenshot({ path: join(OUT, "01-numeracion-sim-hero-v2.png") });

await page.locator("#nsim-planes").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "02-planes-starter-pro-medida.png") });

await page.locator('.nsim-plan-card[data-nsim-plan="sim_pro"]').click();
await page.waitForTimeout(250);
await page.locator("#nsim-planes").scrollIntoViewIfNeeded();
await page.screenshot({ path: join(OUT, "03-plan-pro-telegram-automatizaciones.png") });

await page.locator("#nsim-panel-api").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "04-panel-api-section.png") });

await page.locator('.nsim-plan-card[data-nsim-plan="custom"]').click();
await page.fill("#nsim-nombre", "Demo Telvoice");
await page.fill("#nsim-email", "demo@telvoice.net");
await page.fill("#nsim-use-case", "Múltiples números y automatizaciones avanzadas.");
await page.locator("#nsim-checkout").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "05-formulario-medida.png") });

await page.locator("#nsim-submit").click();
await page.waitForSelector("#nsim-demo-modal", { timeout: 5000 });
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "06-modal-demo-medida.png") });

const mobile = await browser.newContext({ ...devices["iPhone 13"] });
const mpage = await mobile.newPage();
await mpage.goto(PAGE, { waitUntil: "networkidle" });
await mpage.waitForSelector("#nsim-hero-title", { timeout: 15000 });
await mpage.screenshot({ path: join(OUT, "07-mobile-v2.png"), fullPage: true });

await browser.close();
console.log("OK:", OUT);
