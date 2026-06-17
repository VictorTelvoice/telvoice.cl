(function () {
  var STORAGE_KEY = "telvoice:floating-agent-visible";
  var TRAVEL_MS = 580;
  var buttons = [];
  var animating = false;
  var avatarSrc = "assets/telvoice-agent-nav-toggle.png";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function readStoredVisible() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "false") {
        return false;
      }
      if (raw === "true") {
        return true;
      }
    } catch (e) {
      /* ignore */
    }
    return true;
  }

  function writeStoredVisible(visible) {
    try {
      localStorage.setItem(STORAGE_KEY, visible ? "true" : "false");
    } catch (e) {
      /* ignore */
    }
  }

  function applyBodyClass(visible) {
    var body = document.body;
    var root = document.documentElement;
    if (!body) {
      return;
    }
    body.classList.toggle("tva-floating-agent-hidden", !visible);
    root.classList.remove("tva-floating-agent-prehidden");
  }

  function resolveAvatarSrc() {
    var img = document.querySelector(".nav-floating-agent-toggle__avatar");
    if (img && img.getAttribute("src")) {
      avatarSrc = img.getAttribute("src");
    }
  }

  function syncButtonState(btn, visible) {
    btn.setAttribute("aria-pressed", visible ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      visible ? "Ocultar agente flotante" : "Mostrar agente flotante"
    );
    btn.classList.toggle("is-agent-live", visible);
    btn.classList.toggle("is-agent-dormant", !visible);
  }

  function syncButtons(visible) {
    buttons.forEach(function (btn) {
      syncButtonState(btn, visible);
    });
  }

  function getFloatingLauncherRect() {
    var floatRoot = document.getElementById("telvoice-web-agent");
    if (floatRoot) {
      var launcher =
        floatRoot.querySelector(".tva-launcher") ||
        floatRoot.querySelector(".tva-launcher-wrap") ||
        floatRoot;
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
      traveler.style.transform = "translate3d(" + (cx - size / 2) + "px," + (cy - size / 2) + "px, 0)";
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

  function setFloatingAgentVisible(visible, options) {
    var opts = options || {};
    var nextVisible = !!visible;
    var currentlyVisible = !document.body.classList.contains("tva-floating-agent-hidden");

    if (currentlyVisible === nextVisible) {
      syncButtons(nextVisible);
      return nextVisible;
    }

    if (animating) {
      return currentlyVisible;
    }

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
    buttons = Array.prototype.slice.call(
      document.querySelectorAll("#nav-floating-agent-toggle")
    );
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var currentlyVisible = !document.body.classList.contains("tva-floating-agent-hidden");
        setFloatingAgentVisible(!currentlyVisible, {
          animate: true,
          sourceButton: btn,
        });
      });
    });
  }

  function initToggleUi() {
    if (!document.body) {
      return;
    }
    resolveAvatarSrc();
    var visible = readStoredVisible();
    applyBodyClass(visible);
    bindButtons();
    syncButtons(visible);
  }

  window.TelvoiceFloatingAgent = {
    isVisible: function () {
      return !document.body.classList.contains("tva-floating-agent-hidden");
    },
    setVisible: setFloatingAgentVisible,
    readStoredVisible: readStoredVisible,
  };

  if (document.body) {
    initToggleUi();
  } else {
    document.addEventListener("DOMContentLoaded", initToggleUi, { once: true });
  }
})();
