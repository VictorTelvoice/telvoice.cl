(function () {
  var HC = window.HELP_CENTER;
  if (!HC) return;

  function root() {
    return document.body.getAttribute("data-hc-root") || "../";
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function articleUrl(slug, category) {
    return root() + "ayuda/" + category + "/" + slug + "/";
  }

  function renderHeader(active) {
    var r = root();
    return (
      '<header class="hc-header">' +
      '<div class="hc-header-inner">' +
      '<a class="hc-brand" href="' +
      r +
      '">' +
      '<img src="' +
      r +
      'assets/telvoice-isotipo.png" alt="Telvoice" width="36" height="36" decoding="async" />' +
      '<span>telvoice<span class="domain">.cl</span></span></a>' +
      '<nav class="hc-nav" aria-label="Ayuda">' +
      '<a href="' +
      r +
      'ayuda/"' +
      (active === "home" ? ' class="is-active"' : "") +
      ">Centro de ayuda</a>" +
      '<a href="' +
      r +
      '#contacto">Contacto</a>' +
      '<a href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
      "</nav></div></header>"
    );
  }

  function renderFooter() {
    var r = root();
    return (
      '<footer class="hc-footer">' +
      '<p>© Telvoice.cl · <a href="' +
      r +
      '">Volver al sitio</a> · <a href="' +
      r +
      'ayuda/">Centro de ayuda</a></p>' +
      "</footer>"
    );
  }

  function mountShell(active) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      renderHeader(active) + '<main class="hc-main" id="hc-main"></main>' + renderFooter()
    );
    return document.getElementById("hc-main");
  }

  function allArticles() {
    return Object.keys(HC.articles).map(function (k) {
      return HC.articles[k];
    });
  }

  window.HC_UTILS = {
    root: root,
    esc: esc,
    articleUrl: articleUrl,
    mountShell: mountShell,
    allArticles: allArticles,
  };
})();
