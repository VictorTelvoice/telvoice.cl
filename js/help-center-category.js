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
    return (
      '<div class="mx-auto max-w-3xl space-y-10">' +
      U.renderFaqSections() +
      '<p class="text-center font-body-md text-body-md text-on-surface-variant">Tutoriales del portal: <a href="' +
      U.categoryUrl("envio-de-sms/") +
      '" class="font-semibold text-primary hover:underline">Envío de SMS</a> · <a href="' +
      U.categoryUrl("reportes-y-seguimiento/") +
      '" class="font-semibold text-primary hover:underline">Reportes</a> · <a href="' +
      U.categoryUrl("primeros-pasos/") +
      '" class="font-semibold text-primary hover:underline">Primeros pasos</a></p></div>'
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
      '<div class="' + U.gridTwoClass + '">' +
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
      var meta =
        c.slug === "preguntas-frecuentes"
          ? U.faqCount() + " preguntas"
          : U.guideLabel(U.articlesByCategory(c.slug).length);
      return U.renderCard({
        href: U.categoryUrl(c.href),
        icon: U.categoryIcon(c.slug),
        title: c.title,
        description: c.description,
        meta: meta,
      });
    })
    .join("");

  var faqHeader =
    catSlug === "preguntas-frecuentes"
      ? '<header class="mx-auto max-w-3xl text-center">' +
        '<span class="section-eyebrow">Preguntas frecuentes</span>' +
        '<h1 class="mt-3 font-h2 text-h2 text-on-background leading-tight">¿Tienes dudas?</h1>' +
        '<p class="section-intro mt-4 text-on-surface-variant leading-relaxed">Aquí reunimos las mismas preguntas del sitio principal y guías complementarias sobre el portal cliente.</p>' +
        "</header>"
      : '<header class="mx-auto max-w-5xl section-bg-sky rounded-2xl border border-outline-variant/40 px-6 py-8 md:px-10">' +
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
        "</p></header>";

  main.innerHTML =
    '<nav aria-label="Breadcrumb" class="mb-6 font-body-sm text-body-sm text-on-surface-variant">' +
    '<a href="' +
    r +
    'ayuda/" class="text-primary hover:underline">Centro de ayuda</a>' +
    ' <span aria-hidden="true">/</span> ' +
    "<span>" +
    U.esc(cat.title) +
    "</span></nav>" +
    faqHeader +
    '<div class="mt-10 md:mt-12">' +
    (catSlug === "preguntas-frecuentes" ? renderFaqCategory() : renderArticles()) +
    "</div>" +
    '<section class="mt-12 border-t border-outline-variant/40 pt-12 md:mt-16" aria-labelledby="hc-other-cats">' +
    '<h2 class="font-h3 text-h3 text-on-background text-center" id="hc-other-cats">Otras categorías</h2>' +
    '<div class="' +
    U.gridClass +
    '">' +
    otherCats +
    "</div></section>" +
    '<div class="mx-auto mt-12 flex max-w-5xl flex-wrap justify-center gap-4">' +
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
