(function () {
  var HC = window.HELP_CENTER;
  var U = window.HC_UTILS;
  if (!HC || !U) return;

  var catSlug = document.body.getAttribute("data-category-slug");
  var cat = HC.categories.find(function (c) {
    return c.slug === catSlug;
  });
  if (!cat) return;

  var main = U.mountShell("home");
  var r = U.root();
  var articles = U.articlesByCategory(catSlug);
  var icon = U.categoryIcon(catSlug);

  function renderFaqCategory() {
    var items = (HC.faqItems || [])
      .map(function (item) {
        return (
          '<li><details class="hc-faq-item">' +
          "<summary>" +
          U.esc(item.question) +
          '<span class="material-symbols-outlined" aria-hidden="true">expand_more</span></summary>' +
          '<div class="hc-faq-answer">' +
          item.answer +
          "</div></details></li>"
        );
      })
      .join("");

    var more =
      '<p class="hc-category-intro" style="margin-top:1.25rem">¿Necesitas ayuda con el portal? Revisa los tutoriales de <a href="' +
      U.categoryUrl("envio-de-sms/") +
      '">Envío de SMS</a> o <a href="' +
      U.categoryUrl("reportes-y-seguimiento/") +
      '">Reportes</a>.</p>';

    return (
      '<ul class="hc-faq-list">' +
      items +
      "</ul>" +
      more
    );
  }

  function renderArticles() {
    if (!articles.length) {
      return (
        '<div class="hc-empty"><p>Estamos preparando nuevos artículos para esta categoría.</p>' +
        '<p><a href="' +
        r +
        'ayuda/">Volver al centro de ayuda</a></p></div>'
      );
    }
    return (
      '<div class="hc-grid hc-grid--articles">' +
      articles
        .map(function (a) {
          return U.renderCard({
            href: U.articleUrl(a.slug, a.category),
            icon: "article",
            title: a.title,
            description: a.summary,
            meta: a.estimatedTime,
          });
        })
        .join("") +
      "</div>"
    );
  }

  var otherCats = HC.categories
    .filter(function (c) {
      return c.slug !== catSlug;
    })
    .slice(0, 3)
    .map(function (c) {
      return U.renderCard({
        href: U.categoryUrl(c.href),
        icon: U.categoryIcon(c.slug),
        title: c.title,
        description: c.description,
      });
    })
    .join("");

  var contentBlock =
    catSlug === "preguntas-frecuentes" ? renderFaqCategory() : renderArticles();

  main.innerHTML =
    '<div class="hc-article-wrap">' +
    '<nav aria-label="Breadcrumb"><ol class="hc-breadcrumbs">' +
    '<li><a href="' +
    r +
    'ayuda/">Centro de ayuda</a></li>' +
    '<li aria-hidden="true"> / </li>' +
    "<li>" +
    U.esc(cat.title) +
    "</li></ol></nav>" +
    '<div class="hc-category-hero">' +
    '<span class="hc-category-hero-icon"><span class="material-symbols-outlined" aria-hidden="true">' +
    icon +
    "</span></span>" +
    "<h1>" +
    U.esc(cat.title) +
    "</h1>" +
    '<p class="hc-category-intro">' +
    U.esc(cat.description) +
    "</p></div>" +
    contentBlock +
    '<section class="hc-related-cats" aria-labelledby="hc-other-cats">' +
    '<h2 class="hc-section-title" id="hc-other-cats">Otras categorías</h2>' +
    '<div class="hc-grid hc-grid--cats">' +
    otherCats +
    "</div></section>" +
    '<div class="hc-actions">' +
    '<a class="hc-btn hc-btn--primary" href="' +
    U.esc(HC.portalUrl) +
    '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
    '<a class="hc-btn hc-btn--secondary" href="' +
    r +
    '#contacto">Contactar a Telvoice</a>' +
    "</div></div>";

  document.title = cat.title + " | Centro de ayuda Telvoice";
  var meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", cat.description);
})();
