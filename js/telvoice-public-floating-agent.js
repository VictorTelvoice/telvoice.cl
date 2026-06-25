/**
 * Agente flotante público unificado — mismo stack/UI que el landing principal.
 *
 * Uso estático:
 *   <script src="{root}js/telvoice-public-floating-agent.js" data-root=""></script>
 * Opcional (solo landing con hero embed):
 *   data-embed-target="#hero-agent-embed"
 *
 * Uso dinámico (p. ej. centro de ayuda):
 *   TELVOICE_PUBLIC_FLOATING_AGENT.mount({ root: "../" });
 */
(function () {
  "use strict";

  var VERSION = "20260625";
  var booted = false;

  function escAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function getScript() {
    return (
      document.currentScript ||
      document.querySelector('script[src*="telvoice-public-floating-agent.js"]')
    );
  }

  function cssLoaded(part) {
    return !!document.querySelector('link[href*="' + part + '"]');
  }

  function scriptLoaded(part) {
    return !!document.querySelector('script[src*="' + part + '"]');
  }

  function loadScript(src, part, onload) {
    if (part && scriptLoaded(part)) {
      if (onload) onload();
      return;
    }
    var s = document.createElement("script");
    s.src = src;
    s.async = false;
    if (onload) s.onload = onload;
    (document.body || document.head).appendChild(s);
  }

  function ensureStyles(root) {
    if (!cssLoaded("telvoice-floating-agent-toggle")) {
      var toggleCss = document.createElement("link");
      toggleCss.rel = "stylesheet";
      toggleCss.href = root + "css/telvoice-floating-agent-toggle.css?v=" + VERSION;
      document.head.appendChild(toggleCss);
    }
    if (!document.querySelector('link[data-tva-css="1"]')) {
      var agentCss = document.createElement("link");
      agentCss.rel = "stylesheet";
      agentCss.href = root + "css/telvoice-web-agent.css?v=20260615";
      agentCss.setAttribute("data-tva-css", "1");
      document.head.appendChild(agentCss);
    }
  }

  function loadAgentLoader(root, embedTarget) {
    if (scriptLoaded("telvoice-web-agent-loader")) {
      return;
    }
    var loader = document.createElement("script");
    loader.src = root + "js/telvoice-web-agent-loader.js";
    loader.setAttribute("data-root", root);
    loader.setAttribute("data-ui", "lab");
    if (embedTarget) {
      loader.setAttribute("data-embed-target", embedTarget);
    }
    document.body.appendChild(loader);
  }

  function mount(opts) {
    opts = opts || {};
    if (booted) {
      return;
    }
    booted = true;

    var root = opts.root != null ? opts.root : "";
    var embedTarget = opts.embedTarget || "";

    window.TELVOICE_WEB_AGENT_UI = "lab";
    ensureStyles(root);

    loadScript(root + "js/telvoice-floating-agent-state.js?v=20260617", "telvoice-floating-agent-state", function () {
      loadScript(root + "js/telvoice-floating-agent-pref.js?v=20260617", "telvoice-floating-agent-pref", function () {
        function loadToggleAndAgent() {
          loadScript(root + "js/telvoice-floating-agent-toggle.js?v=20260625", "telvoice-floating-agent-toggle", function () {
            loadAgentLoader(root, embedTarget);
          });
        }
        if (document.body) {
          loadToggleAndAgent();
        } else {
          document.addEventListener("DOMContentLoaded", loadToggleAndAgent, { once: true });
        }
      });
    });
  }

  window.TELVOICE_PUBLIC_FLOATING_AGENT = {
    mount: mount,
    version: VERSION,
  };

  var script = getScript();
  if (script && script.getAttribute("data-init") !== "manual") {
    mount({
      root: script.getAttribute("data-root") || "",
      embedTarget: script.getAttribute("data-embed-target") || "",
    });
  }
})();
