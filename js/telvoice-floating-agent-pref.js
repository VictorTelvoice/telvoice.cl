(function () {
  var SURFACE = "public";
  var LEGACY_KEY = "telvoice:floating-agent-visible";

  function storageKey() {
    return "telvoice:floating-agent-state:" + SURFACE;
  }

  function readState() {
    try {
      var stored = localStorage.getItem(storageKey());
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

  function applyState(state) {
    if (!document.body) {
      return;
    }
    document.body.classList.toggle("tva-floating-agent-hidden", state === "hidden");
    document.body.classList.toggle("tva-floating-agent-minimized", state === "minimized");
    document.documentElement.classList.remove("tva-floating-agent-prehidden");
  }

  var state = readState();
  if (state === "hidden" || state === "minimized") {
    if (document.body) {
      applyState(state);
    } else {
      document.documentElement.classList.add("tva-floating-agent-prehidden");
      document.addEventListener(
        "DOMContentLoaded",
        function () {
          applyState(readState());
        },
        { once: true },
      );
    }
  }
})();
