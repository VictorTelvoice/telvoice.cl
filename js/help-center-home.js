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
      return (
        '<a class="hc-card" href="' +
        U.root() +
        "ayuda/" +
        c.href +
        '">' +
        '<span class="hc-card-icon material-symbols-outlined" aria-hidden="true">folder</span>' +
        "<h3>" +
        U.esc(c.title) +
        "</h3>" +
        "<p>" +
        U.esc(c.description) +
        "</p></a>"
      );
    })
    .join("");

  var featHtml = featured
    .map(function (a) {
      return (
        '<a class="hc-card" href="' +
        U.articleUrl(a.slug, a.category) +
        '">' +
        '<span class="hc-card-icon material-symbols-outlined" aria-hidden="true">play_circle</span>' +
        "<h3>" +
        U.esc(a.title) +
        "</h3>" +
        "<p>" +
        U.esc(a.summary) +
        '</p><span class="hc-card-meta">' +
        U.esc(a.estimatedTime) +
        " · Tutorial</span></a>"
      );
    })
    .join("");

  main.innerHTML =
    '<div class="hc-hero">' +
    "<h1>" +
    U.esc(HC.home.title) +
    "</h1>" +
    "<p>" +
    U.esc(HC.home.subtitle) +
    "</p>" +
    '<form class="hc-search" id="hc-search-form" role="search">' +
    '<label class="sr-only" for="hc-search-input">Buscar en el centro de ayuda</label>' +
    '<input type="search" id="hc-search-input" name="q" placeholder="' +
    U.esc(HC.home.searchPlaceholder) +
    '" autocomplete="off" />' +
    '<button type="submit" class="hc-btn hc-btn--primary">Buscar</button>' +
    "</form>" +
    '<ul class="hc-search-results" id="hc-search-results" hidden></ul>' +
    "</div>" +
    '<section aria-labelledby="hc-cats-title">' +
    '<h2 class="hc-section-title" id="hc-cats-title">Categorías</h2>' +
    '<div class="hc-grid hc-grid--cats">' +
    catsHtml +
    "</div></section>" +
    '<section style="margin-top:2.5rem" aria-labelledby="hc-feat-title">' +
    '<h2 class="hc-section-title" id="hc-feat-title">Tutoriales destacados</h2>' +
    '<div class="hc-grid hc-grid--featured">' +
    featHtml +
    "</div></section>" +
    '<div class="hc-actions">' +
    '<a class="hc-btn hc-btn--primary" href="' +
    U.esc(HC.portalUrl) +
    '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
    '<a class="hc-btn hc-btn--secondary" href="' +
    U.root() +
    '#contacto">Contactar a Telvoice</a>' +
    "</div>";

  var form = document.getElementById("hc-search-form");
  var input = document.getElementById("hc-search-input");
  var results = document.getElementById("hc-search-results");

  function searchArticles(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) {
      results.hidden = true;
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
    if (!hits.length) {
      results.hidden = false;
      results.innerHTML = "<li>No hay resultados. Prueba con otras palabras.</li>";
      return;
    }
    results.hidden = false;
    results.innerHTML = hits
      .map(function (a) {
        return (
          "<li><a href=\"" +
          U.articleUrl(a.slug, a.category) +
          '"><strong>' +
          U.esc(a.title) +
          "</strong><br />" +
          U.esc(a.summary) +
          "</a></li>"
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
      results.hidden = true;
      results.innerHTML = "";
    }
  });
})();
