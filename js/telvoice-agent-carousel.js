(function () {
  var root = document.getElementById("tv-agent-carousel");
  if (!root || typeof window.TelvoiceInitScrollCarousel !== "function") {
    return;
  }

  var viewport = root.querySelector(".lab-agent-carousel-viewport");
  var track = root.querySelector(".lab-agent-carousel-track");
  var cards = track ? track.querySelectorAll(".lab-glass-card") : [];
  var dotsWrap = root.querySelector(".lab-agent-carousel-dots");
  var mqDesktop = window.matchMedia("(min-width: 1024px)");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var carousel = null;

  if (!viewport || !track || !cards.length) {
    return;
  }

  carousel = window.TelvoiceInitScrollCarousel({
    root: root,
    viewport: viewport,
    track: track,
    items: cards,
    dotsWrap: dotsWrap,
    dotClass: "lab-agent-carousel-dot",
    dotLabel: function (i) {
      return "Ver capacidad " + (i + 1) + " de " + cards.length;
    },
    perPage: function () {
      return mqDesktop.matches ? cards.length : 1;
    },
    enabled: function () {
      return !mqDesktop.matches;
    },
  });

  if (!carousel) {
    return;
  }

  if (typeof mqDesktop.addEventListener === "function") {
    mqDesktop.addEventListener("change", function () {
      carousel.refresh();
    });
  } else if (typeof mqDesktop.addListener === "function") {
    mqDesktop.addListener(function () {
      carousel.refresh();
    });
  }

  if (!reduced) {
    root.addEventListener(
      "keydown",
      function (e) {
        if (mqDesktop.matches) {
          return;
        }
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
  });
})();
