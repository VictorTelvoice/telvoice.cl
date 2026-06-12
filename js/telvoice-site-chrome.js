/**
 * Nav, footer y comportamiento compartidos con el landing principal (index.html).
 */
(function () {
  var PORTAL_URL = "https://agent.telvoice.cl/app/dashboard";

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pageLink(root, path) {
    if (!path) return root + "index.html";
    if (path.charAt(0) === "#") return root + "index.html" + path;
    if (/^https?:\/\//.test(path)) return path;
    return root + path;
  }

  function navItemClass(active) {
    return active
      ? "font-body-md text-body-md text-primary bg-surface-container-low transition-colors hover:bg-surface-container-low rounded-full px-4 py-2"
      : "font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2";
  }

  function renderNav(opts) {
    var root = opts && opts.root != null ? opts.root : "";
    var active = (opts && opts.active) || "";
    var simCurrent = active === "numeracion-sim" ? ' aria-current="page"' : "";
    var ayudaCurrent = active === "ayuda" ? ' aria-current="page"' : "";

    return (
      '<nav class="bg-surface/90 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/30 w-full">' +
      '<div class="flex justify-between items-center gap-4 py-4 pl-4 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 lg:pl-28 lg:pr-10 max-w-container-max mx-auto">' +
      '<a href="' +
      esc(pageLink(root, "")) +
      '" class="flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="Telvoice, ir al inicio">' +
      '<img src="' +
      esc(root + "assets/telvoice-isotipo.png") +
      '" alt="Telvoice Chile — SMS masivos" width="36" height="36" class="h-9 w-9 object-contain" decoding="async" />' +
      '<span class="font-h3 text-h3 font-bold tracking-tight lowercase text-black">telvoice</span></a>' +
      '<ul class="hidden lg:flex gap-1 items-center">' +
      '<li class="site-nav-dropdown">' +
      '<button type="button" class="site-nav-dropdown-toggle font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" id="nav-precios-toggle" aria-expanded="false" aria-haspopup="true" aria-controls="nav-precios-menu">Precios</button>' +
      '<ul class="site-nav-dropdown-menu" id="nav-precios-menu" role="menu" aria-labelledby="nav-precios-toggle" hidden>' +
      '<li role="none"><a class="site-nav-dropdown-link" href="' +
      esc(pageLink(root, "#calculadora")) +
      '" role="menuitem" data-precios-nav="bolsas" data-track="click_nav_bolsas_sms">Bolsas SMS</a></li>' +
      '<li role="none"><a class="site-nav-dropdown-link" href="' +
      esc(pageLink(root, "numeracion-sim.html")) +
      '" role="menuitem" data-track="click_nav_numeros_sim"' +
      simCurrent +
      ">Numeración SIM real</a></li></ul></li>" +
      '<li><a class="' +
      navItemClass(false) +
      '" href="' +
      esc(pageLink(root, "#casos-uso")) +
      '">Casos de uso</a></li>' +
      '<li><a class="' +
      navItemClass(false) +
      '" href="' +
      esc(pageLink(root, "#api")) +
      '">API</a></li>' +
      '<li><a class="' +
      navItemClass(false) +
      '" href="' +
      esc(pageLink(root, "#contacto")) +
      '">Contacto</a></li>' +
      '<li><a class="' +
      navItemClass(active === "ayuda") +
      '" href="' +
      esc(root + "ayuda/") +
      '"' +
      ayudaCurrent +
      ">Centro de ayuda</a></li></ul>" +
      '<div class="nav-actions flex items-center gap-2 shrink-0">' +
      '<button type="button" id="nav-demo" class="nav-sales-btn hidden sm:inline-flex bg-primary text-on-primary font-body-md px-5 py-2.5 rounded-full hover:bg-surface-tint transition-colors shadow-sm" data-track="click_agente_ventas">Agente IA de Ventas</button>' +
      '<button type="button" id="menu-toggle" class="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-full border border-outline-variant/60 text-on-background" aria-expanded="false" aria-controls="mobile-panel" aria-label="Abrir menú">' +
      '<span class="material-symbols-outlined" id="menu-icon-open">menu</span>' +
      '<span class="material-symbols-outlined hidden" id="menu-icon-close">close</span></button></div></div>' +
      '<div id="mobile-panel" class="hidden lg:hidden border-t border-outline-variant/30 bg-surface/95 backdrop-blur-md py-4 pl-4 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 max-w-container-max mx-auto">' +
      '<ul class="flex flex-col gap-1">' +
      '<li class="site-nav-dropdown site-nav-dropdown--mobile">' +
      '<button type="button" class="site-nav-dropdown-toggle block font-body-md w-full text-left py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" id="nav-precios-toggle-mobile" aria-expanded="false" aria-controls="nav-precios-menu-mobile">Precios</button>' +
      '<ul class="site-nav-dropdown-menu site-nav-dropdown-menu--mobile" id="nav-precios-menu-mobile" hidden>' +
      '<li><a class="site-nav-dropdown-link" href="' +
      esc(pageLink(root, "#calculadora")) +
      '" data-precios-nav="bolsas" data-track="click_nav_bolsas_sms_mobile">Bolsas SMS</a></li>' +
      '<li><a class="site-nav-dropdown-link" href="' +
      esc(pageLink(root, "numeracion-sim.html")) +
      '" data-track="click_nav_numeros_sim_mobile"' +
      simCurrent +
      ">Numeración SIM real</a></li></ul></li>" +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      esc(pageLink(root, "#casos-uso")) +
      '">Casos de uso</a></li>' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      esc(pageLink(root, "#api")) +
      '">API</a></li>' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      esc(pageLink(root, "#contacto")) +
      '">Contacto</a></li>' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      esc(root + "ayuda/") +
      '"' +
      ayudaCurrent +
      ">Centro de ayuda</a></li></ul>" +
      '<button type="button" id="nav-demo-mobile" class="mt-2 w-full bg-primary text-on-primary font-body-md py-3 rounded-full hover:bg-surface-tint transition-colors" data-track="click_agente_ventas">Agente IA de Ventas</button></div></nav>'
    );
  }

  function renderFooter(opts) {
    var root = opts && opts.root != null ? opts.root : "";

    return (
      '<footer class="bg-primary text-on-primary" role="contentinfo">' +
      '<div class="max-w-container-max mx-auto px-4 sm:px-margin-page pt-14 pb-6">' +
      '<div class="grid grid-cols-1 gap-12 border-b border-on-primary/20 pb-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-10">' +
      '<div class="lg:col-span-4">' +
      '<a href="' +
      esc(pageLink(root, "")) +
      '" class="inline-flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary" aria-label="Telvoice, ir al inicio">' +
      '<img src="' +
      esc(root + "assets/telvoice-isotipo.png") +
      '" alt="" width="40" height="40" class="h-10 w-10 object-contain" aria-hidden="true" decoding="async" />' +
      '<span class="font-h3 text-h3 font-bold tracking-tight lowercase text-on-primary">telvoice</span></a>' +
      '<p class="mt-4 max-w-sm font-body-md text-body-md leading-relaxed text-on-primary/85">SMS masivos para empresas en Chile: bolsas prepago, precios por volumen, pago online y API.</p>' +
      '<div class="mt-6 flex flex-wrap gap-3">' +
      '<a href="' +
      esc(pageLink(root, "#calculadora")) +
      '" class="inline-flex items-center justify-center rounded-full bg-on-primary px-5 py-2.5 font-body-md text-body-md font-semibold text-primary shadow-sm transition hover:bg-primary-fixed hover:text-on-primary-fixed focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary" data-track="click_calcular_precio">Calcular precio</a>' +
      '<a href="' +
      esc(PORTAL_URL) +
      '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center rounded-full border-2 border-on-primary/50 bg-transparent px-5 py-2.5 font-body-md text-body-md font-semibold text-on-primary transition hover:border-on-primary hover:bg-on-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary">Ir al portal</a></div></div>' +
      '<div class="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-2 lg:col-span-8 lg:grid-cols-3">' +
      '<div><p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Telvoice</p><ul class="mt-4 space-y-3">' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(pageLink(root, "#inicio")) +
      '">SMS masivos Chile</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(pageLink(root, "#precios")) +
      '">Precios</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(pageLink(root, "#calculadora")) +
      '">Bolsas SMS</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(pageLink(root, "#api")) +
      '">API SMS</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(pageLink(root, "#contacto")) +
      '">Contacto</a></li></ul></div>' +
      '<div><p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Recursos</p><ul class="mt-4 space-y-3">' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(pageLink(root, "#precios")) +
      '">Precios y bolsas SMS</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(pageLink(root, "#casos-uso")) +
      '">Casos de uso</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(root + "ayuda/") +
      '">Centro de ayuda</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(PORTAL_URL) +
      '" target="_blank" rel="noopener noreferrer">Portal cliente</a></li></ul></div>' +
      '<div class="col-span-2 sm:col-span-1"><p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Legal</p><ul class="mt-4 space-y-3">' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(root + "terminos-y-condiciones/") +
      '">Términos y condiciones</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(root + "politica-de-privacidad/") +
      '">Política de privacidad</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-primary/90 transition hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-sm" href="' +
      esc(root + "uso-responsable/") +
      '">Uso responsable</a></li></ul></div></div></div>' +
      '<div class="flex flex-col gap-4 pt-8 sm:flex-row sm:items-center sm:justify-between">' +
      '<p class="font-body-sm text-body-sm text-on-primary/65">© 2026 Telvoice. Todos los derechos reservados.</p>' +
      '<p class="font-body-sm text-body-sm text-on-primary/55">Mensajería empresarial · Chile</p></div></div></footer>'
    );
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function openSalesAgent() {
    if (typeof window.TELVOICE_OPEN_AGENT === "function") {
      window.TELVOICE_OPEN_AGENT({ message: "" });
      return;
    }
    var launcher = document.querySelector(".tva-launcher");
    if (launcher) launcher.click();
  }

  function closeMobileMenu() {
    var panel = qs("mobile-panel");
    var toggle = qs("menu-toggle");
    var openI = qs("menu-icon-open");
    var closeI = qs("menu-icon-close");
    if (!panel || !toggle) return;
    panel.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
    if (openI) openI.classList.remove("hidden");
    if (closeI) closeI.classList.add("hidden");
  }

  function setSiteNavDropdownOpen(toggleEl, menuEl, open) {
    if (!toggleEl || !menuEl) return;
    toggleEl.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) menuEl.removeAttribute("hidden");
    else menuEl.setAttribute("hidden", "");
    var wrap = toggleEl.closest(".site-nav-dropdown");
    if (wrap) wrap.classList.toggle("is-open", open);
  }

  function initNav() {
    document.querySelectorAll(".site-nav-dropdown").forEach(function (wrap) {
      var toggle = wrap.querySelector(".site-nav-dropdown-toggle");
      var menu = wrap.querySelector(".site-nav-dropdown-menu");
      if (!toggle || !menu) return;
      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = toggle.getAttribute("aria-expanded") !== "true";
        document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (other) {
          if (other !== wrap) {
            setSiteNavDropdownOpen(
              other.querySelector(".site-nav-dropdown-toggle"),
              other.querySelector(".site-nav-dropdown-menu"),
              false
            );
          }
        });
        setSiteNavDropdownOpen(toggle, menu, willOpen);
      });
    });

    document.addEventListener("click", function (e) {
      if (e.target.closest(".site-nav-dropdown")) return;
      document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (wrap) {
        setSiteNavDropdownOpen(
          wrap.querySelector(".site-nav-dropdown-toggle"),
          wrap.querySelector(".site-nav-dropdown-menu"),
          false
        );
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (wrap) {
        setSiteNavDropdownOpen(
          wrap.querySelector(".site-nav-dropdown-toggle"),
          wrap.querySelector(".site-nav-dropdown-menu"),
          false
        );
      });
    });

    var menuToggle = qs("menu-toggle");
    var mobilePanel = qs("mobile-panel");
    if (menuToggle && mobilePanel) {
      menuToggle.addEventListener("click", function () {
        var isHidden = mobilePanel.classList.contains("hidden");
        if (isHidden) {
          mobilePanel.classList.remove("hidden");
          menuToggle.setAttribute("aria-expanded", "true");
          var openI = qs("menu-icon-open");
          var closeI = qs("menu-icon-close");
          if (openI) openI.classList.add("hidden");
          if (closeI) closeI.classList.remove("hidden");
        } else {
          closeMobileMenu();
        }
      });
    }

    ["nav-demo", "nav-demo-mobile"].forEach(function (id) {
      var btn = qs(id);
      if (!btn) return;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        closeMobileMenu();
        openSalesAgent();
      });
    });
  }

  function loadAgent(root) {
    if (document.querySelector('script[src*="telvoice-web-agent-loader.js"]')) return;
    var agentLoader = document.createElement("script");
    agentLoader.src = root + "js/telvoice-web-agent-loader.js";
    agentLoader.setAttribute("data-root", root);
    document.body.appendChild(agentLoader);
  }

  function mount(opts) {
    var root = opts && opts.root != null ? opts.root : "";
    var active = (opts && opts.active) || "";
    var navMount = opts && opts.navMount ? document.querySelector(opts.navMount) : qs("tv-site-nav");
    var footerMount = opts && opts.footerMount ? document.querySelector(opts.footerMount) : qs("tv-site-footer");

    if (navMount) navMount.outerHTML = renderNav({ root: root, active: active });
    if (footerMount) footerMount.outerHTML = renderFooter({ root: root });

    initNav();
    loadAgent(root);
  }

  window.TELVOICE_SITE_CHROME = {
    renderNav: renderNav,
    renderFooter: renderFooter,
    initNav: initNav,
    loadAgent: loadAgent,
    mount: mount,
  };
})();
