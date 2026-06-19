/**
 * Marca y márgenes del shell público Telvoice (landing aprobado).
 * Logo nav: isotipo + “telvoice” en negro. Gutters: pl-4 → lg:pl-28.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var NAV_INNER =
    "flex justify-between items-center gap-4 py-4 pl-4 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 lg:pl-28 lg:pr-10 max-w-container-max mx-auto";

  var NAV_MOBILE_PANEL =
    "hidden lg:hidden border-t border-outline-variant/30 bg-surface/95 backdrop-blur-md py-4 pl-4 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 max-w-container-max mx-auto";

  var FOOTER_INNER = "max-w-container-max mx-auto px-4 sm:px-margin-page";

  function renderNavBrandLink(root, opts) {
    opts = opts || {};
    var r = root || "";
    var href = opts.href != null ? opts.href : r + (opts.homeFile || "");
    var label = opts.ariaLabel || "Telvoice, ir al inicio";
    var extra = opts.extraAttrs || "";
    var open = extra ? "<a" + extra + ">" : '<a href="' + esc(href) + '" class="flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="' + esc(label) + '">';
    return (
      open +
      '<img src="' +
      esc(r) +
      'assets/telvoice-isotipo.png" alt="Telvoice Chile — SMS masivos" width="36" height="36" class="h-9 w-9 object-contain" decoding="async" />' +
      '<span class="font-h3 text-h3 font-bold tracking-tight lowercase text-black">telvoice</span>' +
      "</a>"
    );
  }

  function renderFooterBrandLink(root, opts) {
    opts = opts || {};
    var r = root || "";
    var href = opts.href != null ? opts.href : r;
    var extra = opts.extraAttrs || "";
    var open = extra
      ? "<a" + extra + ">"
      : '<a href="' +
        esc(href) +
        '" class="inline-flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-primary" aria-label="Telvoice, ir al inicio">';
    return (
      open +
      '<img src="' +
      esc(r) +
      'assets/telvoice-isotipo.png" alt="" width="40" height="40" class="h-10 w-10 object-contain" aria-hidden="true" decoding="async" />' +
      '<span class="font-h3 text-h3 font-bold tracking-tight lowercase text-on-primary">telvoice</span>' +
      "</a>"
    );
  }

  window.TELVOICE_PUBLIC_BRAND = {
    navInnerClass: NAV_INNER,
    navMobilePanelClass: NAV_MOBILE_PANEL,
    footerInnerClass: FOOTER_INNER,
    renderNavBrandLink: renderNavBrandLink,
    renderFooterBrandLink: renderFooterBrandLink,
  };
})();
