/**
 * QA read-only del landing telvoice.cl (scroll, hero, agentes, CTAs).
 * No modifica producción, build ni runtime — solo lectura vía Playwright.
 *
 * Uso: ver preview/hero-premium-qa/README.md
 */
import { chromium, devices } from "playwright-core";
import { writeFileSync, mkdirSync } from "fs";

const URL = process.env.QA_BASE_URL || "https://www.telvoice.cl/";
const OUT =
  process.env.QA_OUT_DIR ||
  "qa-reports/scroll-browser-" + new Date().toISOString().slice(0, 10);
mkdirSync(OUT, { recursive: true });

function assertChecks(label, checks) {
  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  return { label, checks, passed: failed.length === 0, failed: failed.map(([k]) => k) };
}

async function runViewport(name, viewport, isMobile) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport,
    userAgent: isMobile ? devices["iPhone 13"].userAgent : undefined,
    locale: "es-CL",
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);

  const heroBefore = await page.evaluate(() => ({
    copyH: document.querySelector(".tv-hero-slider-copy")?.getBoundingClientRect().height,
    phoneTop: document.querySelector(".hero-phone-slot--agent")?.getBoundingClientRect().top,
    slide: document.querySelector(".tv-hero-slide.is-active")?.getAttribute("data-slide"),
  }));

  await page.waitForTimeout(8000);
  const heroAfter = await page.evaluate(() => ({
    copyH: document.querySelector(".tv-hero-slider-copy")?.getBoundingClientRect().height,
    phoneTop: document.querySelector(".hero-phone-slot--agent")?.getBoundingClientRect().top,
    slide: document.querySelector(".tv-hero-slide.is-active")?.getAttribute("data-slide"),
  }));

  await page.waitForTimeout(2000);
  const agentVisible = await page.evaluate(() => ({
    embedReady: !!document.getElementById("telvoice-web-agent-embed")?.classList.contains("tva-root--ready"),
    floatReady: !!document.getElementById("telvoice-web-agent")?.classList.contains("tva-root--ready"),
    floatHidden: document.body.classList.contains("tva-floating-agent-hidden"),
  }));

  await page.evaluate(async () => {
    let y = 0;
    const max = document.documentElement.scrollHeight;
    while (y < max) {
      y += window.innerHeight * 0.9;
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  const ctas = await page.evaluate(() => {
    const href = (sel) => document.querySelector(sel)?.getAttribute("href") || null;
    return {
      comprar: href('a[data-track="click_comprar_sms_hero"]'),
      hablar: href('a[data-track="click_hablar_agente_hero"]'),
      togglePresent: !!document.getElementById("nav-floating-agent-toggle"),
    };
  });

  await page.evaluate(() => {
    document.querySelector('.tv-hero-dot[data-slide-to="1"]')?.click();
  });
  await page.waitForTimeout(700);
  const slide2Ctas = await page.evaluate(() => {
    const href = (sel) => document.querySelector(sel)?.getAttribute("href") || null;
    return {
      solicitar: href('a[data-track="click_solicitar_numero_hero"]'),
      casos: href('a[data-track="click_ver_casos_uso_hero"]'),
    };
  });

  await page.screenshot({ path: `${OUT}/${name}-footer.png`, fullPage: false });
  await browser.close();

  const uniqueErrors = [...new Set(consoleErrors)];

  return {
    viewport: name,
    url: URL,
    hero: {
      heightStable: Math.abs((heroBefore.copyH || 0) - (heroAfter.copyH || 0)) < 3,
      slideAdvanced: heroBefore.slide !== heroAfter.slide,
      phoneTopDelta: Math.abs((heroBefore.phoneTop || 0) - (heroAfter.phoneTop || 0)),
    },
    agentVisible,
    ctas,
    slide2Ctas,
    consoleErrors: uniqueErrors,
    assertions: assertChecks(name, {
      noConsoleErrors: uniqueErrors.length === 0,
      heroHeightStable: Math.abs((heroBefore.copyH || 0) - (heroAfter.copyH || 0)) < 3,
      heroSlideAdvanced: heroBefore.slide !== heroAfter.slide,
      embedReady: agentVisible.embedReady,
      ctaComprar: ctas.comprar === "#calculadora",
      ctaHablar: ctas.hablar === "#hero-phone-slot",
      ctaToggle: ctas.togglePresent,
      ctaSolicitar: slide2Ctas.solicitar === "/numeracion-sim.html",
      ctaCasos: slide2Ctas.casos === "#casos-uso",
    }),
  };
}

async function runFloatingHiddenPref(viewport) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport, locale: "es-CL" });
  await ctx.addInitScript(() => {
    localStorage.setItem("telvoice:floating-agent-state:public", "hidden");
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => ({
    hidden: document.body.classList.contains("tva-floating-agent-hidden"),
    floatDisplay: document.getElementById("telvoice-web-agent")
      ? getComputedStyle(document.getElementById("telvoice-web-agent")).display
      : "missing",
    embedReady: !!document.getElementById("telvoice-web-agent-embed")?.classList.contains("tva-root--ready"),
  }));

  await browser.close();
  const uniqueErrors = [...new Set(consoleErrors)];

  return {
    scenario: "floating-agent-localStorage-hidden",
    state,
    consoleErrors: uniqueErrors,
    assertions: assertChecks("floating-hidden", {
      noConsoleErrors: uniqueErrors.length === 0,
      bodyHidden: state.hidden,
      floatNotDisplayed: state.floatDisplay === "none",
      embedStillReady: state.embedReady,
    }),
  };
}

console.log("QA scroll browser —", URL);
const mobile = await runViewport("mobile-390", { width: 390, height: 844 }, true);
const desktop = await runViewport("desktop-1440", { width: 1440, height: 900 }, false);
const floatingHidden = await runFloatingHiddenPref({ width: 390, height: 844 });

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: URL,
  perfCommitReference: "2b45dd9",
  results: { mobile, desktop, floatingHidden },
  summary: {
    passed:
      mobile.assertions.passed &&
      desktop.assertions.passed &&
      floatingHidden.assertions.passed,
    failedChecks: [
      ...mobile.assertions.failed.map((k) => `mobile.${k}`),
      ...desktop.assertions.failed.map((k) => `desktop.${k}`),
      ...floatingHidden.assertions.failed.map((k) => `floatingHidden.${k}`),
    ],
  },
};

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log("Reporte:", `${OUT}/report.json`);

process.exit(report.summary.passed ? 0 : 1);
