#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "https://www.telvoice.cl/";
const OUT = join(process.cwd(), "qa-evidence/logo-home-navigation");

const CASES = [
  { name: "numeracion", url: `${BASE.replace(/\/$/, "")}/#numeracion` },
  { name: "calculadora-index", url: `${BASE.replace(/\/$/, "")}/index.html#calculadora` },
  { name: "contacto", url: `${BASE.replace(/\/$/, "")}/#contacto` },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = { baseUrl: BASE, generatedAt: new Date().toISOString(), cases: {} };

  for (const testCase of CASES) {
    await page.goto(testCase.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => ({
      href: location.href,
      hash: location.hash,
      scrollY: Math.round(window.scrollY),
    }));
    await page.locator('nav a[data-telvoice-home], nav a[href="https://www.telvoice.cl/"]').first().click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("#telvoice-web-agent.tva-root--ready", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => {
      const hero = document.getElementById("hero-title");
      const heroRect = hero?.getBoundingClientRect();
      const nav = document.querySelector("body > nav");
      const navH = nav ? nav.getBoundingClientRect().height : 0;
      const launcher = document.querySelector("#telvoice-web-agent .tva-launcher");
      const launcherRect = launcher?.getBoundingClientRect();
      return {
        href: location.href,
        hash: location.hash,
        scrollY: Math.round(window.scrollY),
        heroFirstLineVisible:
          !!heroRect && heroRect.top >= navH - 2 && heroRect.top < window.innerHeight * 0.45,
        launcherVisible: !!launcherRect && launcherRect.width > 20,
      };
    });
    await page.screenshot({
      path: join(OUT, `after-logo-${testCase.name}.png`),
      fullPage: false,
    });
    results.cases[testCase.name] = {
      before,
      after,
      pass:
        after.href === "https://www.telvoice.cl/" &&
        after.hash === "" &&
        after.heroFirstLineVisible &&
        after.launcherVisible,
    };
  }

  results.allPass = Object.values(results.cases).every((c) => c.pass);
  await writeFile(join(OUT, "qa-report.json"), JSON.stringify(results, null, 2));
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  if (!results.allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
