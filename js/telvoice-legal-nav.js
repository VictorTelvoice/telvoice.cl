(function () {
  function qs(id) {
    return document.getElementById(id);
  }

  function closeMobileMenu() {
    var panel = qs("mobile-panel");
    var toggle = qs("menu-toggle");
    var openI = qs("menu-icon-open");
    var closeI = qs("menu-icon-close");
    if (!panel || !toggle) return;
    panel.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
    if (openI) openI.classList.remove("hidden");
    if (closeI) closeI.classList.add("hidden");
  }

  function openMobileMenu() {
    var panel = qs("mobile-panel");
    var toggle = qs("menu-toggle");
    var openI = qs("menu-icon-open");
    var closeI = qs("menu-icon-close");
    if (!panel || !toggle) return;
    panel.classList.remove("hidden");
    toggle.setAttribute("aria-expanded", "true");
    if (openI) openI.classList.add("hidden");
    if (closeI) closeI.classList.remove("hidden");
  }

  var toggle = qs("menu-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var panel = qs("mobile-panel");
      if (!panel) return;
      if (panel.classList.contains("hidden")) {
        openMobileMenu();
      } else {
        closeMobileMenu();
      }
    });
  }

  document.querySelectorAll("#mobile-panel a").forEach(function (link) {
    link.addEventListener("click", closeMobileMenu);
  });
})();
