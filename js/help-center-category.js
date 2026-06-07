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
      '<p class="text-center text-sm text-slate-400">Tutoriales del portal: <a href="' +
      U.categoryUrl("envio-de-sms/") +
      '" class="font-semibold text-lab-cyan hover:underline">Envío de SMS</a> · <a href="' +
      U.categoryUrl("reportes-y-seguimiento/") +
      '" class="font-semibold text-lab-cyan hover:underline">Reportes</a> · <a href="' +
      U.categoryUrl("primeros-pasos/") +
      '" class="font-semibold text-lab-cyan hover:underline">Primeros pasos</a></p></div>'
    );
  }

  function renderArticles() {
    if (!articles.length) {
      return (
        '<div class="mx-auto max-w-xl hc-empty-state">' +
        "<p class=\"text-slate-400\">Estamos preparando nuevos artículos para esta categoría.</p>" +
        '<p class="mt-3"><a href="' +
        r +
        'ayuda/" class="font-semibold text-lab-cyan hover:underline">Volver al centro de ayuda</a></p></div>'
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
        '<span class="lab-eyebrow">Preguntas frecuentes</span>' +
        '<h1 class="lab-section-title mt-4">¿Tienes dudas?</h1>' +
        '<p class="mt-4 text-sm text-slate-400 leading-relaxed">Aquí reunimos las mismas preguntas del sitio principal y guías complementarias sobre el portal cliente.</p>' +
        "</header>"
      : '<header class="hc-hero lab-glass-card">' +
        '<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-lab-cyan/10 text-lab-cyan" aria-hidden="true">' +
        '<span class="material-symbols-outlined text-[1.75rem]">' +
        icon +
        "</span></div>" +
        '<span class="lab-eyebrow">' +
        U.esc(cat.title) +
        "</span>" +
        "<h1 class=\"lab-section-title mt-2\">" +
        U.esc(cat.title) +
        "</h1>" +
        '<p class="mt-4 max-w-2xl text-sm text-slate-400">' +
        U.esc(cat.description) +
        "</p></header>";

  main.innerHTML =
    '<nav aria-label="Breadcrumb" class="hc-breadcrumb mb-6">' +
    '<a href="' +
    r +
    'ayuda/" class="text-lab-cyan hover:underline">Centro de ayuda</a>' +
    ' <span aria-hidden="true">/</span> ' +
    "<span class=\"text-slate-400\">" +
    U.esc(cat.title) +
    "</span></nav>" +
    faqHeader +
    '<div class="mt-10 md:mt-12">' +
    (catSlug === "preguntas-frecuentes" ? renderFaqCategory() : renderArticles()) +
    "</div>" +
    '<section class="mt-12 border-t border-white/10 pt-12 md:mt-16" aria-labelledby="hc-other-cats">' +
    '<h2 class="lab-section-title text-center text-xl md:text-2xl" id="hc-other-cats">Otras categorías</h2>' +
    '<div class="' +
    U.gridClass +
    '">' +
    otherCats +
    "</div></section>" +
    '<div class="mx-auto mt-12 flex max-w-5xl flex-wrap justify-center gap-4">' +
    '<a class="lab-btn-primary px-6 py-3" href="' +
    U.esc(HC.portalUrl) +
    '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
    '<a class="lab-btn-secondary px-6 py-3" href="' +
    U.labPath() +
    '">Volver al Telvoice Lab</a>' +
    "</div>";

  document.title = cat.title + " | Centro de ayuda Telvoice";
  var meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", cat.description);
})();
