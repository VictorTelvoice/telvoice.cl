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
await page.waitForSelector("#nsim-planes", { timeout: 15000 });
await page.locator("#nsim-planes").scrollIntoViewIfNeeded();
await page.screenshot({ path: join(OUT, "01-planes-v3-pro-simplificado.png") });

await page.locator('.nsim-plan-cta[data-nsim-plan="sim_starter"]').click();
await page.waitForSelector("#nsim-checkout-drawer.is-open", { timeout: 5000 });
await page.waitForTimeout(350);
await page.screenshot({ path: join(OUT, "02-checkout-desplegable-starter.png") });

await page.locator('.nsim-plan-cta[data-nsim-plan="sim_pro"]').click();
await page.waitForTimeout(350);
await page.screenshot({ path: join(OUT, "03-checkout-desplegable-pro.png") });

await page.locator('.nsim-plan-cta[data-nsim-plan="custom"]').click();
await page.waitForTimeout(350);
await page.screenshot({ path: join(OUT, "04-checkout-desplegable-medida.png") });

await page.locator("#nsim-drawer-close").click();
await page.waitForTimeout(200);
await page.locator("#nsim-panel-api").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "05-panel-api-v3.png") });

const mobile = await browser.newContext({ ...devices["iPhone 13"] });
const mpage = await mobile.newPage();
await mpage.goto(PAGE, { waitUntil: "networkidle" });
await mpage.locator('.nsim-plan-cta[data-nsim-plan="sim_starter"]').click();
await mpage.waitForSelector("#nsim-checkout-drawer.is-open", { timeout: 5000 });
await mpage.waitForTimeout(300);
await mpage.screenshot({ path: join(OUT, "06-mobile-checkout-desplegable.png"), fullPage: true });

await browser.close();
console.log("OK:", OUT);
