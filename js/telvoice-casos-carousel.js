(function () {
  var root = document.getElementById("casos-carousel");
  if (!root) {
    return;
  }

  var viewport = root.querySelector(".casos-carousel-viewport");
  var track = root.querySelector(".casos-carousel-track");
  var cards = track ? track.querySelectorAll(".caso-card") : [];
  var dotsWrap = root.querySelector(".casos-carousel-dots");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var currentPage = 0;
  var resizeTimer = null;

  if (!viewport || !track || !cards.length) {
    return;
  }

  function perPage() {
    return window.matchMedia("(min-width: 768px)").matches ? 3 : 1;
  }

  function pageCount() {
    return Math.max(1, Math.ceil(cards.length / perPage()));
  }

  function maxPage() {
    return pageCount() - 1;
  }

  function clampPage(page) {
    return Math.max(0, Math.min(page, maxPage()));
  }

  function cardStepPx() {
    var first = cards[0];
    if (!first) {
      return 0;
    }
    var gap = parseFloat(getComputedStyle(track).gap) || 0;
    return first.getBoundingClientRect().width + gap;
  }

  function updateTrack() {
    var startIndex = currentPage * perPage();
    track.style.transform = "translateX(-" + startIndex * cardStepPx() + "px)";
  }

  function updateDots() {
    if (!dotsWrap) {
      return;
    }
    var dots = dotsWrap.querySelectorAll(".casos-carousel-dot");
    dots.forEach(function (dot, i) {
      var active = i === currentPage;
      dot.classList.toggle("is-active", active);
      if (active) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  function renderDots() {
    if (!dotsWrap) {
      return;
    }
    dotsWrap.innerHTML = "";
    for (var i = 0; i < pageCount(); i += 1) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "casos-carousel-dot";
      dot.setAttribute("data-page", String(i));
      dot.setAttribute("aria-label", "Ver casos de uso " + (i + 1));
      dotsWrap.appendChild(dot);
    }
  }

  function goToPage(page, options) {
    var opts = options || {};
    currentPage = clampPage(page);
    updateTrack();
    updateDots();
    if (opts.focusCard && cards[currentPage * perPage()]) {
      cards[currentPage * perPage()].focus({ preventScroll: true });
    }
  }

  function nextPage() {
    goToPage(currentPage + 1);
  }

  function prevPage() {
    goToPage(currentPage - 1);
  }

  function pageForCardIndex(index) {
    return clampPage(Math.floor(index / perPage()));
  }

  function syncFromHash() {
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
      goToPage(pageForCardIndex(index));
    }
  }

  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      renderDots();
      goToPage(clampPage(currentPage));
    }, 120);
  }

  root.addEventListener("click", function (e) {
    var dot = e.target.closest(".casos-carousel-dot");
    if (dot) {
      e.preventDefault();
      goToPage(parseInt(dot.getAttribute("data-page"), 10));
    }
  });

  if (typeof window.TelvoiceBindSwipe === "function") {
    window.TelvoiceBindSwipe(viewport, {
      onSwipeLeft: nextPage,
      onSwipeRight: prevPage,
    });
  }

  window.addEventListener("hashchange", syncFromHash);
  window.addEventListener("resize", onResize);

  if (!reduced) {
    root.addEventListener(
      "keydown",
      function (e) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          prevPage();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          nextPage();
        }
      },
      true
    );
  }

  renderDots();
  goToPage(0);
  syncFromHash();
})();
