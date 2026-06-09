(function () {
  var HC = window.HELP_CENTER;
  var U = window.HC_UTILS;
  if (!HC || !U) return;

  var slug = document.body.getAttribute("data-article-slug");
  var article = slug && HC.articles[slug];
  if (!article) {
    document.body.innerHTML = "<p class=\"p-8 font-body-md\">Artículo no encontrado.</p>";
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
        '<div class="mt-8 overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm" role="region" aria-label="Video del tutorial">' +
        '<div class="hc-video-inner"><iframe src="' +
        U.esc(embed) +
        '" title="' +
        U.esc(article.videoTitle) +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>' +
        '<p class="border-t border-outline-variant/40 px-4 py-2 font-body-sm text-body-sm text-on-surface-variant">' +
        U.esc(article.videoTitle) +
        "</p></div>"
      );
    }
    return (
      '<div class="mt-8 overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm" role="region" aria-label="Video del tutorial">' +
      '<div class="hc-video-inner">' +
      '<div class="hc-video-placeholder">' +
      '<span class="material-symbols-outlined text-5xl text-primary/70" aria-hidden="true">smart_display</span>' +
      "<p class=\"font-body-md font-semibold text-white\">Video en preparación</p>" +
      "<p class=\"max-w-sm font-body-sm text-body-sm text-slate-300\">Pronto publicaremos el video. Mientras tanto, sigue los pasos numerados.</p>" +
      "</div></div>" +
      '<p class="border-t border-outline-variant/40 px-4 py-2 font-body-sm text-body-sm text-on-surface-variant">' +
      U.esc(article.videoTranscript) +
      "</p></div>"
    );
  }

  var stepsHtml = (article.steps || [])
    .map(function (s) {
      var img =
        s.imageUrl && s.imageUrl.trim()
          ? '<div class="hc-step-img mt-3"><img src="' +
            U.esc(r + s.imageUrl.replace(/^\//, "")) +
            '" alt="' +
            U.esc(s.imageAlt || "") +
            '" loading="lazy" decoding="async" /></div>'
          : '<div class="hc-step-img mt-3" aria-hidden="true">Captura disponible próximamente</div>';
      return (
        '<li class="flex gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-sm">' +
        '<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-h3 text-body-sm font-bold text-on-primary" aria-hidden="true">' +
        s.stepNumber +
        "</span>" +
        "<div class=\"min-w-0 flex-1\">" +
        '<h3 class="font-h3 text-h3 text-on-background">' +
        U.esc(s.stepTitle) +
        "</h3>" +
        '<p class="mt-2 font-body-md text-body-md text-on-surface-variant leading-relaxed">' +
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
      return U.renderCard({
        href: U.articleUrl(rel.slug, rel.category),
        icon: "article",
        title: rel.title,
        description: rel.summary,
        meta: rel.estimatedTime,
      });
    })
    .join("");

  main.innerHTML =
    '<article class="mx-auto max-w-5xl">' +
    '<nav aria-label="Breadcrumb" class="mb-6 font-body-sm text-body-sm text-on-surface-variant">' +
    '<a href="' +
    r +
    'ayuda/" class="text-primary hover:underline">Centro de ayuda</a>' +
    ' <span aria-hidden="true">/</span> ' +
    '<a href="' +
    catHref +
    '" class="text-primary hover:underline">' +
    U.esc(article.categoryTitle) +
    "</a>" +
    ' <span aria-hidden="true">/</span> ' +
    "<span>" +
    U.esc(article.title) +
    "</span></nav>" +
    '<header class="section-bg-sky rounded-2xl border border-outline-variant/40 px-6 py-8 md:px-10">' +
    '<span class="section-eyebrow">' +
    U.esc(article.categoryTitle) +
    "</span>" +
    "<h1 class=\"mt-2 font-h2 text-h2 text-on-background leading-tight\">" +
    U.esc(article.title) +
    "</h1>" +
    '<p class="mt-3 font-body-sm text-body-sm text-on-surface-variant">Tiempo estimado: ' +
    U.esc(article.estimatedTime) +
    "</p>" +
    '<p class="mt-4 section-intro text-on-surface-variant">' +
    U.esc(article.summary) +
    "</p></header>" +
    videoBlock() +
    '<section class="mt-10" aria-labelledby="hc-pre-req">' +
    '<h2 id="hc-pre-req" class="font-h3 text-h3 text-on-background">Requisitos previos</h2>' +
    '<ul class="mt-4 list-disc space-y-2 pl-5 font-body-md text-body-md text-on-surface-variant">' +
    (article.prerequisites || [])
      .map(function (p) {
        return "<li>" + U.esc(p) + "</li>";
      })
      .join("") +
    "</ul></section>" +
    '<section class="mt-10" aria-labelledby="hc-steps">' +
    '<h2 id="hc-steps" class="font-h3 text-h3 text-on-background">Pasos</h2>' +
    '<ol class="mt-6 list-none space-y-4 p-0">' +
    stepsHtml +
    "</ol></section>" +
    (article.notes && article.notes.length
      ? '<aside class="mt-10 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-4 py-3 font-body-md text-body-md text-amber-950" role="note"><strong>Notas</strong><ul class="mt-2 list-disc space-y-1 pl-5">' +
        article.notes
          .map(function (n) {
            return "<li>" + U.esc(n) + "</li>";
          })
          .join("") +
        "</ul></aside>"
      : "") +
    (relatedHtml
      ? '<section class="mt-12 border-t border-outline-variant/40 pt-10" aria-labelledby="hc-related">' +
        '<h2 id="hc-related" class="font-h3 text-h3 text-on-background">Artículos relacionados</h2>' +
        '<div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">' +
        relatedHtml +
        "</div></section>"
      : "") +
    '<div class="mt-12 flex flex-wrap gap-4">' +
    '<a class="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-body-md font-semibold text-on-primary transition hover:bg-surface-tint" href="' +
    U.esc(HC.portalUrl) +
    '" target="_blank" rel="noopener noreferrer">Ir al portal</a>' +
    '<a class="inline-flex items-center justify-center rounded-full border border-primary/25 px-6 py-3 font-body-md font-semibold text-primary transition hover:bg-surface-container-low" href="' +
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
