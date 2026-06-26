#!/usr/bin/env node
/**
 * Regresión obligatoria — scroll hero, anchors/hash y agente flotante (landing pública).
 *
 * Ejecutar ANTES de merge/deploy si se toca cualquiera de:
 *   - index.html
 *   - js/telvoice-app.js
 *   - js/telvoice-web-agent-loader.js
 *   - js/telvoice-floating-agent-pref.js
 *   - js/telvoice-floating-agent-toggle.js
 *   - js/telvoice-web-agent.js
 *
 * No modificar scroll inicial, navegación por hash/anchors ni visibilidad del agente
 * flotante sin pasar esta batería.
 *
 * Uso:
 *   npm run test:landing-scroll-agent-qa
 *   QA_BASE_URL=http://127.0.0.1:8765 npm run test:landing-scroll-agent-qa
 *
 * Evidencia: qa-evidence/landing-scroll-agent-validation/ (+ qa-report.json)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "https://www.telvoice.cl/";
const OUT = join(process.cwd(), "qa-evidence/landing-scroll-agent-validation");

const LEGACY_CONFLICT = {
  "telvoice:floating-agent-state:public": "open",
  "telvoice:floating-agent-visible": "false",
};

const HASH_SETTLE_MS = 4500;
const NAV_WAIT = { waitUntil: "domcontentloaded", timeout: 90000 };
const MIN_LAUNCHER_PX = 72;
const MIN_AVATAR_PX = 24;

async function waitForLauncherAvatar(page) {
  await page.waitForFunction(
    () => {
      const launcher = document.querySelector("#telvoice-web-agent .tva-launcher");
      if (!launcher) {
        return false;
      }
      const img = launcher.querySelector(
        "img[data-tva-iso], .telvoice-agent-avatar__img, .tva-launcher-iso img",
      );
      if (img && img.complete && img.naturalWidth > 0) {
        return img.getBoundingClientRect().width >= 24;
      }
      const iso = launcher.querySelector(".tva-launcher-iso");
      if (!iso || !iso.classList.contains("tva-agent-iso-slot")) {
        return false;
      }
      const isoImg = iso.querySelector("img");
      return !!isoImg && isoImg.complete && isoImg.naturalWidth > 0;
    },
    { timeout: 30000 },
  );
}

async function waitForAgent(page) {
  await page.waitForSelector("#telvoice-web-agent", { timeout: 60000 });
  await page.waitForFunction(
    () => {
      const root = document.getElementById("telvoice-web-agent");
      return root && root.classList.contains("tva-root--ready");
    },
    { timeout: 60000 },
  );
  await waitForLauncherAvatar(page);
  await page.waitForTimeout(400);
}

async function waitForHashScroll(page) {
  await page.waitForTimeout(HASH_SETTLE_MS);
}

async function auditLauncherClosed(page) {
  return page.evaluate(
    ({ minLauncher, minAvatar }) => {
      const floatRoot = document.getElementById("telvoice-web-agent");
      const launcher = floatRoot?.querySelector(".tva-launcher");
      const panel = floatRoot?.querySelector(".tva-panel");
      if (!launcher || !floatRoot) {
        return { ok: false, reason: "missing-launcher" };
      }

      const ls = getComputedStyle(launcher);
      const rs = getComputedStyle(floatRoot);
      const rect = launcher.getBoundingClientRect();
      const img =
        launcher.querySelector("img[data-tva-iso], .telvoice-agent-avatar__img, img") ||
        launcher.querySelector(".tva-launcher-iso img");
      const iso = launcher.querySelector(".tva-launcher-iso");
      const panelStyle = panel ? getComputedStyle(panel) : null;
      const panelOpen = panel?.classList.contains("is-open") ?? false;
      const panelVisible =
        !!panel &&
        panelOpen &&
        panelStyle?.display !== "none" &&
        panelStyle?.visibility !== "hidden";

      let avatar = null;
      if (img) {
        const imgStyle = getComputedStyle(img);
        const imgRect = img.getBoundingClientRect();
        avatar = {
          src: img.currentSrc || img.src || null,
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          display: imgStyle.display,
          visibility: imgStyle.visibility,
          opacity: imgStyle.opacity,
          boundingBox: {
            x: Math.round(imgRect.x),
            y: Math.round(imgRect.y),
            width: Math.round(imgRect.width),
            height: Math.round(imgRect.height),
          },
        };
      }

      const boundingBox = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
      };

      const inViewportCorner =
        rect.width >= minLauncher &&
        rect.height >= minLauncher &&
        rect.right >= window.innerWidth - 48 &&
        rect.bottom >= window.innerHeight - 48 &&
        rect.top >= 0 &&
        rect.left >= 0;

      const avatarLoaded =
        !!avatar &&
        avatar.complete &&
        avatar.naturalWidth > 0 &&
        avatar.boundingBox.width >= minAvatar &&
        avatar.boundingBox.height >= minAvatar &&
        avatar.visibility !== "hidden" &&
        parseFloat(avatar.opacity || "1") >= 0.9;

      const isoHasAvatar =
        !!iso &&
        iso.classList.contains("tva-agent-iso-slot") &&
        !!iso.querySelector("img, svg, picture, .telvoice-agent-avatar, .telvoice-agent-avatar__img");

      const stylesVisible =
        ls.display !== "none" &&
        ls.visibility !== "hidden" &&
        parseFloat(ls.opacity || "1") >= 0.9 &&
        rs.display !== "none" &&
        rs.visibility !== "hidden" &&
        !document.body.classList.contains("tva-floating-agent-hidden");

      const closedState =
        !panelOpen && launcher.getAttribute("aria-expanded") !== "true" && !panelVisible;

      return {
        ok:
          stylesVisible &&
          inViewportCorner &&
          closedState &&
          (avatarLoaded || isoHasAvatar),
        closedState,
        panelOpen,
        panelVisible,
        styles: {
          display: ls.display,
          visibility: ls.visibility,
          opacity: ls.opacity,
          zIndex: rs.zIndex,
          width: boundingBox.width,
          height: boundingBox.height,
          backgroundColor: ls.backgroundColor,
          backgroundImage: ls.backgroundImage,
        },
        floatRoot: {
          display: rs.display,
          visibility: rs.visibility,
          opacity: rs.opacity,
          zIndex: rs.zIndex,
        },
        boundingBox,
        avatar,
        isoHasAvatar,
        avatarLoaded,
        inViewportCorner,
        stylesVisible,
      };
    },
    { minLauncher: MIN_LAUNCHER_PX, minAvatar: MIN_AVATAR_PX },
  );
}

async function auditLauncherOpen(page) {
  return page.evaluate(() => {
    const floatRoot = document.getElementById("telvoice-web-agent");
    const panel = floatRoot?.querySelector(".tva-panel");
    const launcher = floatRoot?.querySelector(".tva-launcher");
    if (!panel || !launcher) {
      return { ok: false, reason: "missing-panel" };
    }
    const ps = getComputedStyle(panel);
    const panelRect = panel.getBoundingClientRect();
    const messages = panel.querySelector(".tva-messages");
    const messagesRect = messages?.getBoundingClientRect();
    const panelOpen = panel.classList.contains("is-open");
    const panelVisible =
      panelOpen && ps.display !== "none" && ps.visibility !== "hidden" && panelRect.height > 120;
    return {
      ok: panelVisible && launcher.getAttribute("aria-expanded") === "true",
      panelOpen,
      panelVisible,
      ariaExpanded: launcher.getAttribute("aria-expanded"),
      panelBoundingBox: {
        x: Math.round(panelRect.x),
        y: Math.round(panelRect.y),
        width: Math.round(panelRect.width),
        height: Math.round(panelRect.height),
      },
      panelStyles: {
        display: ps.display,
        visibility: ps.visibility,
        opacity: ps.opacity,
        zIndex: getComputedStyle(floatRoot).zIndex,
      },
      messagesHeight: messagesRect ? Math.round(messagesRect.height) : 0,
    };
  });
}

async function auditMinimized(page) {
  return page.evaluate(() => {
    const floatRoot = document.getElementById("telvoice-web-agent");
    const chip = document.getElementById("tva-floating-agent-restore");
    const chipHidden = chip ? chip.hidden : true;
    const chipRect = chip && !chipHidden ? chip.getBoundingClientRect() : null;
    const floatStyle = floatRoot ? getComputedStyle(floatRoot) : null;
    const chipStyle = chip && !chipHidden ? getComputedStyle(chip) : null;
    const chipAvatar = chip?.querySelector("img, .tva-floating-agent-restore__avatar");
    const chipAvatarRect = chipAvatar?.getBoundingClientRect();
    return {
      ok:
        document.body.classList.contains("tva-floating-agent-hidden") &&
        !!chipRect &&
        chipRect.width > 40 &&
        chipRect.height > 24 &&
        chipStyle?.visibility !== "hidden" &&
        parseFloat(chipStyle?.opacity || "1") >= 0.9,
      bodyHidden: document.body.classList.contains("tva-floating-agent-hidden"),
      floatDisplay: floatStyle?.display ?? null,
      chipVisible: !!chipRect && chipRect.width > 40,
      chipStyles: chipStyle
        ? {
            display: chipStyle.display,
            visibility: chipStyle.visibility,
            opacity: chipStyle.opacity,
          }
        : null,
      chipBoundingBox: chipRect
        ? {
            x: Math.round(chipRect.x),
            y: Math.round(chipRect.y),
            width: Math.round(chipRect.width),
            height: Math.round(chipRect.height),
          }
        : null,
      chipAvatarBoundingBox: chipAvatarRect
        ? {
            width: Math.round(chipAvatarRect.width),
            height: Math.round(chipAvatarRect.height),
          }
        : null,
    };
  });
}

async function screenshotLauncherClosed(page, basename) {
  const launcher = page.locator("#telvoice-web-agent .tva-launcher");
  await launcher.waitFor({ state: "visible", timeout: 15000 });
  const box = await launcher.boundingBox();
  if (!box) {
    throw new Error("Launcher closed: bounding box missing");
  }
  await launcher.screenshot({ path: join(OUT, `${basename}-element.png`) });
  await page.screenshot({
    path: join(OUT, `${basename}-corner.png`),
    clip: {
      x: Math.max(0, Math.floor(box.x - 24)),
      y: Math.max(0, Math.floor(box.y - 24)),
      width: Math.min(page.viewportSize().width, Math.ceil(box.width + 48)),
      height: Math.min(page.viewportSize().height, Math.ceil(box.height + 48)),
    },
  });
}

async function screenshotPanelOpen(page, basename) {
  const panel = page.locator("#telvoice-web-agent .tva-panel.is-open");
  await panel.waitFor({ state: "visible", timeout: 15000 });
  await panel.screenshot({ path: join(OUT, `${basename}-element.png`) });
  await page.screenshot({ path: join(OUT, `${basename}-viewport.png`), fullPage: false });
}

async function screenshotMinimized(page, basename) {
  const chip = page.locator("#tva-floating-agent-restore");
  await chip.waitFor({ state: "visible", timeout: 15000 });
  await chip.screenshot({ path: join(OUT, `${basename}-chip-element.png`) });
  await page.screenshot({ path: join(OUT, `${basename}-viewport.png`), fullPage: false });
}

async function runLauncherVisualFlow(page) {
  await page.goto(calcUrl("calculadora"), NAV_WAIT);
  await waitForAgent(page);
  await waitForHashScroll(page);

  const closedAudit = await auditLauncherClosed(page);
  await screenshotLauncherClosed(page, "12-launcher-closed-visible");

  await page.locator("#telvoice-web-agent .tva-launcher").click();
  await page.waitForTimeout(800);
  const openAudit = await auditLauncherOpen(page);
  await screenshotPanelOpen(page, "13-launcher-chat-open");

  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent("telvoice:agent-chrome", { detail: { action: "minimize" } }),
    );
  });
  await page.waitForTimeout(1200);
  const minimizedAudit = await auditMinimized(page);
  await screenshotMinimized(page, "14-launcher-minimized-chip");

  const restoreChip = page.locator("#tva-floating-agent-restore");
  if (await restoreChip.isVisible()) {
    await restoreChip.click();
    await page.waitForTimeout(1000);
  }
  const restoredAudit = await auditLauncherClosed(page);
  await screenshotLauncherClosed(page, "15-launcher-restored-closed");

  return {
    closed: closedAudit,
    open: openAudit,
    minimized: minimizedAudit,
    restored: restoredAudit,
    screenshots: {
      closed: ["12-launcher-closed-visible-element.png", "12-launcher-closed-visible-corner.png"],
      open: ["13-launcher-chat-open-element.png", "13-launcher-chat-open-viewport.png"],
      minimized: [
        "14-launcher-minimized-chip-chip-element.png",
        "14-launcher-minimized-chip-viewport.png",
      ],
      restored: ["15-launcher-restored-closed-element.png", "15-launcher-restored-closed-corner.png"],
    },
  };
}

async function auditLanding(page, sectionId) {
  const launcherAudit = await auditLauncherClosed(page);
  const landing = await page.evaluate(
    ({ id, minLauncher }) => {
      const el = id ? document.getElementById(id) : null;
      const rect = el?.getBoundingClientRect();
      const nav = document.querySelector("body > nav");
      const navH = nav ? nav.getBoundingClientRect().height : 0;
      const heroTitle = document.getElementById("hero-title");
      const heroRect = heroTitle?.getBoundingClientRect();
      const heroMisaligned =
        !!heroRect && heroRect.top < navH - 8 && heroRect.bottom > navH + 20;

      return {
        hash: location.hash,
        scrollY: Math.round(window.scrollY),
        sectionTop: rect ? Math.round(rect.top) : null,
        sectionInView:
          !!rect && rect.top <= navH + 32 && rect.top >= navH - 48 && rect.bottom > navH + 80,
        heroTitleTop: heroRect ? Math.round(heroRect.top) : null,
        heroMisaligned,
        heroFirstLineVisible:
          !!heroTitle &&
          heroRect.top >= navH - 2 &&
          heroRect.top < window.innerHeight * 0.45,
        bodyHidden: document.body.classList.contains("tva-floating-agent-hidden"),
      };
    },
    { id: sectionId, minLauncher: MIN_LAUNCHER_PX },
  );

  return {
    ...landing,
    launcher: launcherAudit,
    launcherVisible: launcherAudit.ok,
    floatDisplay: launcherAudit.floatRoot?.display ?? null,
    floatVisibility: launcherAudit.floatRoot?.visibility ?? null,
    floatReady: true,
    launcherBottomRight: launcherAudit.inViewportCorner ?? false,
  };
}

async function setLegacyConflict(page) {
  await page.evaluate((keys) => {
    Object.entries(keys).forEach(([k, v]) => localStorage.setItem(k, v));
  }, LEGACY_CONFLICT);
}

function calcUrl(hash) {
  const root = BASE.replace(/\/$/, "");
  return `${root}/index.html${hash ? `#${hash.replace(/^#/, "")}` : ""}`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "es-CL",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = { baseUrl: BASE, generatedAt: new Date().toISOString(), cases: {} };

  results.cases.launcherVisualFlow = await runLauncherVisualFlow(page);

  await context.clearCookies();
  await page.goto(calcUrl("calculadora"), NAV_WAIT);
  await waitForAgent(page);
  await waitForHashScroll(page);
  results.cases.directLoadIndexCalculadora = await auditLanding(page, "calculadora");
  await page.screenshot({
    path: join(OUT, "08-desktop-direct-index-calculadora.png"),
    fullPage: false,
  });

  await page.goto(BASE, NAV_WAIT);
  await waitForAgent(page);
  await page.click("#nav-comprar-sms");
  await waitForHashScroll(page);
  results.cases.comprarSmsFromTop = await auditLanding(page, "calculadora");

  await page.goto(BASE, NAV_WAIT);
  await waitForAgent(page);
  await page.click('a[href="#contacto"]');
  await page.waitForTimeout(800);
  await page.click("#nav-comprar-sms");
  await waitForHashScroll(page);
  results.cases.comprarSmsFromContacto = await auditLanding(page, "calculadora");
  await page.screenshot({
    path: join(OUT, "09-desktop-comprar-sms-from-contacto.png"),
    fullPage: false,
  });

  await page.goto(calcUrl("calculadora"), NAV_WAIT);
  await waitForAgent(page);
  await waitForHashScroll(page);
  const scrollBeforeHashReload = await page.evaluate(() => Math.round(window.scrollY));
  await page.reload(NAV_WAIT);
  await waitForAgent(page);
  await waitForHashScroll(page);
  results.cases.refreshOnCalculadoraHash = {
    scrollBeforeHashReload,
    ...(await auditLanding(page, "calculadora")),
  };
  await page.screenshot({
    path: join(OUT, "10-desktop-refresh-on-calculadora-hash.png"),
    fullPage: false,
  });

  await page.goto(calcUrl("calculadora"), { waitUntil: "domcontentloaded" });
  await setLegacyConflict(page);
  await page.reload(NAV_WAIT);
  await waitForAgent(page);
  await waitForHashScroll(page);
  results.cases.legacyConflictOnCalculadoraHash = await auditLanding(page, "calculadora");

  await page.goto(calcUrl("contacto"), NAV_WAIT);
  await waitForHashScroll(page);
  const contactAudit = await auditLanding(page, "contacto");
  await page.goBack(NAV_WAIT);
  await waitForHashScroll(page);
  const backToCalc = await auditLanding(page, "calculadora");
  await page.goForward(NAV_WAIT);
  await waitForHashScroll(page);
  const forwardContacto = await auditLanding(page, "contacto");
  results.cases.hashBackForward = { contactAudit, backToCalc, forwardContacto };

  await page.goto(BASE, NAV_WAIT);
  await page.evaluate(() => window.scrollTo(0, 4500));
  await page.waitForTimeout(400);
  const scrollBeforeReload = await page.evaluate(() => Math.round(window.scrollY));
  await page.reload(NAV_WAIT);
  await waitForAgent(page);
  results.cases.desktopRefreshFromBottom = {
    scrollBeforeReload,
    ...(await auditLanding(page, "inicio")),
  };
  await page.screenshot({
    path: join(OUT, "03-desktop-1440-after-refresh-from-bottom.png"),
    fullPage: false,
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await setLegacyConflict(page);
  await page.reload(NAV_WAIT);
  await waitForAgent(page);
  results.cases.desktopLegacyConflictFirstLoad = await auditLanding(page, "inicio");
  await page.screenshot({ path: join(OUT, "01-desktop-1440-hero-full.png"), fullPage: false });

  const hashTests = {};
  for (const hash of ["precios", "contacto"]) {
    await page.goto(calcUrl(hash), NAV_WAIT);
    await waitForHashScroll(page);
    hashTests[hash] = await auditLanding(page, hash);
  }
  results.cases.hashAnchors = hashTests;

  const menuClicks = {};
  const links = [
    { name: "casos-uso", selector: 'a[href="#casos-uso"]' },
    { name: "numeracion", selector: 'a[href="#numeracion"]' },
    { name: "api", selector: 'a[href="#api"]' },
    { name: "contacto", selector: 'a[href="#contacto"]' },
  ];
  for (const link of links) {
    await page.goto(BASE, NAV_WAIT);
    await page.click(link.selector, { timeout: 10000 });
    await page.waitForTimeout(600);
    menuClicks[link.name] = await auditLanding(page, link.name);
  }
  results.cases.menuClicks = menuClicks;

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-CL",
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(calcUrl("calculadora"), NAV_WAIT);
  await waitForAgent(mobilePage);
  await waitForHashScroll(mobilePage);
  const mobileClosed = await auditLauncherClosed(mobilePage);
  await screenshotLauncherClosed(mobilePage, "16-mobile-launcher-closed-visible");
  results.cases.mobileCalculadoraHash = {
    ...(await auditLanding(mobilePage, "calculadora")),
    launcherClosed: mobileClosed,
  };
  await mobilePage.screenshot({
    path: join(OUT, "06-mobile-390-float-visible.png"),
    fullPage: false,
  });
  await mobileContext.close();

  results.consoleErrors = [...new Set(errors)];
  const lv = results.cases.launcherVisualFlow;
  results.pass = {
    launcherClosedVisible: lv.closed.ok,
    launcherChatOpen: lv.open.ok,
    launcherMinimizedChip: lv.minimized.ok,
    launcherRestoredClosed: lv.restored.ok,
    directLoadCalculadora:
      results.cases.directLoadIndexCalculadora.sectionInView &&
      !results.cases.directLoadIndexCalculadora.heroMisaligned &&
      results.cases.directLoadIndexCalculadora.launcherVisible,
    comprarSmsFromTop:
      results.cases.comprarSmsFromTop.sectionInView &&
      !results.cases.comprarSmsFromTop.heroMisaligned &&
      results.cases.comprarSmsFromTop.hash === "#calculadora",
    comprarSmsFromContacto:
      results.cases.comprarSmsFromContacto.sectionInView &&
      !results.cases.comprarSmsFromContacto.heroMisaligned,
    refreshOnCalculadoraHash:
      results.cases.refreshOnCalculadoraHash.sectionInView &&
      !results.cases.refreshOnCalculadoraHash.heroMisaligned &&
      results.cases.refreshOnCalculadoraHash.hash === "#calculadora",
    legacyOnCalculadoraHash:
      results.cases.legacyConflictOnCalculadoraHash.sectionInView &&
      results.cases.legacyConflictOnCalculadoraHash.launcherVisible &&
      !results.cases.legacyConflictOnCalculadoraHash.bodyHidden,
    hashBackForward:
      results.cases.hashBackForward.backToCalc.sectionInView &&
      results.cases.hashBackForward.forwardContacto.sectionInView,
    heroTitleCompleteOnReload:
      results.cases.desktopRefreshFromBottom.scrollY <= 5 &&
      results.cases.desktopRefreshFromBottom.heroFirstLineVisible,
    legacyConflictLauncherVisible:
      results.cases.desktopLegacyConflictFirstLoad.launcherVisible &&
      !results.cases.desktopLegacyConflictFirstLoad.bodyHidden,
    hashPrecios: results.cases.hashAnchors.precios?.sectionInView,
    hashContacto: results.cases.hashAnchors.contacto?.sectionInView,
    menuNavigation: Object.values(results.cases.menuClicks).every((c) => c.sectionInView),
    mobileCalculadoraHash:
      results.cases.mobileCalculadoraHash.sectionInView &&
      !results.cases.mobileCalculadoraHash.heroMisaligned &&
      results.cases.mobileCalculadoraHash.launcherClosed?.ok,
  };
  results.allPass = Object.values(results.pass).every(Boolean);

  await writeFile(join(OUT, "qa-report.json"), JSON.stringify(results, null, 2));
  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  if (!results.allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
