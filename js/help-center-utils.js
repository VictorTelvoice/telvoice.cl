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

  function guideLabel(count) {
    if (count === 1) return "1 guía";
    return count + " guías";
  }

  /** Mismo contenedor que casos de uso (section-inner) */
  var HC_SHELL = "section-inner py-stack-lg md:py-stack-xl";
  /** Grilla centrada como .casos-grid */
  var HC_GRID =
    "mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3 md:gap-8";
  var HC_GRID_TWO =
    "mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8";

  function renderHeader(active) {
    var r = root();
    return (
      '<nav class="bg-surface/90 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/30 w-full">' +
      '<div class="flex justify-between items-center gap-4 py-4 pl-4 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 lg:pl-28 lg:pr-10 max-w-container-max mx-auto">' +
      '<a href="' +
      r +
      '" class="flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="telvoice.cl, ir al inicio">' +
      '<img src="' +
      r +
      'assets/telvoice-isotipo.png" alt="" width="36" height="36" class="h-9 w-9 object-contain" decoding="async" aria-hidden="true" />' +
      '<span class="font-h3 text-h3 font-bold tracking-tight lowercase inline-flex items-baseline">' +
      '<span class="text-black">telvoice</span><span class="font-h3 text-body-lg font-bold tracking-tight hero-grad-text">.cl</span></span></a>' +
      '<ul class="hidden lg:flex gap-1 items-center">' +
      '<li><a class="font-body-md text-body-md rounded-full px-4 py-2 transition-colors ' +
      (active === "home"
        ? "text-primary bg-surface-container-low"
        : "text-on-surface-variant hover:text-primary hover:bg-surface-container-low") +
      '" href="' +
      r +
      'ayuda/">Centro de ayuda</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" href="' +
      r +
      '#precios">Precios</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" href="' +
      r +
      '#casos-uso">Casos de uso</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" href="' +
      r +
      '#contacto">Contacto</a></li>' +
      "</ul>" +
      '<div class="nav-actions flex items-center gap-2 shrink-0">' +
      '<a class="nav-sales-btn hidden sm:inline-flex bg-primary text-on-primary font-body-md px-5 py-2.5 rounded-full hover:bg-surface-tint transition-colors shadow-sm font-semibold" href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
      '<button type="button" id="hc-menu-toggle" class="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-full border border-outline-variant/60 text-on-background" aria-expanded="false" aria-controls="hc-mobile-panel" aria-label="Abrir menú">' +
      '<span class="material-symbols-outlined" id="hc-menu-open">menu</span>' +
      '<span class="material-symbols-outlined hidden" id="hc-menu-close">close</span></button>' +
      "</div></div>" +
      '<div id="hc-mobile-panel" class="hidden lg:hidden border-t border-outline-variant/30 bg-surface/95 backdrop-blur-md py-4 pl-4 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 max-w-container-max mx-auto">' +
      '<ul class="flex flex-col gap-1">' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      r +
      'ayuda/">Centro de ayuda</a></li>' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      r +
      '#precios">Precios</a></li>' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      r +
      '#contacto">Contacto</a></li>' +
      "</ul>" +
      '<a class="mt-2 block w-full rounded-full bg-primary py-3 text-center font-body-md font-semibold text-on-primary hover:bg-surface-tint" href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
      "</div></nav>"
    );
  }

  function renderFooter() {
    var r = root();
    return (
      '<footer class="bg-primary text-on-primary" role="contentinfo">' +
      '<div class="max-w-container-max mx-auto px-4 sm:px-margin-page pt-14 pb-6">' +
      '<div class="grid grid-cols-1 gap-12 border-b border-on-primary/20 pb-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-10">' +
      '<div class="lg:col-span-4">' +
      '<a href="' +
      r +
      '" class="inline-flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary" aria-label="telvoice.cl, ir al inicio">' +
      '<img src="' +
      r +
      'assets/telvoice-isotipo.png" alt="" width="40" height="40" class="h-10 w-10 object-contain" aria-hidden="true" decoding="async" />' +
      '<span class="font-h3 text-h3 font-bold tracking-tight lowercase inline-flex items-baseline text-on-primary">' +
      '<span>telvoice</span><span class="font-h3 text-body-lg font-bold leading-none">.cl</span></span></a>' +
      '<p class="mt-4 max-w-sm font-body-md text-body-md leading-relaxed text-on-primary/85">SMS masivos para empresas en Chile: bolsas prepago, precios por volumen, pago online y API.</p>' +
      '<div class="mt-6 flex flex-wrap gap-3">' +
      '<a href="' +
      r +
      '#calculadora" class="inline-flex items-center justify-center rounded-full bg-on-primary px-5 py-2.5 font-body-md text-body-md font-semibold text-primary shadow-sm transition hover:bg-primary-fixed hover:text-on-primary-fixed">Calcular precio</a>' +
      '<a href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center rounded-full border-2 border-on-primary/50 bg-transparent px-5 py-2.5 font-body-md text-body-md font-semibold text-on-primary transition hover:border-on-primary hover:bg-on-primary/10">Ir al portal</a>' +
      "</div></div>" +
      '<div class="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-2 lg:col-span-8 lg:grid-cols-3">' +
      '<div><p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Telvoice.cl</p><ul class="mt-4 space-y-3">' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      '#inicio">SMS masivos Chile</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      '#precios">Bolsas SMS</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      '#api">API SMS</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      '#empresas">Empresas</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      '#contacto">Contacto</a></li></ul></div>' +
      '<div><p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Recursos</p><ul class="mt-4 space-y-3">' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      '#calculadora">Calculadora</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      '#casos-uso">Casos de uso</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      'ayuda/">Centro de ayuda</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      esc(HC.portalUrl) +
      '" target="_blank" rel="noopener noreferrer">Portal cliente</a></li></ul></div>' +
      '<div class="col-span-2 sm:col-span-1"><p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Legal</p><ul class="mt-4 space-y-3">' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      'terminos-y-condiciones/">Términos y condiciones</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      'politica-de-privacidad/">Política de privacidad</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary" href="' +
      r +
      'uso-responsable/">Uso responsable</a></li></ul></div></div></div>' +
      '<div class="flex flex-col gap-4 pt-8 sm:flex-row sm:items-center sm:justify-between">' +
      '<p class="font-body-sm text-body-sm text-on-primary/65">© 2026 Telvoice.cl. Todos los derechos reservados.</p>' +
      '<p class="font-body-sm text-body-sm text-on-primary/55">Mensajería empresarial · Chile</p>' +
      "</div></div></footer>"
    );
  }

  function faqCount() {
    return (HC.faqSections || []).reduce(function (n, sec) {
      return n + (sec.items ? sec.items.length : 0);
    }, 0);
  }

  function renderFaqItem(item) {
    return (
      '<details class="faq-details group rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm open:border-primary/25 open:shadow-md">' +
      '<summary class="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-body-lg text-body-lg font-semibold text-on-background transition hover:bg-surface-container-low/80 sm:px-6 sm:py-5">' +
      "<span>" +
      esc(item.question) +
      '</span><span class="faq-chevron material-symbols-outlined shrink-0 text-on-surface-variant transition-transform duration-200" aria-hidden="true">add</span></summary>' +
      '<div class="border-t border-outline-variant/40 px-5 pb-5 pt-0 sm:px-6 sm:pb-6">' +
      '<div class="pt-4 font-body-md text-body-md leading-relaxed text-on-surface-variant">' +
      item.answer +
      "</div></div></details>"
    );
  }

  function renderFaqSections() {
    var r = root();
    return (HC.faqSections || [])
      .map(function (sec) {
        var items = (sec.items || []).map(renderFaqItem).join("");
        return (
          '<section class="faq-section-group" aria-labelledby="faq-sec-' +
          esc(sec.id) +
          '">' +
          '<h2 id="faq-sec-' +
          esc(sec.id) +
          '" class="font-h3 text-h3 text-on-background">' +
          esc(sec.title) +
          "</h2>" +
          (sec.description
            ? '<p class="mt-2 font-body-md text-body-md text-on-surface-variant leading-relaxed">' +
              esc(sec.description) +
              "</p>"
            : "") +
          '<div class="mt-4 space-y-3">' +
          items +
          "</div></section>"
        );
      })
      .join("") +
      '<p class="pt-4 text-center font-body-md text-body-md text-on-surface-variant">¿Quieres comprar una bolsa o cotizar? Visita <a href="' +
      r +
      '#precios" class="font-semibold text-primary hover:underline">Precios</a> o <a href="' +
      r +
      '#contacto" class="font-semibold text-primary hover:underline">Contacto</a>.</p>';
  }

  function renderCard(opts) {
    var badge = opts.meta
      ? '<span class="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 font-label-caps text-label-caps font-bold uppercase tracking-wider text-primary">' +
        esc(opts.meta) +
        "</span>"
      : "";
    return (
      '<a href="' +
      esc(opts.href) +
      '" class="ui-card group flex h-full flex-col rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-6 no-underline text-inherit transition hover:-translate-y-0.5">' +
      '<div class="mb-4 flex items-start justify-between gap-3">' +
      '<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">' +
      '<span class="material-symbols-outlined text-[1.5rem]">' +
      esc(opts.icon || "article") +
      "</span></div>" +
      badge +
      "</div>" +
      '<h3 class="font-h3 text-h3 text-on-background">' +
      esc(opts.title) +
      "</h3>" +
      '<p class="mt-3 flex-1 font-body-md text-body-md text-on-surface-variant leading-relaxed">' +
      esc(opts.description) +
      '</p><span class="mt-5 inline-flex items-center gap-1 font-body-md text-body-md font-semibold text-primary">Ver guía <span class="material-symbols-outlined text-lg transition-transform group-hover:translate-x-0.5" aria-hidden="true">arrow_forward</span></span></a>'
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
    document.body.className =
      "bg-background text-on-background font-body-md antialiased min-h-screen flex flex-col";
    document.body.insertAdjacentHTML(
      "afterbegin",
      renderHeader(active) + '<main class="flex-1 w-full" id="hc-main"></main>' + renderFooter()
    );
    bindMobileNav();
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
