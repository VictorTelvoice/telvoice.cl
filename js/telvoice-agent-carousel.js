(function () {
  var root = document.getElementById("tv-agent-carousel");
  if (!root) {
    return;
  }

  var viewport = root.querySelector(".lab-agent-carousel-viewport");
  var track = root.querySelector(".lab-agent-carousel-track");
  var cards = track ? track.querySelectorAll(".lab-glass-card") : [];
  var dotsWrap = root.querySelector(".lab-agent-carousel-dots");
  var mqDesktop = window.matchMedia("(min-width: 1024px)");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var currentPage = 0;
  var resizeTimer = null;

  if (!viewport || !track || !cards.length) {
    return;
  }

  function isDesktop() {
    return mqDesktop.matches;
  }

  function perPage() {
    return isDesktop() ? cards.length : 1;
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
    var gap = parseFloat(getComputedStyle(track).gap) || 0;
    if (viewport) {
      var viewportWidth = viewport.getBoundingClientRect().width;
      if (viewportWidth > 0) {
        return viewportWidth + gap;
      }
    }
    var first = cards[0];
    if (!first) {
      return 0;
    }
    return first.getBoundingClientRect().width + gap;
  }

  function updateTrack() {
    if (isDesktop()) {
      track.style.transform = "";
      return;
    }
    var startIndex = currentPage * perPage();
    track.style.transform = "translateX(-" + startIndex * cardStepPx() + "px)";
  }

  function updateDots() {
    if (!dotsWrap) {
      return;
    }
    dotsWrap.hidden = isDesktop();
    var dots = dotsWrap.querySelectorAll(".lab-agent-carousel-dot");
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
      dot.className = "lab-agent-carousel-dot";
      dot.setAttribute("data-page", String(i));
      dot.setAttribute("aria-label", "Ver capacidad " + (i + 1) + " de " + cards.length);
      dotsWrap.appendChild(dot);
    }
  }

  function goToPage(page) {
    currentPage = clampPage(page);
    updateTrack();
    updateDots();
  }

  function nextPage() {
    goToPage(currentPage + 1);
  }

  function prevPage() {
    goToPage(currentPage - 1);
  }

  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      renderDots();
      goToPage(clampPage(currentPage));
    }, 120);
  }

  root.addEventListener("click", function (e) {
    var dot = e.target.closest(".lab-agent-carousel-dot");
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

  if (typeof mqDesktop.addEventListener === "function") {
    mqDesktop.addEventListener("change", onResize);
  } else if (typeof mqDesktop.addListener === "function") {
    mqDesktop.addListener(onResize);
  }

  window.addEventListener("resize", onResize);

  if (!reduced) {
    root.addEventListener(
      "keydown",
      function (e) {
        if (isDesktop()) {
          return;
        }
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

  window.addEventListener("load", function () {
    goToPage(currentPage);
  });
})();
