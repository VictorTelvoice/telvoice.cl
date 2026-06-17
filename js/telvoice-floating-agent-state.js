/**
 * Estado del agente flotante por superficie: public | panel | admin
 * Valores persistidos: open | minimized | hidden
 * Panel cerrado con launcher visible = open (estado UI local, no persisted como hidden).
 */
(function (global) {
  var LEGACY_KEY = "telvoice:floating-agent-visible";

  function storageKey(surface) {
    return "telvoice:floating-agent-state:" + (surface || "public");
  }

  function entrySessionKey(surface) {
    return "telvoice:floating-agent-entry:" + (surface || "public");
  }

  function normalizeState(value) {
    if (value === "open" || value === "minimized" || value === "hidden") {
      return value;
    }
    return null;
  }

  function readState(surface) {
    try {
      var key = storageKey(surface);
      var stored = normalizeState(localStorage.getItem(key));
      if (stored) {
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

  function writeState(surface, state) {
    try {
      localStorage.setItem(storageKey(surface), state);
      if (state === "hidden") {
        localStorage.setItem(LEGACY_KEY, "false");
      } else if (state === "open") {
        localStorage.setItem(LEGACY_KEY, "true");
      }
    } catch (e) {
      /* ignore */
    }
  }

  function applyDomState(state, rootEl) {
    var body = document.body;
    var root = document.documentElement;
    if (!body) {
      return;
    }
    body.classList.toggle("tva-floating-agent-hidden", state === "hidden");
    body.classList.toggle("tva-floating-agent-minimized", state === "minimized");
    root.classList.remove("tva-floating-agent-prehidden");
  }

  function hasEntryAnimated(surface) {
    try {
      return sessionStorage.getItem(entrySessionKey(surface)) === "1";
    } catch (e) {
      return true;
    }
  }

  function markEntryAnimated(surface) {
    try {
      sessionStorage.setItem(entrySessionKey(surface), "1");
    } catch (e) {
      /* ignore */
    }
  }

  global.TelvoiceFloatingAgentState = {
    readState: readState,
    writeState: writeState,
    applyDomState: applyDomState,
    hasEntryAnimated: hasEntryAnimated,
    markEntryAnimated: markEntryAnimated,
    storageKey: storageKey,
  };
})(window);
