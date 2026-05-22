(function () {
  var HC = window.HELP_CENTER;
  var U = window.HC_UTILS;
  if (!HC || !U) return;

  var slug = document.body.getAttribute("data-article-slug");
  var article = slug && HC.articles[slug];
  if (!article) {
    document.body.innerHTML = "<p>Artículo no encontrado.</p>";
    return;
  }

  var main = U.mountShell("home");
  var r = U.root();
  var cat = HC.categories.find(function (c) {
    return c.slug === article.category;
  });
  var catHref = cat ? r + "ayuda/" + cat.href : r + "ayuda/";

  function videoBlock() {
    var url = (article.videoUrl || "").trim();
    if (url) {
      var embed = url;
      if (url.indexOf("youtube.com/watch") !== -1) {
        var id = url.split("v=")[1];
        if (id) id = id.split("&")[0];
        embed = "https://www.youtube.com/embed/" + id;
      } else if (url.indexOf("youtu.be/") !== -1) {
        embed = "https://www.youtube.com/embed/" + url.split("youtu.be/")[1].split("?")[0];
      }
      return (
        '<div class="hc-video" role="region" aria-label="Video del tutorial">' +
        '<div class="hc-video-inner"><iframe src="' +
        U.esc(embed) +
        '" title="' +
        U.esc(article.videoTitle) +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>' +
        '<p class="hc-video-caption">' +
        U.esc(article.videoTitle) +
        "</p></div>"
      );
    }
    return (
      '<div class="hc-video" role="region" aria-label="Video del tutorial">' +
      '<div class="hc-video-inner">' +
      '<div class="hc-video-placeholder">' +
      '<span class="material-symbols-outlined" aria-hidden="true">smart_display</span>' +
      "<p><strong>Video en preparación</strong></p>" +
      "<p>Pronto publicaremos el video de este tutorial. Mientras tanto, sigue los pasos numerados.</p>" +
      "</div></div>" +
      '<p class="hc-video-caption">' +
      U.esc(article.videoTranscript) +
      "</p></div>"
    );
  }

  var stepsHtml = (article.steps || [])
    .map(function (s) {
      var img =
        s.imageUrl && s.imageUrl.trim()
          ? '<div class="hc-step-img"><img src="' +
            U.esc(r + s.imageUrl.replace(/^\//, "")) +
            '" alt="' +
            U.esc(s.imageAlt || "") +
            '" loading="lazy" decoding="async" /></div>'
          : '<div class="hc-step-img" aria-hidden="true">Captura disponible próximamente</div>';
      return (
        '<li class="hc-step">' +
        '<span class="hc-step-num" aria-hidden="true">' +
        s.stepNumber +
        "</span>" +
        "<div>" +
        "<h3>" +
        U.esc(s.stepTitle) +
        "</h3>" +
        "<p>" +
        U.esc(s.stepBody) +
        "</p>" +
        img +
        "</div></li>"
      );
    })
    .join("");

  var relatedHtml = (article.relatedArticles || [])
    .map(function (relSlug) {
      var rel = HC.articles[relSlug];
      if (!rel) return "";
      return (
        '<li><a href="' +
        U.articleUrl(rel.slug, rel.category) +
        '">' +
        U.esc(rel.title) +
        "</a></li>"
      );
    })
    .join("");

  main.innerHTML =
    '<article class="hc-article-wrap">' +
    '<nav aria-label="Breadcrumb"><ol class="hc-breadcrumbs">' +
    "<li><a href=\"" +
    r +
    'ayuda/">Centro de ayuda</a></li>" +
    "<li aria-hidden=\"true\"> / </li>" +
    "<li><a href=\"" +
    catHref +
    '">' +
    U.esc(article.categoryTitle) +
    "</a></li>" +
    "<li aria-hidden=\"true\"> / </li>" +
    "<li>" +
    U.esc(article.title) +
    "</li></ol></nav>" +
    '<header class="hc-article-header">' +
    "<h1>" +
    U.esc(article.title) +
    "</h1>" +
    '<p class="hc-article-meta"><span>' +
    U.esc(article.categoryTitle) +
    "</span><span>Tiempo estimado: " +
    U.esc(article.estimatedTime) +
    "</span></p>" +
    '<p class="hc-article-summary">' +
    U.esc(article.summary) +
    "</p></header>" +
    videoBlock() +
    '<section class="hc-block" aria-labelledby="hc-pre-req">' +
    '<h2 id="hc-pre-req">Requisitos previos</h2>' +
    "<ul class=\"hc-list\">" +
    (article.prerequisites || [])
      .map(function (p) {
        return "<li>" + U.esc(p) + "</li>";
      })
      .join("") +
    "</ul></section>" +
    '<section class="hc-block" aria-labelledby="hc-steps">' +
    '<h2 id="hc-steps">Pasos</h2>' +
    '<ol class="hc-steps">' +
    stepsHtml +
    "</ol></section>" +
    (article.notes && article.notes.length
      ? '<aside class="hc-note" role="note"><strong>Notas</strong><ul>' +
        article.notes
          .map(function (n) {
            return "<li>" + U.esc(n) + "</li>";
          })
          .join("") +
        "</ul></aside>"
      : "") +
    '<section class="hc-related" aria-labelledby="hc-related">' +
    '<h2 id="hc-related">Artículos relacionados</h2>' +
    "<ul>" +
    relatedHtml +
    "</ul></section>" +
    '<div class="hc-actions">' +
    '<a class="hc-btn hc-btn--primary" href="' +
    U.esc(HC.portalUrl) +
    '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
    '<a class="hc-btn hc-btn--secondary" href="' +
    r +
    '#contacto">Contactar a Telvoice</a>' +
    "</div></article>";

  document.title = article.seoTitle;
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", article.seoDescription);

  var howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: article.title,
    description: article.summary,
    totalTime: "PT" + article.estimatedTime.replace(/\D/g, "") + "M",
    step: (article.steps || []).map(function (s) {
      return {
        "@type": "HowToStep",
        position: s.stepNumber,
        name: s.stepTitle,
        text: s.stepBody,
      };
    }),
  };
  var script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(howTo);
  document.head.appendChild(script);
})();
