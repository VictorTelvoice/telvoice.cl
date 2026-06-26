/**
 * Carga telvoice-config + telvoice-analytics con ruta relativa (páginas en subcarpetas).
 * Uso: <script src="…/js/telvoice-analytics-bootstrap.js" data-root="../"></script>
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var root = (script && script.getAttribute("data-root")) || "";
  if (root && root.charAt(root.length - 1) !== "/") root += "/";

  function inject(src, onload) {
    var el = document.createElement("script");
    el.src = root + src;
    el.async = false;
    if (onload) el.onload = onload;
    (script && script.parentNode ? script.parentNode : document.head).appendChild(el);
  }

  inject("js/telvoice-config.js", function () {
    inject("js/telvoice-analytics.js");
  });
})();
