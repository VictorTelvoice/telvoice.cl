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
  var autoplayMs = reduced ? 0 : Number(slider.getAttribute("data-autoplay")) || 7000;
  var transitionMs = reduced ? 0 : 620;
  var current = 0;
  var timer = null;
  var hoverPaused = false;

  function setActiveGroup(nodes, index) {
    nodes.forEach(function (node, i) {
      var active = i === index;
      node.classList.toggle("is-active", active);
      node.classList.remove("is-exiting");
      node.setAttribute("aria-hidden", active ? "false" : "true");
    });
  }

  function updateDots(index) {
    dots.forEach(function (dot, i) {
      var active = i === index;
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

    var outgoing = slides[current];
    var incoming = slides[index];

    if (outgoing && outgoing !== incoming) {
      outgoing.classList.remove("is-active");
      outgoing.classList.add("is-exiting");
      outgoing.setAttribute("aria-hidden", "true");
      window.setTimeout(function () {
        outgoing.classList.remove("is-exiting");
      }, transitionMs);
    }

    if (incoming) {
      incoming.classList.add("is-active");
      incoming.classList.remove("is-exiting");
      incoming.setAttribute("aria-hidden", "false");
    }

    slides.forEach(function (slide, i) {
      if (i !== index) {
        slide.classList.remove("is-active");
        slide.setAttribute("aria-hidden", "true");
      }
    });

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
    if (autoplayMs <= 0 || hoverPaused) {
      return;
    }
    timer = window.setInterval(nextSlide, autoplayMs);
  }

  heroSection.addEventListener("click", function (e) {
    var dot = e.target.closest(".tv-hero-dot");
    if (dot) {
      e.preventDefault();
      goTo(dot.getAttribute("data-slide-to"));
      return;
    }
    if (e.target.closest(".tv-hero-slider-nav--prev")) {
      e.preventDefault();
      prevSlide();
      return;
    }
    if (e.target.closest(".tv-hero-slider-nav--next")) {
      e.preventDefault();
      nextSlide();
    }
  });

  heroSection.addEventListener("mouseenter", function () {
    hoverPaused = true;
    clearAutoplay();
  });
  heroSection.addEventListener("mouseleave", function () {
    hoverPaused = false;
    resetAutoplay();
  });
  heroSection.addEventListener("focusin", function () {
    hoverPaused = true;
    clearAutoplay();
  });
  heroSection.addEventListener("focusout", function (e) {
    if (heroSection.contains(e.relatedTarget)) {
      return;
    }
    hoverPaused = false;
    resetAutoplay();
  });

  goTo(0);
})();
