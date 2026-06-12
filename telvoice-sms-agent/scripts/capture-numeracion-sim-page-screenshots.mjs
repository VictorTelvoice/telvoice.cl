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

const INDEX = process.env.LANDING_INDEX_URL || "http://127.0.0.1:8088/index.html";
const PAGE = process.env.LANDING_NUMERACION_URL || "http://127.0.0.1:8088/numeracion-sim.html?demo_numeracion=1";

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();

await page.goto(INDEX, { waitUntil: "networkidle" });
await page.locator("#nav-precios-toggle").click();
await page.waitForTimeout(250);
await page.screenshot({ path: join(OUT, "01-menu-precios-dropdown.png") });

await page.goto(PAGE, { waitUntil: "networkidle" });
await page.waitForSelector("#nsim-hero-title", { timeout: 15000 });
await page.screenshot({ path: join(OUT, "02-numeracion-sim-hero.png") });

await page.locator("#nsim-planes").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "03-numeracion-sim-planes.png") });

await page.locator('.nsim-plan-card[data-nsim-plan="sim_starter"]').click();
await page.fill("#nsim-nombre", "Demo Telvoice");
await page.fill("#nsim-email", "demo@telvoice.net");
await page.fill("#nsim-empresa", "Telvoice Demo SpA");
await page.fill("#nsim-telefono", "+56900000000");
await page.fill("#nsim-rut", "76.000.000-0");
await page.fill("#nsim-use-case", "Validación visual del checkout de numeración SIM.");
await page.locator("#nsim-checkout").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "04-numeracion-sim-formulario.png") });

await page.locator("#nsim-submit").click();
await page.waitForSelector("#nsim-demo-modal", { timeout: 5000 });
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "05-numeracion-sim-modal-demo.png") });

const mobile = await browser.newContext({ ...devices["iPhone 13"] });
const mpage = await mobile.newPage();
await mpage.goto(PAGE, { waitUntil: "networkidle" });
await mpage.waitForSelector("#nsim-hero-title", { timeout: 15000 });
await mpage.screenshot({ path: join(OUT, "06-numeracion-sim-mobile.png"), fullPage: true });

await browser.close();
console.log("OK:", OUT);
