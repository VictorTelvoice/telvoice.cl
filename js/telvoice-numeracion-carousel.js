(function () {
  var root = document.getElementById("numeracion-carousel");
  if (!root || typeof window.TelvoiceInitScrollCarousel !== "function") {
    return;
  }

  var viewport = root.querySelector(".lab-num-carousel-viewport");
  var track = root.querySelector(".lab-num-carousel-track");
  var cards = track ? track.querySelectorAll(".lab-num-card") : [];
  var dotsWrap = root.querySelector(".lab-num-carousel-dots");
  var mqDesktop = window.matchMedia("(min-width: 768px)");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var carousel = null;
  var heightTimer = null;

  if (!viewport || !track || !cards.length) {
    return;
  }

  function syncViewportHeight() {
    if (mqDesktop.matches) {
      viewport.style.minHeight = "";
      return;
    }
    var max = 0;
    cards.forEach(function (card) {
      max = Math.max(max, card.offsetHeight);
    });
    viewport.style.minHeight = max > 0 ? max + "px" : "";
  }

  function scheduleHeightSync() {
    window.clearTimeout(heightTimer);
    heightTimer = window.setTimeout(syncViewportHeight, 80);
  }

  carousel = window.TelvoiceInitScrollCarousel({
    root: root,
    viewport: viewport,
    track: track,
    items: cards,
    dotsWrap: dotsWrap,
    dotClass: "lab-num-carousel-dot",
    observeTarget: document.getElementById("numeracion"),
    autoplayMs: 4500,
    dotLabel: function (i) {
      return "Ver beneficio de numeración " + (i + 1);
    },
    perPage: function () {
      return 1;
    },
    enabled: function () {
      return !mqDesktop.matches;
    },
  });

  if (!carousel) {
    return;
  }

  function onBreakpointChange() {
    carousel.refresh();
    scheduleHeightSync();
  }

  if (typeof mqDesktop.addEventListener === "function") {
    mqDesktop.addEventListener("change", onBreakpointChange);
  } else if (typeof mqDesktop.addListener === "function") {
    mqDesktop.addListener(onBreakpointChange);
  }

  window.addEventListener("resize", scheduleHeightSync);

  cards.forEach(function (card) {
    var img = card.querySelector("img");
    if (img && !img.complete) {
      img.addEventListener("load", scheduleHeightSync, { once: true });
    }
  });

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
    scheduleHeightSync();
  });

  scheduleHeightSync();
})();
