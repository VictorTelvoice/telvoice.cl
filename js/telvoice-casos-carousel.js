(function () {
  var root = document.getElementById("casos-carousel");
  if (!root || typeof window.TelvoiceInitScrollCarousel !== "function") {
    return;
  }

  var viewport = root.querySelector(".casos-carousel-viewport");
  var track = root.querySelector(".casos-carousel-track");
  var cards = track ? track.querySelectorAll(".caso-card") : [];
  var dotsWrap = root.querySelector(".casos-carousel-dots");
  var mqDesktop = window.matchMedia("(min-width: 768px)");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var carousel = null;

  if (!viewport || !track || !cards.length) {
    return;
  }

  function perPage() {
    return mqDesktop.matches ? 3 : 1;
  }

  function pageForCardIndex(index) {
    return Math.max(0, Math.min(Math.floor(index / perPage()), Math.ceil(cards.length / perPage()) - 1));
  }

  function syncFromHash() {
    if (!carousel) {
      return;
    }
    var hash = window.location.hash;
    if (!hash || hash.indexOf("#caso-") !== 0) {
      return;
    }
    var card = document.querySelector("#casos-uso " + hash);
    if (!card) {
      return;
    }
    var index = Array.prototype.indexOf.call(cards, card);
    if (index >= 0) {
      carousel.goToPage(pageForCardIndex(index), reduced ? "auto" : "smooth");
    }
  }

  carousel = window.TelvoiceInitScrollCarousel({
    root: root,
    viewport: viewport,
    track: track,
    items: cards,
    dotsWrap: dotsWrap,
    dotClass: "casos-carousel-dot",
    dotLabel: function (i) {
      return "Ver casos de uso " + (i + 1);
    },
    perPage: perPage,
    enabled: function () {
      return true;
    },
  });

  if (!carousel) {
    return;
  }

  if (typeof mqDesktop.addEventListener === "function") {
    mqDesktop.addEventListener("change", function () {
      carousel.refresh();
      syncFromHash();
    });
  } else if (typeof mqDesktop.addListener === "function") {
    mqDesktop.addListener(function () {
      carousel.refresh();
      syncFromHash();
    });
  }

  window.addEventListener("hashchange", syncFromHash);

  if (!reduced) {
    root.addEventListener(
      "keydown",
      function (e) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          carousel.goToPage(carousel.getCurrentPage() - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          carousel.goToPage(carousel.getCurrentPage() + 1);
        }
      },
      true
    );
  }

  window.addEventListener("load", function () {
    carousel.refresh();
    syncFromHash();
  });

  syncFromHash();
})();
