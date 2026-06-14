(function (global) {
  function bindSwipe(el, options) {
    if (!el) {
      return;
    }

    var threshold = (options && options.threshold) || 42;
    var maxVertical = (options && options.maxVertical) || 72;
    var onLeft = options && options.onSwipeLeft;
    var onRight = options && options.onSwipeRight;
    var startX = 0;
    var startY = 0;
    var active = false;

    el.addEventListener(
      "touchstart",
      function (e) {
        if (!e.touches || e.touches.length !== 1) {
          return;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        active = true;
      },
      { passive: true }
    );

    el.addEventListener(
      "touchcancel",
      function () {
        active = false;
      },
      { passive: true }
    );

    el.addEventListener(
      "touchend",
      function (e) {
        if (!active) {
          return;
        }
        active = false;
        var touch = e.changedTouches && e.changedTouches[0];
        if (!touch) {
          return;
        }
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;
        if (Math.abs(dx) < threshold) {
          return;
        }
        if (Math.abs(dy) > maxVertical && Math.abs(dy) > Math.abs(dx)) {
          return;
        }
        if (dx < 0 && onLeft) {
          onLeft();
        } else if (dx > 0 && onRight) {
          onRight();
        }
      },
      { passive: true }
    );
  }

  global.TelvoiceBindSwipe = bindSwipe;
})(window);
