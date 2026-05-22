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
  var articles = U.allArticles().filter(function (a) {
    return a.category === catSlug;
  });

  var listHtml =
    articles.length > 0
      ? articles
          .map(function (a) {
            return (
              '<a class="hc-card" href="' +
              U.articleUrl(a.slug, a.category) +
              '">' +
              '<span class="hc-card-icon material-symbols-outlined" aria-hidden="true">article</span>' +
              "<h3>" +
              U.esc(a.title) +
              "</h3>" +
              "<p>" +
              U.esc(a.summary) +
              '</p><span class="hc-card-meta">' +
              U.esc(a.estimatedTime) +
              "</span></a>"
            );
          })
          .join("")
      : '<div class="hc-empty"><p>Estamos preparando nuevos artículos para esta categoría.</p><p><a href="' +
        r +
        'ayuda/">Volver al centro de ayuda</a></p></div>';

  var extra = "";
  if (catSlug === "preguntas-frecuentes") {
    extra =
      '<p class="hc-category-intro" style="margin-top:1rem">También puedes revisar las <a href="' +
      r +
      '#faq">preguntas frecuentes del sitio principal</a>.</p>';
  }

  main.innerHTML =
    '<div class="hc-article-wrap">' +
    '<nav aria-label="Breadcrumb"><ol class="hc-breadcrumbs">' +
    "<li><a href=\"" +
    r +
    'ayuda/">Centro de ayuda</a></li>" +
    "<li aria-hidden=\"true\"> / </li>" +
    "<li>" +
    U.esc(cat.title) +
    "</li></ol></nav>" +
    "<h1>" +
    U.esc(cat.title) +
    "</h1>" +
    '<p class="hc-category-intro">' +
    U.esc(cat.description) +
    "</p>" +
    extra +
    '<div class="hc-grid hc-grid--featured" style="margin-top:1.5rem">' +
    listHtml +
    "</div></div>";

  document.title = cat.title + " | Centro de ayuda Telvoice";
})();
