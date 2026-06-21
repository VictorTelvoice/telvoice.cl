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
    var observeTarget = options.observeTarget || root;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var autoplayMs = options.autoplayMs;
    if (autoplayMs === undefined) {
      autoplayMs = parseInt(root.getAttribute("data-autoplay"), 10);
    }
    if (isNaN(autoplayMs)) {
      autoplayMs = 4500;
    }
    if (reduced) {
      autoplayMs = 0;
    }
    var introHintMs = options.introHintMs;
    if (introHintMs === undefined) {
      introHintMs = parseInt(root.getAttribute("data-intro-hint"), 10);
    }
    if (isNaN(introHintMs)) {
      introHintMs = 320;
    }
    if (reduced) {
      introHintMs = 0;
    }
    var currentPage = 0;
    var resizeTimer = null;
    var scrollTimer = null;
    var autoplayTimer = null;
    var introTimer = null;
    var syncing = false;
    var userPaused = false;
    var inView = false;
    var introPlayed = false;

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
        clearAutoplay();
      }
      renderDots();
      updateDots();
    }

    function clearAutoplay() {
      if (autoplayTimer) {
        window.clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    function clearIntroHint() {
      if (introTimer) {
        window.clearTimeout(introTimer);
        introTimer = null;
      }
    }

    function runIntroHint() {
      if (introPlayed || !inView || !isActive() || maxPage() < 1 || introHintMs <= 0) {
        return false;
      }
      introPlayed = true;
      clearAutoplay();
      introTimer = window.setTimeout(function () {
        introTimer = null;
        if (!inView || !isActive()) {
          resetAutoplay();
          return;
        }
        goToPage(1, "smooth");
      }, introHintMs);
      return true;
    }

    function onEnterView() {
      if (runIntroHint()) {
        return;
      }
      resetAutoplay();
    }

    function resetAutoplay() {
      clearAutoplay();
      if (!autoplayMs || userPaused || !inView || !isActive()) {
        return;
      }
      autoplayTimer = window.setInterval(function () {
        if (currentPage >= maxPage()) {
          goToPage(0);
        } else {
          goToPage(currentPage + 1);
        }
      }, autoplayMs);
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
        resetAutoplay();
      }, reduced ? 0 : 520);
    }

    function nextPage() {
      if (currentPage >= maxPage()) {
        goToPage(0);
      } else {
        goToPage(currentPage + 1);
      }
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

    if (autoplayMs && typeof IntersectionObserver === "function" && observeTarget) {
      var visibilityObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            inView = entry.isIntersecting;
            if (inView) {
              onEnterView();
            } else {
              clearAutoplay();
              clearIntroHint();
            }
          });
        },
        {
          threshold: 0.35,
          rootMargin: "0px 0px -6% 0px",
        }
      );
      visibilityObserver.observe(observeTarget);
    }

    root.addEventListener("mouseenter", function () {
      userPaused = true;
      clearAutoplay();
    });
    root.addEventListener("mouseleave", function () {
      userPaused = false;
      resetAutoplay();
    });
    root.addEventListener("focusin", function () {
      userPaused = true;
      clearAutoplay();
    });
    root.addEventListener("focusout", function (e) {
      if (root.contains(e.relatedTarget)) {
        return;
      }
      userPaused = false;
      resetAutoplay();
    });
    viewport.addEventListener(
      "touchstart",
      function () {
        userPaused = true;
        clearAutoplay();
      },
      { passive: true }
    );
    viewport.addEventListener(
      "touchend",
      function () {
        window.setTimeout(function () {
          userPaused = false;
          resetAutoplay();
        }, 800);
      },
      { passive: true }
    );

    applyDesktopState();
    goToPage(0, "auto");

    return {
      goToPage: goToPage,
      getCurrentPage: function () {
        return currentPage;
      },
      refresh: onResize,
      pauseAutoplay: function () {
        userPaused = true;
        clearAutoplay();
      },
      resumeAutoplay: function () {
        userPaused = false;
        resetAutoplay();
      },
    };
  }

  global.TelvoiceInitScrollCarousel = initScrollCarousel;
})(window);
