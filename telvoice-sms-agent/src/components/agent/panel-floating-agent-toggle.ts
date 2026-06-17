/** Toggle avatar + animación para ocultar/mostrar/minimizar launcher flotante en /app y /admin */

export const PANEL_FLOATING_AGENT_STORAGE_KEY = "telvoice:floating-agent-visible";
export const PANEL_FLOATING_AGENT_AVATAR = "/assets/telvoice-agent-nav-toggle.png";

export function getPanelFloatingAgentToggleStyles(): string {
  return `
    body.tva-floating-agent-hidden .tva-floating-launcher-root,
    html.tva-floating-agent-prehidden .tva-floating-launcher-root,
    body.tva-floating-agent-animating .tva-floating-launcher-root {
      display: none !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }

    body.tva-floating-agent-minimized .tva-floating-launcher-root,
    body.tva-floating-agent-minimized #telvoice-web-agent {
      display: none !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }

    .tva-header-actions {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: auto;
      flex-shrink: 0;
    }

    .tva-minimize,
    .tva-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: none;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(186, 230, 253, 0.95);
      cursor: pointer;
      line-height: 1;
      transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
    }

    .tva-minimize-icon {
      display: block;
      flex-shrink: 0;
    }

    .tva-minimize:hover,
    .tva-close:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(125, 211, 252, 0.35);
    }

    .tva-minimize:active,
    .tva-close:active {
      transform: scale(0.94);
    }

    .tva-minimize:focus-visible,
    .tva-close:focus-visible {
      outline: 2px solid #0b5cff;
      outline-offset: 2px;
    }

    .nav-floating-agent-toggle--avatar {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 2.75rem;
      height: 2.75rem;
      padding: 0;
      border: none;
      border-radius: 9999px;
      background: transparent;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: transform 0.2s ease;
    }

    .nav-floating-agent-toggle--avatar:hover {
      transform: scale(1.04);
    }

    .nav-floating-agent-toggle--avatar:active {
      transform: scale(0.96);
    }

    .nav-floating-agent-toggle--avatar:focus-visible {
      outline: 2px solid #0b5cff;
      outline-offset: 3px;
    }

    .nav-floating-agent-toggle__ring {
      position: absolute;
      inset: -0.35rem;
      border-radius: 9999px;
      background: radial-gradient(
        circle,
        rgba(72, 255, 220, 0.55) 0%,
        rgba(11, 92, 255, 0.28) 42%,
        transparent 72%
      );
      opacity: 0;
      pointer-events: none;
      transform: scale(0.92);
      transition: opacity 0.35s ease;
    }

    .nav-floating-agent-toggle__avatar {
      position: relative;
      z-index: 1;
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 9999px;
      object-fit: cover;
      transition:
        opacity 0.4s ease,
        filter 0.4s ease,
        box-shadow 0.4s ease;
    }

    .nav-floating-agent-toggle.is-agent-dormant .nav-floating-agent-toggle__ring {
      opacity: 1;
      animation: tva-toggle-glow 2.2s ease-in-out infinite;
    }

    .nav-floating-agent-toggle.is-agent-dormant .nav-floating-agent-toggle__avatar {
      opacity: 1;
      filter: saturate(1.08) brightness(1.06);
      box-shadow:
        0 0 0 1px rgba(220, 231, 245, 0.95),
        0 0 18px rgba(11, 92, 255, 0.35),
        0 0 28px rgba(72, 255, 220, 0.22);
    }

    .nav-floating-agent-toggle.is-agent-live .nav-floating-agent-toggle__avatar {
      opacity: 0.42;
      filter: saturate(0.65) brightness(0.88);
      box-shadow: 0 0 0 1px rgba(220, 231, 245, 0.75);
    }

    .nav-floating-agent-toggle.is-agent-minimized .nav-floating-agent-toggle__ring {
      opacity: 1;
      animation: tva-toggle-glow 2.2s ease-in-out infinite;
    }

    .nav-floating-agent-toggle.is-agent-minimized .nav-floating-agent-toggle__avatar {
      opacity: 1;
      filter: saturate(1.08) brightness(1.06);
      box-shadow:
        0 0 0 1px rgba(220, 231, 245, 0.95),
        0 0 18px rgba(11, 92, 255, 0.35),
        0 0 28px rgba(72, 255, 220, 0.22);
    }

    .tva-floating-agent-traveler {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 100000;
      pointer-events: none;
      border-radius: 9999px;
      overflow: visible;
      will-change: transform, width, height, opacity, filter;
    }

    .tva-floating-agent-traveler img {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 9999px;
      object-fit: cover;
      box-shadow:
        0 0 0 1px rgba(220, 231, 245, 0.95),
        0 10px 28px rgba(11, 92, 255, 0.28),
        0 0 24px rgba(72, 255, 220, 0.35);
    }

    .tva-root--entry-reveal {
      animation: tva-agent-entry-reveal 0.65s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @keyframes tva-toggle-glow {
      0%, 100% { transform: scale(0.92); opacity: 0.72; }
      50% { transform: scale(1.08); opacity: 1; }
    }

    @keyframes tva-agent-entry-reveal {
      0% { opacity: 0; transform: translateY(12px) scale(0.88); filter: blur(2px); }
      100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .nav-floating-agent-toggle.is-agent-dormant .nav-floating-agent-toggle__ring {
        animation: none;
        opacity: 0.85;
      }
      .nav-floating-agent-toggle--avatar:hover,
      .nav-floating-agent-toggle--avatar:active {
        transform: none;
      }
      .tva-root--entry-reveal {
        animation: none;
      }
    }
  `;
}

export function renderPanelFloatingAgentToggleBootScript(surface: "panel" | "admin"): string {
  return `<script>
(function () {
  var SURFACE = ${JSON.stringify(surface)};
  var LEGACY_KEY = ${JSON.stringify(PANEL_FLOATING_AGENT_STORAGE_KEY)};
  function storageKey() { return "telvoice:floating-agent-state:" + SURFACE; }
  function readState() {
    try {
      var stored = localStorage.getItem(storageKey());
      if (stored === "open" || stored === "minimized" || stored === "hidden") return stored;
      if (localStorage.getItem(LEGACY_KEY) === "false") return "hidden";
    } catch (e) {}
    return "open";
  }
  function apply(state) {
    if (!document.body) return;
    document.body.classList.toggle("tva-floating-agent-hidden", state === "hidden");
    document.body.classList.toggle("tva-floating-agent-minimized", state === "minimized");
    document.documentElement.classList.remove("tva-floating-agent-prehidden");
  }
  var state = readState();
  if (state === "hidden" || state === "minimized") {
    if (document.body) apply(state);
    else {
      document.documentElement.classList.add("tva-floating-agent-prehidden");
      document.addEventListener("DOMContentLoaded", function () { apply(readState()); }, { once: true });
    }
  }
})();
</script>`;
}

export function renderPanelFloatingAgentToggleButton(buttonId: string): string {
  return `<button type="button" id="${buttonId}" class="nav-floating-agent-toggle nav-floating-agent-toggle--avatar is-agent-live" aria-pressed="true" aria-label="Ocultar agente flotante">
  <span class="nav-floating-agent-toggle__ring" aria-hidden="true"></span>
  <img src="${PANEL_FLOATING_AGENT_AVATAR}" alt="" class="nav-floating-agent-toggle__avatar" width="44" height="44" decoding="async" />
</button>`;
}

export function getPanelFloatingAgentToggleScript(options: {
  buttonIds: string[];
  floatingRootId: string;
  surface: "panel" | "admin";
}): string {
  const buttonSelector = options.buttonIds.map((id) => `#${id}`).join(", ");
  return `(function () {
  var SURFACE = ${JSON.stringify(options.surface)};
  var STORAGE_KEY = "telvoice:floating-agent-state:" + SURFACE;
  var LEGACY_KEY = ${JSON.stringify(PANEL_FLOATING_AGENT_STORAGE_KEY)};
  var FLOAT_ROOT_ID = ${JSON.stringify(options.floatingRootId)};
  var BUTTON_SELECTOR = ${JSON.stringify(buttonSelector)};
  var TRAVEL_MS = 580;
  var avatarSrc = ${JSON.stringify(PANEL_FLOATING_AGENT_AVATAR)};
  var buttons = [];
  var animating = false;

  function prefersReducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }

  function readState() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "open" || stored === "minimized" || stored === "hidden") return stored;
      if (localStorage.getItem(LEGACY_KEY) === "false") return "hidden";
    } catch (e) {}
    return "open";
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, state);
      if (state === "hidden") localStorage.setItem(LEGACY_KEY, "false");
      else if (state === "open") localStorage.setItem(LEGACY_KEY, "true");
    } catch (e) {}
  }

  function floatRoot() { return document.getElementById(FLOAT_ROOT_ID); }

  function applyState(state) {
    var root = floatRoot();
    if (!document.body) return;
    document.body.classList.toggle("tva-floating-agent-hidden", state === "hidden");
    document.body.classList.toggle("tva-floating-agent-minimized", state === "minimized");
    document.documentElement.classList.remove("tva-floating-agent-prehidden");
    syncButtons(state);
    if (state === "minimized" || state === "hidden") {
      document.dispatchEvent(new CustomEvent("telvoice:agent-panel-close"));
    }
  }

  function getNavButton() {
    return buttons[0] || document.querySelector(BUTTON_SELECTOR.split(",")[0]);
  }

  function getAgentVisibleRect() {
    var root = floatRoot();
    if (root) {
      var panel = root.querySelector(".tva-panel");
      if (panel) {
        var panelRect = panel.getBoundingClientRect();
        if (panelRect.width > 0 && panelRect.height > 0) return panelRect;
      }
      var launcher = root.querySelector(".tva-launcher") || root.querySelector(".tva-launcher-wrap") || root;
      var launcherRect = launcher.getBoundingClientRect();
      if (launcherRect.width > 0 && launcherRect.height > 0) return launcherRect;
    }
    return getFloatingLauncherRect();
  }

  function syncButtonState(btn, state) {
    var visible = state !== "hidden";
    var minimized = state === "minimized";
    btn.setAttribute("aria-pressed", visible && !minimized ? "true" : "false");
    if (!visible) {
      btn.setAttribute("aria-label", "Mostrar agente");
      btn.setAttribute("title", "Mostrar agente");
    } else if (minimized) {
      btn.setAttribute("aria-label", "Abrir agente Telvoice");
      btn.setAttribute("title", "Abrir agente Telvoice");
    } else {
      btn.setAttribute("aria-label", "Minimizar agente al menú");
      btn.setAttribute("title", "Minimizar al menú");
    }
    btn.classList.toggle("is-agent-live", visible && !minimized);
    btn.classList.toggle("is-agent-dormant", !visible);
    btn.classList.toggle("is-agent-minimized", minimized);
  }

  function syncButtons(state) {
    buttons.forEach(function (btn) { syncButtonState(btn, state); });
  }

  function getFloatingLauncherRect() {
    var root = floatRoot();
    if (root) {
      var launcher = root.querySelector(".tva-launcher") || root.querySelector(".tva-launcher-wrap") || root;
      var rect = launcher.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return rect;
    }
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var size = rem * 4.25;
    var margin = rem * 1.25;
    return { left: window.innerWidth - size - margin, top: window.innerHeight - size - margin, width: size, height: size };
  }

  function rectCenter(rect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }

  function runTravelAnimation(fromRect, toRect, mode, done) {
    if (prefersReducedMotion()) { if (done) done(); return; }
    var fromCenter = rectCenter(fromRect);
    var toCenter = rectCenter(toRect);
    var startSize = Math.max(fromRect.width, fromRect.height, 44);
    var endSize = Math.max(toRect.width, toRect.height, 44);
    var traveler = document.createElement("div");
    traveler.className = "tva-floating-agent-traveler";
    traveler.innerHTML = '<img src="' + avatarSrc + '" alt="" width="64" height="64" decoding="async" />';
    document.body.appendChild(traveler);
    document.body.classList.add("tva-floating-agent-animating");
    var start = null;
    function frame(ts) {
      if (!start) start = ts;
      var progress = Math.min(1, (ts - start) / TRAVEL_MS);
      var eased = 1 - Math.pow(1 - progress, 3);
      var cx = fromCenter.x + (toCenter.x - fromCenter.x) * eased;
      var cy = fromCenter.y + (toCenter.y - fromCenter.y) * eased;
      var size = startSize + (endSize - startSize) * eased;
      var fade = mode === "hide" ? 1 - progress * 0.35 : 0.82 + progress * 0.18;
      traveler.style.width = size + "px";
      traveler.style.height = size + "px";
      traveler.style.transform = "translate3d(" + (cx - size / 2) + "px," + (cy - size / 2) + "px, 0)";
      traveler.style.opacity = String(fade);
      if (progress < 1) window.requestAnimationFrame(frame);
      else {
        traveler.remove();
        document.body.classList.remove("tva-floating-agent-animating");
        if (done) done();
      }
    }
    window.requestAnimationFrame(frame);
  }

  function dockMinimizeToMenu() {
    if (animating) return;
    if (readState() === "minimized") {
      applyState("minimized");
      return;
    }
    var navBtn = getNavButton();
    writeState("minimized");
    if (!navBtn || prefersReducedMotion()) {
      applyState("minimized");
      return;
    }
    animating = true;
    var fromRect = getAgentVisibleRect();
    var toRect = navBtn.getBoundingClientRect();
    document.body.classList.add("tva-floating-agent-animating");
    runTravelAnimation(fromRect, toRect, "hide", function () {
      applyState("minimized");
      document.body.classList.remove("tva-floating-agent-animating");
      animating = false;
    });
  }

  function setAgentState(nextState, opts) {
    opts = opts || {};
    var current = readState();
    if (current === nextState) { applyState(nextState); return nextState; }
    if (animating) return current;
    if (nextState === "minimized") {
      dockMinimizeToMenu();
      return "minimized";
    }
    writeState(nextState);
    if (!opts.animate || !opts.sourceButton || prefersReducedMotion()) {
      applyState(nextState);
      return nextState;
    }
    animating = true;
    var sourceRect = opts.sourceButton.getBoundingClientRect();
    var launcherRect = getFloatingLauncherRect();
    if (nextState === "hidden") {
      runTravelAnimation(launcherRect, sourceRect, "hide", function () {
        applyState("hidden");
        animating = false;
      });
    } else {
      applyState("open");
      runTravelAnimation(sourceRect, launcherRect, "show", function () {
        applyState("open");
        animating = false;
      });
    }
    return nextState;
  }

  function bindButtons() {
    buttons = Array.prototype.slice.call(document.querySelectorAll(BUTTON_SELECTOR));
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var state = readState();
        if (state === "hidden" || state === "minimized") {
          setAgentState("open", { animate: true, sourceButton: btn });
        } else {
          dockMinimizeToMenu();
        }
      });
    });
  }

  function runEntryAnimation() {
    var state = readState();
    if (state !== "open") return;
    var key = "telvoice:floating-agent-entry:" + SURFACE;
    try { if (sessionStorage.getItem(key) === "1") return; sessionStorage.setItem(key, "1"); } catch (e) { return; }
    var navBtn = document.querySelector(BUTTON_SELECTOR.split(",")[0]);
    var root = floatRoot();
    if (!navBtn || !root || prefersReducedMotion()) return;
    document.body.classList.add("tva-floating-agent-animating");
    runTravelAnimation(navBtn.getBoundingClientRect(), getFloatingLauncherRect(), "show", function () {
      document.body.classList.remove("tva-floating-agent-animating");
      root.classList.add("tva-root--entry-reveal");
      window.setTimeout(function () { root.classList.remove("tva-root--entry-reveal"); }, 700);
    });
  }

  document.addEventListener("telvoice:agent-chrome", function (ev) {
    var action = ev && ev.detail ? ev.detail.action : "";
    if (action === "hide") setAgentState("hidden", { animate: false });
    else if (action === "minimize") dockMinimizeToMenu();
    else if (action === "restore") setAgentState("open", { animate: false });
  });

  function initToggleUi() {
    if (!document.body) return;
    applyState(readState());
    bindButtons();
    window.setTimeout(runEntryAnimation, 120);
  }

  window.TelvoicePanelFloatingAgent = {
    readState: readState,
    setState: setAgentState,
    surface: SURFACE
  };

  if (document.body) initToggleUi();
  else document.addEventListener("DOMContentLoaded", initToggleUi, { once: true });
})();`;
}
