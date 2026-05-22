/**
 * Carga CSS + widget del agente comercial en todas las páginas.
 * Uso: <script src="…/js/telvoice-web-agent-loader.js" data-root=""></script>
 * data-root: prefijo hasta la raíz del sitio ("" en home, "../" en ayuda/, etc.)
 */
(function () {
  var script = document.currentScript;
  if (!script) {
    return;
  }
  var root = script.getAttribute("data-root");
  if (root == null) {
    root = "";
  }
  window.TELVOICE_WEB_AGENT_ROOT = root;

  function loadCss(href) {
    if (document.querySelector('link[data-tva-css="1"]')) {
      return;
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-tva-css", "1");
    document.head.appendChild(link);
  }

  function loadJs(src) {
    if (document.querySelector('script[data-tva-js="1"]')) {
      return;
    }
    var s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-tva-js", "1");
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

  loadCss(root + "css/telvoice-web-agent.css");
  ensureConfig(function () {
    loadJs(root + "js/telvoice-web-agent.js");
  });
})();
