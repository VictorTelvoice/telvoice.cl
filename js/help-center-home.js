(function () {
  var HC = window.HELP_CENTER;
  var U = window.HC_UTILS;
  if (!HC || !U) return;

  var main = U.mountShell("home");
  var featured = HC.featuredSlugs.map(function (slug) {
    return HC.articles[slug];
  });

  var catsHtml = HC.categories
    .map(function (c) {
      var count =
        c.slug === "preguntas-frecuentes"
          ? U.faqCount() + " preguntas"
          : U.guideLabel(U.articlesByCategory(c.slug).length);
      return U.renderCard({
        href: U.categoryUrl(c.href),
        icon: U.categoryIcon(c.slug),
        title: c.title,
        description: c.description,
        meta: count,
      });
    })
    .join("");

  var featHtml = featured
    .map(function (a) {
      return U.renderCard({
        href: U.articleUrl(a.slug, a.category),
        icon: "play_circle",
        title: a.title,
        description: a.summary,
        meta: a.estimatedTime,
      });
    })
    .join("");

  main.innerHTML =
    '<header class="hc-hero lab-glass-card">' +
    '<span class="lab-eyebrow">Centro de ayuda</span>' +
    '<h1 class="lab-section-title mt-4">' +
    U.esc(HC.home.title) +
    "</h1>" +
    '<p class="mt-4 max-w-2xl text-sm text-slate-400 leading-relaxed">' +
    U.esc(HC.home.subtitle) +
    "</p>" +
    '<form class="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row" id="hc-search-form" role="search">' +
    '<label class="sr-only" for="hc-search-input">Buscar en el centro de ayuda</label>' +
    '<input type="search" id="hc-search-input" name="q" placeholder="' +
    U.esc(HC.home.searchPlaceholder) +
    '" autocomplete="off" class="hc-search-input flex-1" />' +
    '<button type="submit" class="lab-btn-primary shrink-0 px-6 py-3">Buscar</button>' +
    "</form>" +
    '<ul class="mt-4 hidden list-none space-y-2 p-0" id="hc-search-results"></ul>' +
    "</header>" +
    '<section class="mt-12 md:mt-16" aria-labelledby="hc-cats-title">' +
    '<h2 class="lab-section-title text-center text-xl md:text-2xl" id="hc-cats-title">Categorías</h2>' +
    '<div class="' +
    U.gridClass +
    '">' +
    catsHtml +
    "</div></section>" +
    '<section class="mt-12 md:mt-16" aria-labelledby="hc-feat-title">' +
    '<h2 class="lab-section-title text-center text-xl md:text-2xl" id="hc-feat-title">Tutoriales destacados</h2>' +
    '<div class="' +
    U.gridClass +
    '">' +
    featHtml +
    "</div></section>" +
    '<div class="mx-auto mt-12 flex max-w-5xl flex-wrap justify-center gap-4">' +
    '<a class="lab-btn-primary px-6 py-3" href="' +
    U.esc(HC.portalUrl) +
    '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
    '<a class="lab-btn-secondary px-6 py-3" href="' +
    U.labPath() +
    '">Volver al Telvoice Lab</a>' +
    "</div>";

  var form = document.getElementById("hc-search-form");
  var input = document.getElementById("hc-search-input");
  var results = document.getElementById("hc-search-results");

  function searchArticles(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) {
      results.classList.add("hidden");
      results.innerHTML = "";
      return;
    }
    var hits = U.allArticles().filter(function (a) {
      var blob =
        a.title +
        " " +
        a.summary +
        " " +
        a.categoryTitle +
        " " +
        (a.steps || [])
          .map(function (s) {
            return s.stepTitle + " " + s.stepBody;
          })
          .join(" ");
      return blob.toLowerCase().indexOf(q) !== -1;
    });
    results.classList.remove("hidden");
    if (!hits.length) {
      results.innerHTML =
        '<li class="hc-search-hit text-slate-400">No hay resultados. Prueba con otras palabras.</li>';
      return;
    }
    results.innerHTML = hits
      .map(function (a) {
        return (
          '<li><a class="hc-search-hit block" href="' +
          U.articleUrl(a.slug, a.category) +
          '"><strong class="text-white">' +
          U.esc(a.title) +
          '</strong><br /><span class="text-sm text-slate-400">' +
          U.esc(a.summary) +
          "</span></a></li>"
        );
      })
      .join("");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    searchArticles(input.value);
  });
  input.addEventListener("input", function () {
    if (input.value.length >= 2) searchArticles(input.value);
    else {
      results.classList.add("hidden");
      results.innerHTML = "";
    }
  });
})();
