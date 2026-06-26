/**
 * CTAs y tracking en landings SEO.
 */
(function () {
  "use strict";

  function track(name, detail) {
    if (typeof window.TelvoiceTrack === "function") {
      window.TelvoiceTrack(name, detail);
    }
  }

  document.querySelectorAll("[data-seo-track]").forEach(function (el) {
    el.addEventListener("click", function () {
      var evt = el.getAttribute("data-seo-track");
      if (evt) track(evt, { page: window.location.pathname });
    });
  });
})();
