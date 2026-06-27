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

  var LAYOUT_VER = "20260703";

  function ensureStylesheet(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScriptOnce(src, attrs) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      if (attrs) {
        Object.keys(attrs).forEach(function (key) {
          script.setAttribute(key, attrs[key]);
        });
      }
      script.onload = function () {
        resolve();
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  function ensureSharedLayoutStyles(r) {
    ensureStylesheet(r + "css/telvoice-public-nav.css?v=" + LAYOUT_VER);
    ensureStylesheet(r + "css/telvoice-floating-agent-toggle.css?v=" + LAYOUT_VER);
    ensureStylesheet(r + "css/telvoice-site-footer.css?v=" + LAYOUT_VER);
  }

  function loadSharedLayoutScripts(r) {
    return loadScriptOnce(r + "js/telvoice-public-nav.js?v=" + LAYOUT_VER).then(function () {
      return loadScriptOnce(r + "js/telvoice-site-footer.js?v=" + LAYOUT_VER);
    });
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

  function mountPublicFloatingAgent() {
    var r = root();
    function startAgent() {
      if (window.TELVOICE_PUBLIC_FLOATING_AGENT) {
        window.TELVOICE_PUBLIC_FLOATING_AGENT.mount({ root: r });
      }
    }
    if (window.TELVOICE_PUBLIC_FLOATING_AGENT) {
      startAgent();
      return;
    }
    var shared = document.createElement("script");
    shared.src = r + "js/telvoice-public-floating-agent.js?v=" + LAYOUT_VER;
    shared.setAttribute("data-init", "manual");
    shared.onload = startAgent;
    document.body.appendChild(shared);
  }

  function mountShell(active) {
    var r = root();
    document.body.className =
      "bg-background text-on-background font-body-md antialiased min-h-screen flex flex-col";
    ensureSharedLayoutStyles(r);
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div id="telvoice-public-nav" data-root="' +
        esc(r) +
        '"></div>' +
        '<main class="flex-1 w-full" id="hc-main"></main>' +
        '<div id="telvoice-site-footer" data-root="' +
        esc(r) +
        '"></div>'
    );
    loadSharedLayoutScripts(r)
      .then(function () {
        if (window.TelvoicePublicNav && typeof window.TelvoicePublicNav.mount === "function") {
          window.TelvoicePublicNav.mount();
        }
        mountPublicFloatingAgent();
      })
      .catch(function () {});
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
