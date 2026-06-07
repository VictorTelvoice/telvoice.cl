(function () {
  var HC = window.HELP_CENTER;
  if (!HC) return;

  function root() {
    return document.body.getAttribute("data-hc-root") || "../";
  }

  function labPath() {
    return root() + "landing-agent-lab/";
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

  function guideLabel(count) {
    if (count === 1) return "1 guía";
    return count + " guías";
  }

  var HC_SHELL = "lab-shell lab-section-inner py-10 md:py-14";
  var HC_GRID = "hc-grid mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3 md:gap-8";
  var HC_GRID_TWO = "hc-grid mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8";

  function renderBgWrap() {
    return (
      '<div class="lab-bg-wrap" aria-hidden="true">' +
      '<div class="lab-bg-radial lab-bg-radial--1"></div>' +
      '<div class="lab-bg-radial lab-bg-radial--2"></div>' +
      '<div class="lab-bg-radial lab-bg-radial--3"></div>' +
      '<div class="lab-bg-grid"></div></div>'
    );
  }

  function renderHeader(active) {
    var r = root();
    var lab = labPath();
    var activeClass = " is-active";
    return (
      '<nav class="lab-nav sticky top-0 z-50 w-full" aria-label="Navegación principal">' +
      '<div class="lab-shell flex justify-between items-center gap-4 py-4">' +
      '<a href="' +
      lab +
      '" class="lab-logo-link flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-lab-cyan" aria-label="Telvoice, ir al inicio">' +
      '<img src="' +
      r +
      'assets/telvoice-isotipo.png" alt="Telvoice" width="36" height="36" class="h-9 w-9 object-contain" decoding="async" />' +
      '<span class="font-h3 font-bold tracking-tight lowercase"><span class="lab-logo-word text-white">telvoice</span></span></a>' +
      '<ul class="hidden lg:flex gap-1 items-center">' +
      '<li><a class="lab-nav-link font-body text-sm rounded-full px-4 py-2' +
      (active === "home" ? activeClass : "") +
      '" href="' +
      r +
      'ayuda/">Centro de ayuda</a></li>' +
      '<li><a class="lab-nav-link font-body text-sm rounded-full px-4 py-2" href="' +
      lab +
      '#calculadora">Precios</a></li>' +
      '<li><a class="lab-nav-link font-body text-sm rounded-full px-4 py-2" href="' +
      lab +
      '#casos-uso">Casos de uso</a></li>' +
      '<li><a class="lab-nav-link font-body text-sm rounded-full px-4 py-2" href="' +
      lab +
      '#faq">FAQ</a></li>' +
      "</ul>" +
      '<div class="flex items-center gap-2 shrink-0">' +
      '<a class="lab-btn-primary lab-btn-nav hidden sm:inline-flex" href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
      '<button type="button" id="hc-menu-toggle" class="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-full border border-white/15 text-white" aria-expanded="false" aria-controls="hc-mobile-panel" aria-label="Abrir menú">' +
      '<span class="material-symbols-outlined" id="hc-menu-open">menu</span>' +
      '<span class="material-symbols-outlined hidden" id="hc-menu-close">close</span></button>' +
      "</div></div>" +
      '<div id="hc-mobile-panel" class="hidden lg:hidden border-t border-white/10 py-4 lab-shell">' +
      '<ul class="flex flex-col gap-1">' +
      '<li><a class="block lab-nav-link py-3 rounded-xl' +
      (active === "home" ? activeClass : "") +
      '" href="' +
      r +
      'ayuda/">Centro de ayuda</a></li>' +
      '<li><a class="block lab-nav-link py-3 rounded-xl" href="' +
      lab +
      '#calculadora">Precios</a></li>' +
      '<li><a class="block lab-nav-link py-3 rounded-xl" href="' +
      lab +
      '#casos-uso">Casos de uso</a></li>' +
      '<li><a class="block lab-nav-link py-3 rounded-xl" href="' +
      lab +
      '#faq">FAQ</a></li>' +
      "</ul>" +
      '<a class="lab-btn-primary w-full mt-3 text-center" href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
      "</div></nav>"
    );
  }

  function renderFooter() {
    var r = root();
    var lab = labPath();
    return (
      '<footer class="lab-footer" role="contentinfo">' +
      '<div class="lab-shell pt-14 pb-6">' +
      '<div class="grid grid-cols-1 gap-12 border-b border-white/10 pb-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-10">' +
      '<div class="lg:col-span-4">' +
      '<a href="' +
      lab +
      '" class="inline-flex items-center gap-2" aria-label="Telvoice, ir al inicio">' +
      '<img src="' +
      r +
      'assets/telvoice-isotipo.png" alt="" width="40" height="40" class="h-10 w-10 object-contain" aria-hidden="true" decoding="async" />' +
      '<span class="font-bold lowercase text-white lab-logo-word">telvoice</span></a>' +
      '<p class="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">Tutoriales y guías para usar el portal cliente Telvoice: envío de SMS, reportes DLR y gestión de cuenta.</p>' +
      "</div>" +
      '<div class="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-2 lg:col-span-8 lg:grid-cols-3">' +
      '<div><p class="text-xs font-bold uppercase tracking-wider text-slate-500">Producto</p><ul class="mt-4 space-y-3 text-sm">' +
      '<li><a href="' +
      lab +
      '#agente-telvoice">Agente Telvoice</a></li>' +
      '<li><a href="' +
      lab +
      'planes-agente.html">Planes del agente</a></li>' +
      '<li><a href="' +
      lab +
      '#numeracion">Números reales</a></li>' +
      '<li><a href="' +
      lab +
      '#calculadora">Bolsas SMS</a></li></ul></div>' +
      '<div><p class="text-xs font-bold uppercase tracking-wider text-slate-500">Recursos</p><ul class="mt-4 space-y-3 text-sm">' +
      '<li><a href="' +
      r +
      'ayuda/">Centro de ayuda</a></li>' +
      '<li><a href="' +
      lab +
      '#casos-uso">Casos de uso</a></li>' +
      '<li><a href="' +
      lab +
      '#faq">FAQ</a></li>' +
      '<li><a href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Portal cliente</a></li></ul></div>' +
      '<div class="col-span-2 sm:col-span-1"><p class="text-xs font-bold uppercase tracking-wider text-slate-500">Legal</p><ul class="mt-4 space-y-3 text-sm">' +
      '<li><a href="' +
      r +
      'terminos-y-condiciones/">Términos y condiciones</a></li>' +
      '<li><a href="' +
      r +
      'politica-de-privacidad/">Política de privacidad</a></li>' +
      '<li><a href="' +
      r +
      'uso-responsable/">Uso responsable</a></li></ul></div></div></div>' +
      '<div class="flex flex-col gap-4 pt-8 sm:flex-row sm:items-center sm:justify-between">' +
      '<p class="text-sm text-slate-500">© 2026 Telvoice.cl. Todos los derechos reservados.</p>' +
      '<p class="text-sm text-slate-600">Centro de ayuda · Chile</p></div></div></footer>'
    );
  }

  function faqCount() {
    return (HC.faqSections || []).reduce(function (n, sec) {
      return n + (sec.items ? sec.items.length : 0);
    }, 0);
  }

  function renderFaqItem(item) {
    return (
      '<details class="hc-faq-details group">' +
      '<summary class="hc-faq-summary">' +
      "<span>" +
      esc(item.question) +
      '</span><span class="material-symbols-outlined hc-faq-chevron shrink-0" aria-hidden="true">add</span></summary>' +
      '<div class="hc-faq-body">' +
      '<div class="hc-faq-answer">' +
      item.answer +
      "</div></div></details>"
    );
  }

  function renderFaqSections() {
    var lab = labPath();
    return (HC.faqSections || [])
      .map(function (sec) {
        var items = (sec.items || []).map(renderFaqItem).join("");
        return (
          '<section class="hc-faq-group" aria-labelledby="faq-sec-' +
          esc(sec.id) +
          '">' +
          '<h2 id="faq-sec-' +
          esc(sec.id) +
          '" class="lab-section-title text-xl md:text-2xl">' +
          esc(sec.title) +
          "</h2>" +
          (sec.description
            ? '<p class="mt-2 text-sm text-slate-400 leading-relaxed">' +
              esc(sec.description) +
              "</p>"
            : "") +
          '<div class="mt-4 space-y-3">' +
          items +
          "</div></section>"
        );
      })
      .join("") +
      '<p class="pt-4 text-center text-sm text-slate-400">¿Quieres comprar una bolsa o cotizar? Visita <a href="' +
      lab +
      '#calculadora" class="font-semibold text-lab-cyan hover:underline">Precios</a> o el <a href="' +
      lab +
      '" class="font-semibold text-lab-cyan hover:underline">Telvoice Lab</a>.</p>';
  }

  function renderCard(opts) {
    var badge = opts.meta
      ? '<span class="hc-card-badge shrink-0">' + esc(opts.meta) + "</span>"
      : "";
    return (
      '<a href="' +
      esc(opts.href) +
      '" class="hc-card lab-glass-card group">' +
      '<div class="mb-4 flex items-start justify-between gap-3">' +
      '<div class="hc-card-icon" aria-hidden="true">' +
      '<span class="material-symbols-outlined text-[1.5rem]">' +
      esc(opts.icon || "article") +
      "</span></div>" +
      badge +
      "</div>" +
      '<h3 class="font-h3 text-lg font-semibold text-white">' +
      esc(opts.title) +
      "</h3>" +
      '<p class="mt-3 flex-1 text-sm text-slate-400 leading-relaxed">' +
      esc(opts.description) +
      '</p><span class="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-lab-cyan">Ver guía <span class="material-symbols-outlined text-lg transition-transform group-hover:translate-x-0.5" aria-hidden="true">arrow_forward</span></span></a>'
    );
  }

  function bindMobileNav() {
    var toggle = document.getElementById("hc-menu-toggle");
    var panel = document.getElementById("hc-mobile-panel");
    var openIcon = document.getElementById("hc-menu-open");
    var closeIcon = document.getElementById("hc-menu-close");
    if (!toggle || !panel) return;
    toggle.addEventListener("click", function () {
      var open = panel.classList.toggle("hidden");
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      if (openIcon) openIcon.classList.toggle("hidden", !open);
      if (closeIcon) closeIcon.classList.toggle("hidden", open);
    });
  }

  function mountShell(active) {
    document.documentElement.className = "dark lab-theme";
    document.body.className = "font-body antialiased";
    document.body.insertAdjacentHTML(
      "afterbegin",
      renderBgWrap() +
        '<div class="lab-content">' +
        renderHeader(active) +
        '<main class="lab-section lab-section--tight-top" id="hc-main"></main>' +
        renderFooter() +
        "</div>"
    );
    bindMobileNav();
    if (!document.querySelector("script[data-tva-loader]")) {
      var agentLoader = document.createElement("script");
      agentLoader.src = root() + "js/telvoice-web-agent-loader.js";
      agentLoader.setAttribute("data-root", root());
      agentLoader.setAttribute("data-tva-loader", "1");
      document.body.appendChild(agentLoader);
    }
    var main = document.getElementById("hc-main");
    main.innerHTML = '<div class="' + HC_SHELL + '">';
    return main.firstElementChild;
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
    labPath: labPath,
    esc: esc,
    articleUrl: articleUrl,
    categoryUrl: categoryUrl,
    categoryIcon: categoryIcon,
    guideLabel: guideLabel,
    shellClass: HC_SHELL,
    gridClass: HC_GRID,
    gridTwoClass: HC_GRID_TWO,
    faqCount: faqCount,
    renderFaqSections: renderFaqSections,
    renderCard: renderCard,
    mountShell: mountShell,
    allArticles: allArticles,
    articlesByCategory: articlesByCategory,
  };
})();
