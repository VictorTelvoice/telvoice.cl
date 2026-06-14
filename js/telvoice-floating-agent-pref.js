(function () {
  var STORAGE_KEY = "telvoice:floating-agent-visible";

  function applyHiddenToBody() {
    if (!document.body) {
      return;
    }
    document.body.classList.add("tva-floating-agent-hidden");
    document.documentElement.classList.remove("tva-floating-agent-prehidden");
  }

  try {
    if (localStorage.getItem(STORAGE_KEY) === "false") {
      if (document.body) {
        applyHiddenToBody();
      } else {
        document.documentElement.classList.add("tva-floating-agent-prehidden");
        document.addEventListener("DOMContentLoaded", applyHiddenToBody, { once: true });
      }
    }
  } catch (e) {
    /* ignore */
  }
})();
