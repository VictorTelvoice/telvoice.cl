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

  function categoryUrl(href) {
    return root() + "ayuda/" + href;
  }

  function categoryIcon(slug) {
    var icons = {
      "primeros-pasos": "rocket_launch",
      "envio-de-sms": "sms",
      "reportes-y-seguimiento": "monitoring",
      "cuenta-y-acceso": "manage_accounts",
      "preguntas-frecuentes": "quiz",
    };
    return icons[slug] || "folder";
  }

  function renderHeader(active) {
    var r = root();
    return (
      '<header class="hc-header">' +
      '<div class="hc-header-inner">' +
      '<a class="hc-brand" href="' +
      r +
      '" aria-label="telvoice.cl, ir al inicio">' +
      '<img src="' +
      r +
      'assets/telvoice-isotipo.png" alt="" width="40" height="40" class="hc-brand-logo" decoding="async" aria-hidden="true" />' +
      '<span class="hc-brand-text">telvoice<span class="domain">.cl</span></span></a>' +
      '<nav class="hc-nav" aria-label="Navegación">' +
      '<a href="' +
      r +
      'ayuda/"' +
      (active === "home" ? ' class="is-active"' : "") +
      ">Centro de ayuda</a>" +
      '<a href="' +
      r +
      '#calculadora">Precios</a>' +
      '<a href="' +
      r +
      '#contacto">Contacto</a>' +
      '<a class="hc-nav-cta" href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
      "</nav></div></header>"
    );
  }

  function renderFooter() {
    var r = root();
    return (
      '<footer class="hc-site-footer" role="contentinfo">' +
      '<div class="hc-site-footer-inner">' +
      '<div class="hc-site-footer-grid">' +
      '<div class="hc-site-footer-brand">' +
      '<a href="' +
      r +
      '" class="hc-site-footer-logo-link" aria-label="telvoice.cl, ir al inicio">' +
      '<img src="' +
      r +
      'assets/telvoice-isotipo.png" alt="" width="40" height="40" class="hc-site-footer-logo" decoding="async" aria-hidden="true" />' +
      '<span class="hc-site-footer-logo-text">telvoice<span>.cl</span></span></a>' +
      "<p>SMS masivos para empresas en Chile: bolsas prepago, precios por volumen, pago online y API.</p>" +
      '<a href="' +
      r +
      '#calculadora" class="hc-site-footer-cta">Calcular precio</a>' +
      "</div>" +
      '<div class="hc-site-footer-col">' +
      '<p class="hc-site-footer-label">Telvoice.cl</p>' +
      "<ul>" +
      '<li><a href="' +
      r +
      '#inicio">SMS masivos Chile</a></li>' +
      '<li><a href="' +
      r +
      '#precios">Bolsas SMS</a></li>' +
      '<li><a href="' +
      r +
      '#api">API SMS</a></li>' +
      '<li><a href="' +
      r +
      '#empresas">Empresas</a></li>' +
      '<li><a href="' +
      r +
      '#contacto">Contacto</a></li>' +
      "</ul></div>" +
      '<div class="hc-site-footer-col">' +
      '<p class="hc-site-footer-label">Recursos</p>' +
      "<ul>" +
      '<li><a href="' +
      r +
      '#calculadora">Calculadora</a></li>' +
      '<li><a href="' +
      r +
      '#casos-uso">Casos de uso</a></li>' +
      '<li><a href="' +
      r +
      'ayuda/">Centro de ayuda</a></li>' +
      '<li><a href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Portal cliente</a></li>' +
      "</ul></div>" +
      '<div class="hc-site-footer-col">' +
      '<p class="hc-site-footer-label">Legal</p>' +
      "<ul>" +
      '<li><a href="' +
      r +
      'terminos-y-condiciones/">Términos y condiciones</a></li>' +
      '<li><a href="' +
      r +
      'politica-de-privacidad/">Política de privacidad</a></li>' +
      '<li><a href="' +
      r +
      'uso-responsable/">Uso responsable</a></li>' +
      "</ul></div>" +
      "</div>" +
      '<div class="hc-site-footer-bottom">' +
      "<p>© 2026 Telvoice.cl. Todos los derechos reservados.</p>" +
      "<p>Mensajería empresarial · Chile</p>" +
      "</div></div></footer>"
    );
  }

  function renderCard(opts) {
    var icon = opts.icon || "article";
    var meta = opts.meta
      ? '<span class="hc-card-badge">' + esc(opts.meta) + "</span>"
      : "";
    return (
      '<a class="hc-card" href="' +
      esc(opts.href) +
      '">' +
      '<div class="hc-card-top">' +
      '<span class="hc-card-icon material-symbols-outlined" aria-hidden="true">' +
      icon +
      "</span>" +
      meta +
      "</div>" +
      "<h3>" +
      esc(opts.title) +
      "</h3>" +
      "<p>" +
      esc(opts.description) +
      '</p><span class="hc-card-cta">Ver guía <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></span></a>'
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

  function articlesByCategory(slug) {
    return allArticles().filter(function (a) {
      return a.category === slug;
    });
  }

  window.HC_UTILS = {
    root: root,
    esc: esc,
    articleUrl: articleUrl,
    categoryUrl: categoryUrl,
    categoryIcon: categoryIcon,
    renderCard: renderCard,
    mountShell: mountShell,
    allArticles: allArticles,
    articlesByCategory: articlesByCategory,
  };
})();
