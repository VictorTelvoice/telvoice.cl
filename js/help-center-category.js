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
          '<li><details class="group rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm open:border-primary/25 open:shadow-md">' +
          '<summary class="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-h3 text-h3 text-on-background">' +
          U.esc(item.question) +
          '<span class="material-symbols-outlined shrink-0 text-on-surface-variant transition group-open:rotate-180" aria-hidden="true">expand_more</span></summary>' +
          '<div class="border-t border-outline-variant/40 px-5 pb-4 font-body-md text-body-md leading-relaxed text-on-surface-variant">' +
          item.answer +
          "</div></details></li>"
        );
      })
      .join("");

    return (
      '<ul class="mx-auto max-w-3xl list-none space-y-3 p-0">' +
      items +
      "</ul>" +
      '<p class="mx-auto mt-8 max-w-3xl font-body-md text-body-md text-on-surface-variant">¿Necesitas ayuda con el portal? Revisa <a href="' +
      U.categoryUrl("envio-de-sms/") +
      '" class="font-semibold text-primary hover:underline">Envío de SMS</a> o <a href="' +
      U.categoryUrl("reportes-y-seguimiento/") +
      '" class="font-semibold text-primary hover:underline">Reportes</a>.</p>'
    );
  }

  function renderArticles() {
    if (!articles.length) {
      return (
        '<div class="mx-auto max-w-xl rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low p-8 text-center">' +
        "<p class=\"font-body-md text-on-surface-variant\">Estamos preparando nuevos artículos para esta categoría.</p>" +
        '<p class="mt-3"><a href="' +
        r +
        'ayuda/" class="font-semibold text-primary hover:underline">Volver al centro de ayuda</a></p></div>'
      );
    }
    return (
      '<div class="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8">' +
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

  main.innerHTML =
    '<nav aria-label="Breadcrumb" class="mb-6 font-body-sm text-body-sm text-on-surface-variant">' +
    '<a href="' +
    r +
    'ayuda/" class="text-primary hover:underline">Centro de ayuda</a>' +
    ' <span aria-hidden="true">/</span> ' +
    "<span>" +
    U.esc(cat.title) +
    "</span></nav>" +
    '<header class="section-bg-sky rounded-2xl border border-outline-variant/40 px-6 py-8 md:px-10">' +
    '<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">' +
    '<span class="material-symbols-outlined text-[1.75rem]">' +
    icon +
    "</span></div>" +
    '<span class="section-eyebrow">' +
    U.esc(cat.title) +
    "</span>" +
    "<h1 class=\"mt-2 font-h2 text-h2 text-on-background leading-tight\">" +
    U.esc(cat.title) +
    "</h1>" +
    '<p class="mt-4 max-w-2xl section-intro text-on-surface-variant">' +
    U.esc(cat.description) +
    "</p></header>" +
    '<div class="mt-10 md:mt-12">' +
    (catSlug === "preguntas-frecuentes" ? renderFaqCategory() : renderArticles()) +
    "</div>" +
    '<section class="mt-12 border-t border-outline-variant/40 pt-12 md:mt-16" aria-labelledby="hc-other-cats">' +
    '<h2 class="font-h3 text-h3 text-on-background" id="hc-other-cats">Otras categorías</h2>' +
    '<div class="mt-8 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 md:gap-8">' +
    otherCats +
    "</div></section>" +
    '<div class="mt-12 flex flex-wrap gap-4">' +
    '<a class="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-body-md font-semibold text-on-primary transition hover:bg-surface-tint" href="' +
    U.esc(HC.portalUrl) +
    '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
    '<a class="inline-flex items-center justify-center rounded-full border border-primary/25 px-6 py-3 font-body-md font-semibold text-primary transition hover:bg-surface-container-low" href="' +
    r +
    '#contacto">Contactar a Telvoice</a>' +
    "</div>";

  document.title = cat.title + " | Centro de ayuda Telvoice";
  var meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", cat.description);
})();
