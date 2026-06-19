/**
 * Pie de página del landing principal — montaje en páginas secundarias.
 * Uso: <div id="telvoice-site-footer" data-root=""></div> (raíz) o data-root="../"
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

  function rootPrefix() {
    var el = document.getElementById("telvoice-site-footer");
    return el && el.getAttribute("data-root") ? el.getAttribute("data-root") : "";
  }

  function linkList(items) {
    return items
      .map(function (item) {
        return (
          '<li><a href="' +
          esc(item.href) +
          '"' +
          (item.external ? ' target="_blank" rel="noopener noreferrer"' : "") +
          ">" +
          esc(item.label) +
          "</a></li>"
        );
      })
      .join("");
  }

  function renderFooter(r) {
    var portal = "https://agent.telvoice.cl/app/dashboard";
    return (
      '<footer class="tv-site-footer" role="contentinfo">' +
      '<div class="tv-site-footer__inner">' +
      '<div class="tv-site-footer__grid">' +
      '<div class="tv-site-footer__brand">' +
      '<a href="' +
      esc(r) +
      'index.html" class="tv-site-footer__logo" aria-label="Telvoice, ir al inicio">' +
      '<img src="' +
      esc(r) +
      'assets/telvoice-isotipo.png" alt="" width="40" height="40" decoding="async" aria-hidden="true" />' +
      "<span>telvoice</span></a>" +
      "<p>SMS masivos para empresas en Chile: bolsas prepago, precios por volumen, pago online y API.</p>" +
      '<div class="tv-site-footer__ctas">' +
      '<a href="' +
      esc(r) +
      'index.html#calculadora" class="tv-site-footer__cta tv-site-footer__cta--primary">Calcular precio</a>' +
      '<a href="' +
      esc(portal) +
      '" class="tv-site-footer__cta tv-site-footer__cta--ghost" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
      "</div></div>" +
      '<div class="tv-site-footer__cols">' +
      "<div><p class=\"tv-site-footer__heading\">Telvoice</p><ul class=\"tv-site-footer__links\">" +
      linkList([
        { href: r + "index.html#inicio", label: "SMS masivos Chile" },
        { href: r + "index.html#precios", label: "Precios" },
        { href: r + "index.html#calculadora", label: "Bolsas SMS" },
        { href: r + "index.html#numeracion", label: "Numeración" },
        { href: r + "numeracion-sim.html", label: "Numeración SIM" },
        { href: r + "index.html#api", label: "API SMS" },
        { href: r + "index.html#contacto", label: "Contacto" },
      ]) +
      "</ul></div>" +
      "<div><p class=\"tv-site-footer__heading\">Recursos</p><ul class=\"tv-site-footer__links\">" +
      linkList([
        { href: r + "index.html#precios", label: "Precios y bolsas SMS" },
        { href: r + "index.html#numeracion", label: "Numeración" },
        { href: r + "numeracion-sim.html", label: "Numeración SIM" },
        { href: r + "index.html#casos-uso", label: "Casos de uso" },
        { href: r + "ayuda/", label: "Centro de ayuda" },
        { href: portal, label: "Portal cliente", external: true },
      ]) +
      "</ul></div>" +
      "<div><p class=\"tv-site-footer__heading\">Legal</p><ul class=\"tv-site-footer__links\">" +
      linkList([
        { href: r + "terminos-y-condiciones/", label: "Términos y condiciones" },
        { href: r + "politica-de-privacidad/", label: "Política de privacidad" },
        { href: r + "uso-responsable/", label: "Uso responsable" },
      ]) +
      "</ul></div></div></div>" +
      '<div class="tv-site-footer__legal">' +
      "<p>© 2026 Telvoice. Todos los derechos reservados.</p>" +
      "<p>Mensajería empresarial · Chile</p>" +
      "</div></div></footer>"
    );
  }

  function mount() {
    var el = document.getElementById("telvoice-site-footer");
    if (!el) return;
    el.innerHTML = renderFooter(rootPrefix());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
