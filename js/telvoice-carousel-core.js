(function (global) {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  /**
   * Carrusel horizontal con scroll-snap nativo (más fiable que translateX en móvil).
   */
  function initScrollCarousel(options) {
    var root = options.root;
    var viewport = options.viewport;
    var track = options.track;
    var items = options.items;
    var dotsWrap = options.dotsWrap;
    var dotClass = options.dotClass;
    var dotLabel = options.dotLabel || function (i) {
      return "Ir a la diapositiva " + (i + 1);
    };
    var perPage = options.perPage || function () {
      return 1;
    };
    var enabled = options.enabled || function () {
      return true;
    };
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var currentPage = 0;
    var resizeTimer = null;
    var scrollTimer = null;
    var syncing = false;

    if (!root || !viewport || !track || !items.length) {
      return null;
    }

    function isActive() {
      return enabled();
    }

    function pages() {
      return Math.max(1, Math.ceil(items.length / perPage()));
    }

    function maxPage() {
      return pages() - 1;
    }

    function pageWidthPx() {
      return viewport.clientWidth || viewport.getBoundingClientRect().width || 0;
    }

    function scrollLeftForPage(page) {
      var index = clamp(page, 0, maxPage()) * perPage();
      var item = items[index];
      if (item) {
        return item.offsetLeft;
      }
      return clamp(page, 0, maxPage()) * pageWidthPx();
    }

    function pageFromScroll() {
      var width = pageWidthPx();
      if (width <= 0) {
        return 0;
      }
      var nearest = 0;
      var best = Infinity;
      for (var p = 0; p <= maxPage(); p += 1) {
        var delta = Math.abs(viewport.scrollLeft - scrollLeftForPage(p));
        if (delta < best) {
          best = delta;
          nearest = p;
        }
      }
      return nearest;
    }

    function updateDots() {
      if (!dotsWrap) {
        return;
      }
      dotsWrap.hidden = !isActive();
      var dots = dotsWrap.querySelectorAll("." + dotClass);
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
      if (!isActive()) {
        return;
      }
      for (var i = 0; i < pages(); i += 1) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = dotClass;
        dot.setAttribute("data-page", String(i));
        dot.setAttribute("aria-label", dotLabel(i, pages()));
        dotsWrap.appendChild(dot);
      }
    }

    function applyDesktopState() {
      if (isActive()) {
        track.style.transform = "";
        viewport.style.overflowX = "";
      } else {
        viewport.scrollLeft = 0;
        track.style.transform = "";
      }
      renderDots();
      updateDots();
    }

    function scrollViewport(left, behavior) {
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({ left: left, behavior: behavior || "auto" });
      } else {
        viewport.scrollLeft = left;
      }
    }

    function goToPage(page, behavior) {
      if (!isActive()) {
        currentPage = 0;
        applyDesktopState();
        return;
      }
      currentPage = clamp(page, 0, maxPage());
      syncing = true;
      scrollViewport(scrollLeftForPage(currentPage), behavior || (reduced ? "auto" : "smooth"));
      updateDots();
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(function () {
        syncing = false;
      }, reduced ? 0 : 520);
    }

    function nextPage() {
      goToPage(currentPage + 1);
    }

    function prevPage() {
      goToPage(currentPage - 1);
    }

    function onScroll() {
      if (!isActive() || syncing) {
        return;
      }
      var next = pageFromScroll();
      if (next !== currentPage) {
        currentPage = next;
        updateDots();
      }
    }

    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        applyDesktopState();
        if (isActive()) {
          goToPage(clamp(currentPage, 0, maxPage()), "auto");
        }
      }, 120);
    }

    root.addEventListener("click", function (e) {
      var dot = e.target.closest("." + dotClass);
      if (!dot || !isActive()) {
        return;
      }
      e.preventDefault();
      goToPage(parseInt(dot.getAttribute("data-page"), 10));
    });

    viewport.addEventListener("scroll", onScroll, { passive: true });

    if (typeof global.TelvoiceBindSwipe === "function") {
      global.TelvoiceBindSwipe(viewport, {
        onSwipeLeft: function () {
          if (isActive()) {
            nextPage();
          }
        },
        onSwipeRight: function () {
          if (isActive()) {
            prevPage();
          }
        },
      });
    }

    window.addEventListener("resize", onResize);

    applyDesktopState();
    goToPage(0, "auto");

    return {
      goToPage: goToPage,
      getCurrentPage: function () {
        return currentPage;
      },
      refresh: onResize,
    };
  }

  global.TelvoiceInitScrollCarousel = initScrollCarousel;
})(window);
