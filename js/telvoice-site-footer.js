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

  function pageHref(r, target) {
    if (!target) return r;
    if (target.charAt(0) === "#") {
      return r ? r + "index.html" + target : target;
    }
    return r + target;
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
      '<a href="https://www.telvoice.cl/" class="tv-site-footer__logo" data-telvoice-home aria-label="Ir al inicio de Telvoice">' +
      '<img src="' +
      esc(r) +
      'assets/telvoice-isotipo.png" alt="" width="40" height="40" decoding="async" aria-hidden="true" />' +
      "<span>telvoice</span></a>" +
      "<p>SMS masivos para empresas en Chile: bolsas prepago, precios por volumen, pago online y API.</p>" +
      '<div class="tv-site-footer__ctas">' +
      '<a href="' +
      esc(pageHref(r, "#calculadora")) +
      '" class="tv-site-footer__cta tv-site-footer__cta--primary">Calcular precio</a>' +
      '<a href="' +
      esc(portal) +
      '" class="tv-site-footer__cta tv-site-footer__cta--ghost" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
      "</div></div>" +
      '<div class="tv-site-footer__cols">' +
      "<div><p class=\"tv-site-footer__heading\">Telvoice</p><ul class=\"tv-site-footer__links\">" +
      linkList([
        { href: pageHref(r, "#inicio"), label: "SMS masivos Chile" },
        { href: pageHref(r, "#precios"), label: "Precios" },
        { href: pageHref(r, "#calculadora"), label: "Bolsas SMS" },
        { href: pageHref(r, "#numeracion"), label: "Numeración" },
        { href: r + "numeracion-sim.html", label: "Numeración SIM" },
        { href: pageHref(r, "#api"), label: "API SMS" },
        { href: pageHref(r, "#contacto"), label: "Contacto" },
      ]) +
      "</ul></div>" +
      "<div><p class=\"tv-site-footer__heading\">Recursos</p><ul class=\"tv-site-footer__links\">" +
      linkList([
        { href: pageHref(r, "#precios"), label: "Precios y bolsas SMS" },
        { href: pageHref(r, "#numeracion"), label: "Numeración" },
        { href: r + "numeracion-sim.html", label: "Numeración SIM" },
        { href: pageHref(r, "#casos-uso"), label: "Casos de uso" },
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
