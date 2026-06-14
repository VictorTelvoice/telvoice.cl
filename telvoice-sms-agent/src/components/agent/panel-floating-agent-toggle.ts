/** Toggle avatar + animación para ocultar/mostrar launcher flotante en /app y /admin */

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

    @keyframes tva-toggle-glow {
      0%, 100% { transform: scale(0.92); opacity: 0.72; }
      50% { transform: scale(1.08); opacity: 1; }
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
    }
  `;
}

export function renderPanelFloatingAgentToggleBootScript(): string {
  return `<script>
(function () {
  var KEY = ${JSON.stringify(PANEL_FLOATING_AGENT_STORAGE_KEY)};
  function applyHidden() {
    if (!document.body) return;
    document.body.classList.add("tva-floating-agent-hidden");
    document.documentElement.classList.remove("tva-floating-agent-prehidden");
  }
  try {
    if (localStorage.getItem(KEY) === "false") {
      if (document.body) applyHidden();
      else {
        document.documentElement.classList.add("tva-floating-agent-prehidden");
        document.addEventListener("DOMContentLoaded", applyHidden, { once: true });
      }
    }
  } catch (e) {}
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
}): string {
  const buttonSelector = options.buttonIds.map((id) => `#${id}`).join(", ");
  return `(function () {
  var STORAGE_KEY = ${JSON.stringify(PANEL_FLOATING_AGENT_STORAGE_KEY)};
  var FLOAT_ROOT_ID = ${JSON.stringify(options.floatingRootId)};
  var BUTTON_SELECTOR = ${JSON.stringify(buttonSelector)};
  var TRAVEL_MS = 580;
  var avatarSrc = ${JSON.stringify(PANEL_FLOATING_AGENT_AVATAR)};
  var buttons = [];
  var animating = false;

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function readStoredVisible() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "false") return false;
      if (raw === "true") return true;
    } catch (e) {}
    return true;
  }

  function writeStoredVisible(visible) {
    try {
      localStorage.setItem(STORAGE_KEY, visible ? "true" : "false");
    } catch (e) {}
  }

  function applyBodyClass(visible) {
    if (!document.body) return;
    document.body.classList.toggle("tva-floating-agent-hidden", !visible);
    document.documentElement.classList.remove("tva-floating-agent-prehidden");
  }

  function syncButtonState(btn, visible) {
    btn.setAttribute("aria-pressed", visible ? "true" : "false");
    btn.setAttribute("aria-label", visible ? "Ocultar agente flotante" : "Mostrar agente flotante");
    btn.classList.toggle("is-agent-live", visible);
    btn.classList.toggle("is-agent-dormant", !visible);
  }

  function syncButtons(visible) {
    buttons.forEach(function (btn) {
      syncButtonState(btn, visible);
    });
  }

  function getFloatingLauncherRect() {
    var floatRoot = document.getElementById(FLOAT_ROOT_ID);
    if (floatRoot) {
      var launcher =
        floatRoot.querySelector(".tva-launcher") ||
        floatRoot.querySelector(".tva-launcher-wrap") ||
        floatRoot;
      var rect = launcher.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return rect;
    }
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var size = rem * 4.25;
    var margin = rem * 1.25;
    return {
      left: window.innerWidth - size - margin,
      top: window.innerHeight - size - margin,
      width: size,
      height: size
    };
  }

  function rectCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function runTravelAnimation(fromRect, toRect, mode, done) {
    if (prefersReducedMotion()) {
      if (done) done();
      return;
    }
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
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        traveler.remove();
        document.body.classList.remove("tva-floating-agent-animating");
        if (done) done();
      }
    }
    window.requestAnimationFrame(frame);
  }

  function setFloatingAgentVisible(visible, opts) {
    opts = opts || {};
    var nextVisible = !!visible;
    var currentlyVisible = !document.body.classList.contains("tva-floating-agent-hidden");
    if (currentlyVisible === nextVisible) {
      syncButtons(nextVisible);
      return nextVisible;
    }
    if (animating) return currentlyVisible;
    writeStoredVisible(nextVisible);
    if (!opts.animate || !opts.sourceButton || prefersReducedMotion()) {
      applyBodyClass(nextVisible);
      syncButtons(nextVisible);
      return nextVisible;
    }
    animating = true;
    var sourceRect = opts.sourceButton.getBoundingClientRect();
    var launcherRect = getFloatingLauncherRect();
    if (nextVisible) {
      syncButtons(false);
      runTravelAnimation(sourceRect, launcherRect, "show", function () {
        applyBodyClass(true);
        syncButtons(true);
        animating = false;
      });
    } else {
      syncButtons(true);
      runTravelAnimation(launcherRect, sourceRect, "hide", function () {
        applyBodyClass(false);
        syncButtons(false);
        animating = false;
      });
    }
    return nextVisible;
  }

  function bindButtons() {
    buttons = Array.prototype.slice.call(document.querySelectorAll(BUTTON_SELECTOR));
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var currentlyVisible = !document.body.classList.contains("tva-floating-agent-hidden");
        setFloatingAgentVisible(!currentlyVisible, {
          animate: true,
          sourceButton: btn
        });
      });
    });
  }

  function initToggleUi() {
    if (!document.body) return;
    var visible = readStoredVisible();
    applyBodyClass(visible);
    bindButtons();
    syncButtons(visible);
  }

  if (document.body) initToggleUi();
  else document.addEventListener("DOMContentLoaded", initToggleUi, { once: true });
})();`;
}
