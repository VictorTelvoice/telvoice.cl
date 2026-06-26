(function () {
  var SURFACE = "public";
  var STORAGE_KEY = "telvoice:floating-agent-state:" + SURFACE;
  var LEGACY_KEY = "telvoice:floating-agent-visible";
  var TRAVEL_MS = 580;
  var animating = false;
  var avatarSrc = "assets/telvoice-agent-nav-toggle.png";
  var restoreChip = null;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function readState() {
    if (window.TelvoiceFloatingAgentState) {
      return window.TelvoiceFloatingAgentState.readState(SURFACE);
    }
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "open" || stored === "minimized" || stored === "hidden") {
        return stored;
      }
      if (localStorage.getItem(LEGACY_KEY) === "false") {
        return "hidden";
      }
    } catch (e) {
      /* ignore */
    }
    return "open";
  }

  function writeState(state) {
    if (window.TelvoiceFloatingAgentState) {
      window.TelvoiceFloatingAgentState.writeState(SURFACE, state);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, state);
      if (state === "hidden" || state === "minimized") {
        localStorage.setItem(LEGACY_KEY, "false");
      } else if (state === "open") {
        localStorage.setItem(LEGACY_KEY, "true");
      }
    } catch (e) {
      /* ignore */
    }
  }

  function floatRoot() {
    return document.getElementById("telvoice-web-agent");
  }

  function isFloatHidden(state) {
    return state === "hidden" || state === "minimized";
  }

  function ensureNavToggle() {
    return document.getElementById("nav-floating-agent-toggle");
  }

  function syncNavToggle(state) {
    var btn = ensureNavToggle();
    if (!btn) {
      return;
    }
    var isLive = state === "open";
    btn.classList.toggle("is-agent-live", isLive);
    btn.classList.toggle("is-agent-dormant", !isLive && state === "hidden");
    btn.classList.toggle("is-agent-minimized", state === "minimized");
    btn.setAttribute("aria-pressed", isLive ? "true" : "false");
    var label = isLive ? "Ocultar agente" : "Mostrar agente";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  }

  function ensureRestoreChip() {
    if (restoreChip && document.body.contains(restoreChip)) {
      return restoreChip;
    }

    var existing = document.getElementById("tva-floating-agent-restore");
    if (existing) {
      restoreChip = existing;
      return restoreChip;
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "tva-floating-agent-restore";
    btn.className = "tva-floating-agent-restore";
    btn.setAttribute("aria-label", "Mostrar agente");
    btn.setAttribute("title", "Mostrar agente");
    btn.hidden = true;
    btn.innerHTML =
      '<img src="' +
      avatarSrc +
      '" alt="" class="tva-floating-agent-restore__avatar" width="32" height="32" decoding="async" />' +
      '<span class="tva-floating-agent-restore__label">Mostrar agente</span>';
    document.body.appendChild(btn);
    restoreChip = btn;
    return restoreChip;
  }

  function syncRestoreChip(state) {
    var chip = ensureRestoreChip();
    var show = state === "minimized";
    chip.hidden = !show;
    chip.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function applyState(state) {
    if (window.TelvoiceFloatingAgentState) {
      window.TelvoiceFloatingAgentState.applyDomState(state, floatRoot());
    } else if (document.body) {
      document.body.classList.toggle("tva-floating-agent-hidden", state === "hidden");
      document.body.classList.toggle("tva-floating-agent-minimized", state === "minimized");
      document.documentElement.classList.remove("tva-floating-agent-prehidden");
    }

    syncRestoreChip(state);
    syncNavToggle(state);

    if (isFloatHidden(state)) {
      document.dispatchEvent(new CustomEvent("telvoice:agent-panel-close"));
    }
  }

  function getRestoreChipRect() {
    var chip = ensureRestoreChip();
    var wasHidden = chip.hidden;
    chip.hidden = false;
    chip.classList.add("is-measuring");
    var rect = chip.getBoundingClientRect();
    chip.classList.remove("is-measuring");
    if (wasHidden) {
      chip.hidden = true;
    }
    return rect;
  }

  function getNavToggleRect() {
    var btn = ensureNavToggle();
    if (btn) {
      return btn.getBoundingClientRect();
    }
    return getRestoreChipRect();
  }

  function getFloatingLauncherRect() {
    var root = floatRoot();
    if (root) {
      var launcher =
        root.querySelector(".tva-launcher") ||
        root.querySelector(".tva-launcher-wrap") ||
        root;
      var rect = launcher.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return rect;
      }
    }

    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var size = rem * 10.13 * 0.85;
    var margin = rem;
    return {
      left: window.innerWidth - size - margin,
      top: window.innerHeight - size - margin,
      width: size,
      height: size,
    };
  }

  function getAgentVisibleRect() {
    var root = floatRoot();
    if (root) {
      var panel = root.querySelector(".tva-panel");
      if (panel) {
        var panelRect = panel.getBoundingClientRect();
        if (panelRect.width > 0 && panelRect.height > 0) {
          return panelRect;
        }
      }
      var launcher =
        root.querySelector(".tva-launcher") ||
        root.querySelector(".tva-launcher-wrap") ||
        root;
      var launcherRect = launcher.getBoundingClientRect();
      if (launcherRect.width > 0 && launcherRect.height > 0) {
        return launcherRect;
      }
    }
    return getFloatingLauncherRect();
  }

  function rectCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function runTravelAnimation(fromRect, toRect, mode, done) {
    if (prefersReducedMotion()) {
      if (done) {
        done();
      }
      return;
    }

    var fromCenter = rectCenter(fromRect);
    var toCenter = rectCenter(toRect);
    var startSize = Math.max(fromRect.width, fromRect.height, 44);
    var endSize = Math.max(toRect.width, toRect.height, 44);

    var traveler = document.createElement("div");
    traveler.className =
      "tva-floating-agent-traveler " + (mode === "show" ? "is-travel-on" : "is-travel-off");
    traveler.innerHTML =
      '<img src="' + avatarSrc + '" alt="" width="64" height="64" decoding="async" />';
    document.body.appendChild(traveler);
    document.body.classList.add("tva-floating-agent-animating");

    var start = null;

    function frame(ts) {
      if (!start) {
        start = ts;
      }
      var progress = Math.min(1, (ts - start) / TRAVEL_MS);
      var eased = 1 - Math.pow(1 - progress, 3);
      var cx = fromCenter.x + (toCenter.x - fromCenter.x) * eased;
      var cy = fromCenter.y + (toCenter.y - fromCenter.y) * eased;
      var size = startSize + (endSize - startSize) * eased;
      var fade = mode === "hide" ? 1 - progress * 0.35 : 0.82 + progress * 0.18;

      traveler.style.width = size + "px";
      traveler.style.height = size + "px";
      traveler.style.transform =
        "translate3d(" + (cx - size / 2) + "px," + (cy - size / 2) + "px, 0)";
      traveler.style.opacity = String(fade);

      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        traveler.remove();
        document.body.classList.remove("tva-floating-agent-animating");
        if (done) {
          done();
        }
      }
    }

    window.requestAnimationFrame(frame);
  }

  function dockHideToCorner() {
    if (animating) {
      return;
    }
    var state = readState();
    if (state === "minimized") {
      applyState("minimized");
      return;
    }
    if (state === "hidden") {
      applyState("hidden");
      return;
    }
    var chip = ensureRestoreChip();
    setAgentState("minimized", { animate: true, sourceButton: chip });
  }

  function setAgentState(nextState, options) {
    var opts = options || {};
    var current = readState();

    if (current === nextState) {
      applyState(nextState);
      return nextState;
    }
    if (animating) {
      return current;
    }

    writeState(nextState);

    if (!opts.animate || prefersReducedMotion()) {
      applyState(nextState);
      return nextState;
    }

    animating = true;
    var launcherRect = getFloatingLauncherRect();
    var targetRect = opts.sourceButton
      ? opts.sourceButton.getBoundingClientRect()
      : isFloatHidden(nextState)
        ? getNavToggleRect()
        : getRestoreChipRect();

    if (isFloatHidden(nextState)) {
      runTravelAnimation(launcherRect, targetRect, "hide", function () {
        applyState(nextState);
        animating = false;
      });
    } else {
      syncRestoreChip("open");
      applyState("open");
      runTravelAnimation(targetRect, launcherRect, "show", function () {
        applyState("open");
        animating = false;
      });
    }

    return nextState;
  }

  function bindRestoreChip() {
    var chip = ensureRestoreChip();
    chip.addEventListener("click", function (e) {
      e.preventDefault();
      setAgentState("open", { animate: true, sourceButton: chip });
    });
  }

  function bindNavToggle() {
    var btn = ensureNavToggle();
    if (!btn || btn.dataset.bound === "1") {
      return;
    }
    btn.dataset.bound = "1";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var state = readState();
      if (state === "open") {
        setAgentState("hidden", { animate: true, sourceButton: btn });
      } else {
        setAgentState("open", { animate: true, sourceButton: btn });
      }
    });
  }

  function runEntryAnimation() {
    var state = readState();
    if (state !== "open") {
      return;
    }
    var root = floatRoot();
    if (!root || prefersReducedMotion()) {
      return;
    }
    var key = "telvoice:floating-agent-entry:" + SURFACE;
    try {
      if (sessionStorage.getItem(key) === "1") {
        return;
      }
      sessionStorage.setItem(key, "1");
    } catch (e) {
      return;
    }
    root.classList.add("tva-root--entry-reveal");
    window.setTimeout(function () {
      root.classList.remove("tva-root--entry-reveal");
    }, 700);
  }

  document.addEventListener("telvoice:agent-chrome", function (ev) {
    var action = ev && ev.detail ? ev.detail.action : "";
    if (action === "hide") {
      setAgentState("hidden", { animate: false });
    } else if (action === "minimize") {
      dockHideToCorner();
    } else if (action === "restore") {
      setAgentState("open", { animate: false });
    }
  });

  function reconcileStorageDesync() {
    try {
      var state = localStorage.getItem(STORAGE_KEY);
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (state === "open" && legacy === "false") {
        localStorage.setItem(LEGACY_KEY, "true");
        if (document.body) {
          document.body.classList.remove("tva-floating-agent-hidden");
          document.body.classList.remove("tva-floating-agent-minimized");
        }
        document.documentElement.classList.remove("tva-floating-agent-prehidden");
      }
    } catch (e) {
      /* ignore */
    }
  }

  function initToggleUi() {
    if (!document.body) {
      return;
    }

    reconcileStorageDesync();
    var state = readState();

    ensureRestoreChip();
    bindRestoreChip();
    bindNavToggle();
    applyState(state);

    var runEntry = function () {
      runEntryAnimation();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runEntry, { timeout: 5000 });
    } else {
      window.setTimeout(runEntry, 2200);
    }
  }

  window.TelvoiceFloatingAgent = {
    isVisible: function () {
      return readState() === "open";
    },
    readState: function () {
      return readState();
    },
    setState: setAgentState,
    setVisible: function (visible, options) {
      return setAgentState(visible ? "open" : "hidden", options);
    },
  };

  if (document.body) {
    initToggleUi();
  } else {
    document.addEventListener("DOMContentLoaded", initToggleUi, { once: true });
  }
})();
