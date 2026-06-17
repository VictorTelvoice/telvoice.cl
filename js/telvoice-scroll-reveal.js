(function () {
  var MOBILE_MQ = window.matchMedia("(max-width: 767px)");
  var REDUCED_MQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var observer = null;

  function revealAll(items) {
    items.forEach(function (item) {
      item.classList.add("is-revealed");
    });
  }

  function bindObserver() {
    var items = document.querySelectorAll(".tv-scroll-reveal-stack .tv-scroll-reveal-item");
    if (!items.length) {
      return;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (!MOBILE_MQ.matches || REDUCED_MQ.matches) {
      revealAll(items);
      return;
    }

    items.forEach(function (item) {
      item.classList.remove("is-revealed");
    });

    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      {
        root: null,
        rootMargin: "0px 0px -6% 0px",
        threshold: 0.18,
      }
    );

    items.forEach(function (item) {
      observer.observe(item);
    });
  }

  function init() {
    bindObserver();
    MOBILE_MQ.addEventListener("change", bindObserver);
    REDUCED_MQ.addEventListener("change", bindObserver);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
