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
          ? (HC.faqItems || []).length + " preguntas"
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
    '<header class="section-bg-sky rounded-2xl border border-outline-variant/40 px-6 py-8 md:px-10 md:py-10">' +
    '<span class="section-eyebrow">Centro de ayuda</span>' +
    '<h1 class="mt-3 font-h2 text-h2 text-on-background leading-tight">' +
    U.esc(HC.home.title) +
    "</h1>" +
    '<p class="mt-4 max-w-2xl section-intro text-on-surface-variant">' +
    U.esc(HC.home.subtitle) +
    "</p>" +
    '<form class="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row" id="hc-search-form" role="search">' +
    '<label class="sr-only" for="hc-search-input">Buscar en el centro de ayuda</label>' +
    '<input type="search" id="hc-search-input" name="q" placeholder="' +
    U.esc(HC.home.searchPlaceholder) +
    '" autocomplete="off" class="flex-1 rounded-full border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 font-body-md text-body-md text-on-background shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25" />' +
    '<button type="submit" class="shrink-0 rounded-full bg-primary px-6 py-3 font-body-md font-semibold text-on-primary transition hover:bg-surface-tint">Buscar</button>' +
    "</form>" +
    '<ul class="mt-4 hidden list-none space-y-2 p-0" id="hc-search-results"></ul>' +
    "</header>" +
    '<section class="mt-12 md:mt-16" aria-labelledby="hc-cats-title">' +
    '<h2 class="font-h3 text-h3 text-on-background" id="hc-cats-title">Categorías</h2>' +
    '<div class="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 md:gap-8">' +
    catsHtml +
    "</div></section>" +
    '<section class="mt-12 md:mt-16" aria-labelledby="hc-feat-title">' +
    '<h2 class="font-h3 text-h3 text-on-background" id="hc-feat-title">Tutoriales destacados</h2>' +
    '<div class="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 md:gap-8">' +
    featHtml +
    "</div></section>" +
    '<div class="mt-12 flex flex-wrap gap-4 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-6 md:p-8">' +
    '<a class="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-body-md font-semibold text-on-primary transition hover:bg-surface-tint" href="' +
    U.esc(HC.portalUrl) +
    '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
    '<a class="inline-flex items-center justify-center rounded-full border border-primary/25 bg-surface-container-lowest px-6 py-3 font-body-md font-semibold text-primary transition hover:bg-surface-container-low" href="' +
    U.root() +
    '#contacto">Contactar a Telvoice</a>' +
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
        '<li class="rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3 font-body-md text-on-surface-variant">No hay resultados. Prueba con otras palabras.</li>';
      return;
    }
    results.innerHTML = hits
      .map(function (a) {
        return (
          '<li><a class="block rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3 no-underline transition hover:border-primary/30 hover:shadow-md" href="' +
          U.articleUrl(a.slug, a.category) +
          '"><strong class="font-body-md text-on-background">' +
          U.esc(a.title) +
          '</strong><br /><span class="font-body-sm text-body-sm text-on-surface-variant">' +
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
