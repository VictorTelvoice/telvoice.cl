(function () {
  var STORAGE_KEY = "telvoice:floating-agent-visible";
  var buttons = [];

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

  function labelForButton(btn, visible) {
    var isMobile = btn.classList.contains("nav-floating-agent-toggle--mobile");
    if (isMobile) {
      btn.textContent = visible ? "Agente: ON" : "Agente: OFF";
      btn.setAttribute("aria-label", visible ? "Ocultar agente flotante" : "Mostrar agente flotante");
    } else {
      btn.textContent = visible ? "Ocultar agente" : "Mostrar agente";
      btn.setAttribute("aria-label", visible ? "Ocultar agente flotante" : "Mostrar agente flotante");
    }
    btn.setAttribute("aria-pressed", visible ? "true" : "false");
  }

  function syncButtons(visible) {
    buttons.forEach(function (btn) {
      labelForButton(btn, visible);
    });
  }

  function setFloatingAgentVisible(visible) {
    var nextVisible = !!visible;
    writeStoredVisible(nextVisible);
    applyBodyClass(nextVisible);
    syncButtons(nextVisible);
    return nextVisible;
  }

  function bindButtons() {
    buttons = Array.prototype.slice.call(
      document.querySelectorAll("#nav-floating-agent-toggle, #nav-floating-agent-toggle-mobile")
    );
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var currentlyVisible = !document.body.classList.contains("tva-floating-agent-hidden");
        setFloatingAgentVisible(!currentlyVisible);
      });
    });
  }

  function initToggleUi() {
    if (!document.body) {
      return;
    }
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
