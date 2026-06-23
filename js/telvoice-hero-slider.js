(function () {
  var slider = document.getElementById("hero-copy-slider");
  var heroSection = document.getElementById("inicio");
  if (!slider || !heroSection) {
    return;
  }

  var slides = slider.querySelectorAll(".tv-hero-slide");
  var capSlides = slider.querySelectorAll(".tv-hero-cap-slide");
  var ctaSlides = slider.querySelectorAll(".tv-hero-cta-slide");
  var dots = heroSection.querySelectorAll(".tv-hero-dot");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileMq = window.matchMedia("(max-width: 767px)");
  var defaultAutoplay = Number(slider.getAttribute("data-autoplay")) || 7000;
  var autoplayMs = reduced ? 0 : defaultAutoplay;
  var current = 0;
  var timer = null;
  var hoverPaused = false;
  var inView = true;

  function resolveAutoplayMs() {
    if (reduced) {
      return 0;
    }
    if (mobileMq.matches) {
      return Math.max(defaultAutoplay, 9000);
    }
    return defaultAutoplay;
  }

  function setActiveGroup(nodes, index) {
    nodes.forEach(function (node, i) {
      var active = i === index;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-hidden", active ? "false" : "true");
    });
  }

  function updateDots(index) {
    dots.forEach(function (dot) {
      var slideTo = parseInt(dot.getAttribute("data-slide-to"), 10);
      var active = slideTo === index;
      dot.classList.toggle("is-active", active);
      if (active) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  function goTo(index) {
    index = parseInt(index, 10);
    if (isNaN(index) || !slides.length) {
      return;
    }
    index = ((index % slides.length) + slides.length) % slides.length;

    setActiveGroup(slides, index);
    setActiveGroup(capSlides, index);
    setActiveGroup(ctaSlides, index);
    updateDots(index);
    current = index;
    resetAutoplay();
  }

  function nextSlide() {
    goTo(current + 1);
  }

  function prevSlide() {
    goTo(current - 1);
  }

  function clearAutoplay() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function resetAutoplay() {
    clearAutoplay();
    autoplayMs = resolveAutoplayMs();
    if (autoplayMs <= 0 || hoverPaused || !inView) {
      return;
    }
    timer = window.setInterval(nextSlide, autoplayMs);
  }

  slider.addEventListener("click", function (e) {
    var dot = e.target.closest(".tv-hero-dot");
    if (dot) {
      e.preventDefault();
      goTo(dot.getAttribute("data-slide-to"));
    }
  });

  if (typeof window.TelvoiceBindSwipe === "function") {
    window.TelvoiceBindSwipe(slider, {
      onSwipeLeft: nextSlide,
      onSwipeRight: prevSlide,
    });
  }

  slider.addEventListener("mouseenter", function () {
    hoverPaused = true;
    clearAutoplay();
  });
  slider.addEventListener("mouseleave", function () {
    hoverPaused = false;
    resetAutoplay();
  });
  slider.addEventListener("focusin", function () {
    hoverPaused = true;
    clearAutoplay();
  });
  slider.addEventListener("focusout", function (e) {
    if (slider.contains(e.relatedTarget)) {
      return;
    }
    hoverPaused = false;
    resetAutoplay();
  });

  if (typeof IntersectionObserver === "function") {
    var visibilityObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          inView = entry.isIntersecting;
          if (inView) {
            resetAutoplay();
          } else {
            clearAutoplay();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    visibilityObserver.observe(slider);
  }

  if (typeof mobileMq.addEventListener === "function") {
    mobileMq.addEventListener("change", resetAutoplay);
  } else if (typeof mobileMq.addListener === "function") {
    mobileMq.addListener(resetAutoplay);
  }

  goTo(0);
})();
