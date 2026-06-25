/**
 * Header/nav público del landing aprobado — montaje en páginas secundarias.
 * Uso: <div id="telvoice-public-nav" data-root=""></div>
 * Opcional: data-active="numeracion-sim" | data-mode="home" (sin prefijo en anchors)
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function mountOptions() {
    var el = document.getElementById("telvoice-public-nav");
    if (!el) return null;
    var root = el.getAttribute("data-root") || "";
    var active = el.getAttribute("data-active") || "";
    var mode = el.getAttribute("data-mode") || (root ? "subpage" : "home");
    return { el: el, root: root, active: active, mode: mode };
  }

  function anchor(href, mode, root) {
    if (mode === "home" && href.charAt(0) === "#") return href;
    if (href.charAt(0) === "#") return root + "index.html" + href;
    if (href.charAt(0) === "/") return href;
    return root + href;
  }

  function renderNav(opts) {
    var r = opts.root;
    var mode = opts.mode;
    var active = opts.active;
    var B = window.TELVOICE_PUBLIC_BRAND;
    var homeHref = mode === "home" ? "#" : r + "index.html";
    var homeAttrs =
      mode === "home"
        ? ' href="#" data-scroll-top'
        : ' href="' + esc(homeHref) + '"';
    var simHref = mode === "home" ? "/numeracion-sim.html" : r + "numeracion-sim.html";
    var simCurrent = active === "numeracion-sim" ? ' aria-current="page"' : "";
    var calcHref = anchor("#calculadora", mode, r);
    var casosHref = anchor("#casos-uso", mode, r);
    var numeracionHref = anchor("#numeracion", mode, r);
    var apiHref = anchor("#api", mode, r);
    var contactoHref = anchor("#contacto", mode, r);
    var ayudaHref = r + "ayuda/";
    var portalHref = "https://agent.telvoice.cl/login";

    return (
      '<nav class="bg-surface/90 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/30 w-full">' +
      '<div class="' +
      (B ? B.navInnerClass : "flex justify-between items-center gap-4 py-4 pl-4 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 lg:pl-28 lg:pr-10 max-w-container-max mx-auto") +
      '">' +
      (B
        ? B.renderNavBrandLink(r, { extraAttrs: homeAttrs + ' class="flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="Telvoice, ir al inicio"' })
        : '<a' +
          homeAttrs +
          ' class="flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="Telvoice, ir al inicio">' +
          '<img src="' +
          esc(r) +
          'assets/telvoice-isotipo.png" alt="Telvoice Chile — SMS masivos" width="36" height="36" class="h-9 w-9 object-contain" decoding="async" />' +
          '<span class="font-h3 text-h3 font-bold tracking-tight lowercase text-black">telvoice</span></a>') +
      '<ul class="hidden lg:flex gap-1 items-center">' +
      '<li class="site-nav-dropdown">' +
      '<button type="button" class="site-nav-dropdown-toggle font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" id="nav-precios-toggle" aria-expanded="false" aria-haspopup="true" aria-controls="nav-precios-menu">Precios</button>' +
      '<ul class="site-nav-dropdown-menu" id="nav-precios-menu" role="menu" aria-labelledby="nav-precios-toggle" hidden>' +
      '<li role="none"><a class="site-nav-dropdown-link" href="' +
      esc(calcHref) +
      '" role="menuitem" data-precios-nav="bolsas" data-track="click_nav_bolsas_sms">Bolsas SMS</a></li>' +
      '<li role="none"><a class="site-nav-dropdown-link" href="' +
      esc(simHref) +
      '" role="menuitem" data-track="click_nav_numeracion_sim"' +
      simCurrent +
      ">Numeración SIM</a></li>" +
      "</ul></li>" +
      '<li><a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" href="' +
      esc(casosHref) +
      '">Casos de uso</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" href="' +
      esc(numeracionHref) +
      '">Numeración</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" href="' +
      esc(apiHref) +
      '">API</a></li>' +
      '<li><a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-full px-4 py-2" href="' +
      esc(contactoHref) +
      '">Contacto</a></li>' +
      "</ul>" +
      '<div class="nav-actions flex items-center gap-2 shrink-0">' +
      '<a href="' +
      esc(calcHref) +
      '" id="nav-comprar-sms" class="nav-sales-btn hidden sm:inline-flex bg-primary text-on-primary font-body-md px-5 py-2.5 rounded-full hover:bg-surface-tint transition-colors shadow-sm no-underline" data-track="click_comprar_sms_nav">Comprar SMS</a>' +
      '<a href="' +
      esc(portalHref) +
      '" class="nav-login-btn hidden sm:inline-flex items-center justify-center border-2 border-primary/25 text-primary rounded-full hover:bg-primary/5 transition-colors no-underline" aria-label="Iniciar sesión" title="Iniciar sesión" data-track="click_login_nav"><span class="material-symbols-outlined" aria-hidden="true">login</span></a>' +
      '<button type="button" id="menu-toggle" class="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-full border border-outline-variant/60 text-on-background" aria-expanded="false" aria-controls="mobile-panel" aria-label="Abrir menú">' +
      '<span class="material-symbols-outlined" id="menu-icon-open">menu</span>' +
      '<span class="material-symbols-outlined hidden" id="menu-icon-close">close</span>' +
      "</button></div></div>" +
      '<div id="mobile-panel" class="' +
      (B ? B.navMobilePanelClass : "hidden lg:hidden border-t border-outline-variant/30 bg-surface/95 backdrop-blur-md py-4 pl-4 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 max-w-container-max mx-auto") +
      '">' +
      '<ul class="flex flex-col gap-1">' +
      '<li class="site-nav-dropdown site-nav-dropdown--mobile">' +
      '<button type="button" class="site-nav-dropdown-toggle block font-body-md w-full text-left py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" id="nav-precios-toggle-mobile" aria-expanded="false" aria-controls="nav-precios-menu-mobile">Precios</button>' +
      '<ul class="site-nav-dropdown-menu site-nav-dropdown-menu--mobile" id="nav-precios-menu-mobile" hidden>' +
      '<li><a class="site-nav-dropdown-link" href="' +
      esc(calcHref) +
      '" data-precios-nav="bolsas" data-track="click_nav_bolsas_sms_mobile">Bolsas SMS</a></li>' +
      '<li><a class="site-nav-dropdown-link" href="' +
      esc(simHref) +
      '"' +
      simCurrent +
      ' data-track="click_nav_numeracion_sim_mobile">Numeración SIM</a></li>' +
      "</ul></li>" +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      esc(casosHref) +
      '">Casos de uso</a></li>' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      esc(numeracionHref) +
      '">Numeración</a></li>' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      esc(apiHref) +
      '">API</a></li>' +
      '<li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="' +
      esc(contactoHref) +
      '">Contacto</a></li>' +
      "</ul>" +
      '<div class="mt-4 flex flex-col gap-3 sm:hidden">' +
      '<a href="' +
      esc(portalHref) +
      '" class="block w-full text-center border-2 border-primary/25 text-primary font-body-md py-3 rounded-full hover:bg-primary/5 transition-colors no-underline" data-track="click_ir_al_portal_mobile">Ir al Portal</a>' +
      '<a href="' +
      esc(calcHref) +
      '" id="nav-comprar-sms-mobile" class="block w-full text-center bg-primary text-on-primary font-body-md py-3 rounded-full hover:bg-surface-tint transition-colors no-underline" data-track="click_comprar_sms_nav">Comprar SMS</a>' +
      "</div></div></nav>"
    );
  }

  function setSiteNavDropdownOpen(toggleEl, menuEl, open) {
    if (!toggleEl || !menuEl) return;
    toggleEl.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) menuEl.removeAttribute("hidden");
    else menuEl.setAttribute("hidden", "");
    var wrap = toggleEl.closest(".site-nav-dropdown");
    if (wrap) wrap.classList.toggle("is-open", open);
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

  function openMobileMenu() {
    var panel = qs("mobile-panel");
    var toggle = qs("menu-toggle");
    var openI = qs("menu-icon-open");
    var closeI = qs("menu-icon-close");
    if (!panel || !toggle) return;
    panel.classList.remove("hidden");
    toggle.setAttribute("aria-expanded", "true");
    if (openI) openI.classList.add("hidden");
    if (closeI) closeI.classList.remove("hidden");
  }

  function initSiteNavDropdowns() {
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
  }

  function initMobileMenu() {
    var menuToggle = qs("menu-toggle");
    if (menuToggle) {
      menuToggle.addEventListener("click", function () {
        var expanded = menuToggle.getAttribute("aria-expanded") === "true";
        if (expanded) closeMobileMenu();
        else openMobileMenu();
      });
    }
    document.querySelectorAll("#mobile-panel a").forEach(function (link) {
      link.addEventListener("click", closeMobileMenu);
    });
    document.querySelectorAll("[data-scroll-top]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        closeMobileMenu();
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    });
  }

  function initPublicNav() {
    initSiteNavDropdowns();
    initMobileMenu();
  }

  function mount() {
    var opts = mountOptions();
    if (!opts) return;
    opts.el.outerHTML = renderNav(opts);
    initPublicNav();
  }

  if (document.getElementById("telvoice-public-nav")) {
    mount();
  }

  window.TelvoicePublicNav = {
    init: initPublicNav,
    mount: mount,
  };
})();
