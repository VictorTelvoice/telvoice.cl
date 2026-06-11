/**
 * Carga CSS + widget del agente comercial en todas las páginas.
 * Uso: <script src="…/js/telvoice-web-agent-loader.js" data-root=""></script>
 * data-root: prefijo hasta la raíz del sitio ("" en home, "../" en ayuda/, etc.)
 */
(function () {
  var script =
    document.currentScript ||
    document.querySelector('script[src*="telvoice-web-agent-loader.js"]');
  if (!script) {
    return;
  }
  var root = script.getAttribute("data-root");
  if (root == null) {
    root = "";
  }
  window.TELVOICE_WEB_AGENT_ROOT = root;

  var embedTarget = script.getAttribute("data-embed-target");
  if (embedTarget) {
    window.TELVOICE_WEB_AGENT_EMBED = embedTarget;
  }

  var AGENT_JS_VERSION = "20260716";

  function injectBootStyles() {
    if (document.getElementById("tva-boot-style")) {
      return;
    }
    var boot = document.createElement("style");
    boot.id = "tva-boot-style";
    boot.textContent =
      "#telvoice-web-agent{position:fixed;bottom:1rem;right:1rem;z-index:99990;visibility:hidden;pointer-events:none}" +
      "#telvoice-web-agent.tva-root--ready{visibility:visible;pointer-events:auto}" +
      "#telvoice-web-agent .tva-panel:not(.is-open){display:none!important}" +
      "#telvoice-web-agent .tva-launcher-iso,#telvoice-web-agent .tva-launcher img{width:8.104rem;height:8.104rem;max-width:8.104rem;max-height:8.104rem}" +
      ".hero-phone-slot--agent{display:flex;flex:1;align-items:center;justify-content:center;width:100%;min-width:0}" +
      ".hero-phone-float--agent{position:relative;display:flex;flex-direction:column;width:min(320px,90vw);height:min(640px,85svh,85vh);max-width:100%;border-radius:48px;border:12px solid #dae2fd;background:#131b2e;overflow:hidden;box-sizing:border-box}" +
      ".hero-phone-screen{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:3.75rem 0 0}" +
      ".hero-phone-header{display:flex;align-items:flex-start;gap:.75rem;flex-shrink:0;padding:0 .65rem .65rem}" +
      ".hero-phone-header-logo,.hero-phone-header-logo.tva-agent-iso-slot{width:3rem;height:3rem;flex-shrink:0;overflow:hidden}" +
      ".hero-phone-header-logo img,.hero-phone-header-logo picture,.hero-phone-header-logo .telvoice-agent-avatar,.hero-phone-header-logo .telvoice-agent-avatar__img{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}" +
      ".hero-phone-agent-embed{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}" +
      "#telvoice-web-agent-embed:not(.tva-root--ready){visibility:hidden}" +
      "#telvoice-web-agent-embed.tva-root--ready{visibility:visible}";
    document.head.appendChild(boot);
  }

  function waitForStylesheet(link, cb) {
    if (!cb) {
      return;
    }
    if (link.sheet) {
      cb();
      return;
    }
    function finish() {
      link.removeEventListener("load", finish);
      link.removeEventListener("error", finish);
      cb();
    }
    link.addEventListener("load", finish);
    link.addEventListener("error", finish);
  }

  function loadCss(href, cb) {
    var existing = document.querySelector('link[data-tva-css="1"]');
    if (existing) {
      waitForStylesheet(existing, cb);
      return;
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href + (href.indexOf("?") >= 0 ? "&" : "?") + "v=" + AGENT_JS_VERSION;
    link.setAttribute("data-tva-css", "1");
    waitForStylesheet(link, cb);
    document.head.appendChild(link);
  }

  function loadJs(src) {
    var versionedSrc =
      src + (src.indexOf("?") >= 0 ? "&" : "?") + "v=" + AGENT_JS_VERSION;
    var existing = document.querySelector('script[data-tva-js="1"]');
    if (existing) {
      if (existing.src.indexOf("v=" + AGENT_JS_VERSION) >= 0) {
        if (typeof window.TELVOICE_WEB_AGENT_INIT === "function") {
          window.TELVOICE_WEB_AGENT_INIT();
        }
        return;
      }
      existing.remove();
    }
    var s = document.createElement("script");
    s.src = versionedSrc;
    s.defer = true;
    s.setAttribute("data-tva-js", "1");
    s.onload = function () {
      if (typeof window.TELVOICE_WEB_AGENT_INIT === "function") {
        window.TELVOICE_WEB_AGENT_INIT();
      }
    };
    document.body.appendChild(s);
  }

  function ensureConfig(cb) {
    if (window.TELVOICE_CONFIG) {
      cb();
      return;
    }
    var cfg = document.createElement("script");
    cfg.src = root + "js/telvoice-config.js";
    cfg.onload = cb;
    cfg.onerror = function () {
      window.TELVOICE_CONFIG = {
        apiOrigin: window.location.origin,
        ivaRate: 0.19,
        volumeTiers: [
          { min: 1000, max: 4000, pxSMS: 10, label: "1.000 a 4.000 SMS" },
          { min: 5000, max: 9000, pxSMS: 9, label: "5.000 a 9.000 SMS" },
          { min: 10000, max: 14000, pxSMS: 8, label: "10.000 a 14.000 SMS" },
          { min: 15000, max: 49000, pxSMS: 7, label: "15.000 a 49.000 SMS" },
          { min: 50000, max: 90000, pxSMS: 6, label: "50.000 a 90.000 SMS" },
          { min: 100000, max: 120000, pxSMS: 5, label: "100.000 a 120.000 SMS" },
        ],
        whatsapp: { number: "56997980116", message: "Hola, quiero cotizar SMS." },
      };
      cb();
    };
    document.head.appendChild(cfg);
  }

  injectBootStyles();
  loadCss(root + "css/telvoice-web-agent.css", function () {
    ensureConfig(function () {
      loadJs(root + "js/telvoice-web-agent.js");
    });
  });
})();
