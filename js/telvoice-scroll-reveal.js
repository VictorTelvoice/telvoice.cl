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

    revealAll(items);
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
