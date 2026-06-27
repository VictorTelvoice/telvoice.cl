/** Script de redimensionado de columnas en tablas del dashboard cliente. */
export function getDashboardTableColumnResizeScriptBody(): string {
  return `(function () {
  var STORAGE_PREFIX = "telvoice_dash_col_widths_";

  function loadWidths(tableId) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + tableId);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_err) {
      return null;
    }
  }

  function saveWidths(tableId, widths) {
    try {
      localStorage.setItem(STORAGE_PREFIX + tableId, JSON.stringify(widths));
    } catch (_err) {
      /* ignore quota errors */
    }
  }

  function ensureColgroup(table, colCount) {
    var colgroup = table.querySelector("colgroup");
    if (!colgroup) {
      colgroup = document.createElement("colgroup");
      table.insertBefore(colgroup, table.firstChild);
    }
    while (colgroup.children.length < colCount) {
      colgroup.appendChild(document.createElement("col"));
    }
    while (colgroup.children.length > colCount) {
      colgroup.removeChild(colgroup.lastChild);
    }
    return colgroup;
  }

  function applyWidths(table, widths) {
    var colgroup = ensureColgroup(table, widths.length);
    var total = 0;
    for (var i = 0; i < widths.length; i += 1) {
      var w = widths[i];
      if (typeof w === "number" && w > 48) {
        colgroup.children[i].style.width = w + "px";
        total += w;
      }
    }
    if (total > 0) {
      table.style.width = total + "px";
      table.style.minWidth = "100%";
    }
  }

  function readCurrentWidths(table) {
    var colgroup = table.querySelector("colgroup");
    var ths = table.querySelectorAll("thead th");
    var widths = [];
    for (var i = 0; i < ths.length; i += 1) {
      var colWidth = colgroup && colgroup.children[i]
        ? parseFloat(colgroup.children[i].style.width)
        : NaN;
      widths.push(
        Number.isFinite(colWidth) && colWidth > 0
          ? Math.round(colWidth)
          : Math.round(ths[i].getBoundingClientRect().width),
      );
    }
    return widths;
  }

  function defaultWidths(tableId, colCount) {
    if (tableId === "dash-sends" && colCount === 4) {
      return [110, 150, 260, 120];
    }
    if (tableId === "dash-orders" && colCount === 4) {
      return [110, 180, 90, 120];
    }
    if (tableId === "app-inbox" && colCount === 9) {
      return [110, 120, 100, 280, 56, 100, 90, 100, 140];
    }
    if (tableId === "app-campaigns" && colCount === 8) {
      return [110, 180, 100, 110, 72, 100, 90, 130];
    }
    if (tableId === "app-dlr-report" && colCount === 15) {
      return [120, 88, 92, 108, 240, 108, 52, 52, 76, 68, 76, 52, 108, 76, 144];
    }
    if (tableId === "app-wallet" && colCount === 6) {
      return [120, 120, 100, 100, 100, 220];
    }
    if (colCount === 4) {
      return [110, 180, 90, 120];
    }
    var each = Math.max(96, Math.floor(520 / colCount));
    var widths = [];
    for (var i = 0; i < colCount; i += 1) widths.push(each);
    return widths;
  }

  function startDrag(table, tableId, ths, index, clientX, grip) {
    var dragging = true;
    var startX = clientX;
    var startWidth = ths[index].getBoundingClientRect().width;
    var nextStartWidth =
      ths[index + 1] != null
        ? ths[index + 1].getBoundingClientRect().width
        : startWidth;
    var colgroup = table.querySelector("colgroup");
    if (!colgroup) return;

    grip.classList.add("is-dragging");
    table.classList.add("is-col-resizing");
    document.body.classList.add("tv-col-resize-active");

    function onMove(ev) {
      if (!dragging) return;
      var x = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : startX);
      var delta = x - startX;
      var min = 56;
      var newWidth = Math.max(min, startWidth + delta);
      var nextWidth = Math.max(min, nextStartWidth - delta);
      colgroup.children[index].style.width = newWidth + "px";
      if (colgroup.children[index + 1]) {
        colgroup.children[index + 1].style.width = nextWidth + "px";
      }
      var total = 0;
      for (var c = 0; c < colgroup.children.length; c += 1) {
        total += parseFloat(colgroup.children[c].style.width) || ths[c].getBoundingClientRect().width;
      }
      table.style.width = Math.max(total, table.parentElement ? table.parentElement.clientWidth : total) + "px";
      table.style.minWidth = "100%";
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      grip.classList.remove("is-dragging");
      table.classList.remove("is-col-resizing");
      document.body.classList.remove("tv-col-resize-active");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      saveWidths(tableId, readCurrentWidths(table));
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }

  function initTable(table) {
    if (table.getAttribute("data-col-resize-ready") === "1") return;
    var tableId = table.getAttribute("data-table-id");
    if (!tableId) return;

    var ths = table.querySelectorAll("thead th");
    if (ths.length < 2) return;

    ensureColgroup(table, ths.length);

    var saved = loadWidths(tableId);
    if (saved && saved.length === ths.length) {
      applyWidths(table, saved);
    } else {
      applyWidths(table, defaultWidths(tableId, ths.length));
    }

    for (var colIndex = 0; colIndex < ths.length - 1; colIndex += 1) {
      (function (index) {
        var th = ths[index];
        if (th.querySelector(".tv-col-resize-grip")) return;

        var grip = document.createElement("span");
        grip.className = "tv-col-resize-grip";
        grip.setAttribute("role", "separator");
        grip.setAttribute("aria-orientation", "vertical");
        grip.setAttribute("aria-label", "Redimensionar columna");
        grip.title = "Arrastra para cambiar el ancho";
        th.appendChild(grip);

        grip.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          startDrag(table, tableId, ths, index, ev.clientX, grip);
        });

        grip.addEventListener("touchstart", function (ev) {
          if (!ev.touches || !ev.touches[0]) return;
          ev.preventDefault();
          ev.stopPropagation();
          startDrag(table, tableId, ths, index, ev.touches[0].clientX, grip);
        }, { passive: false });

        grip.addEventListener("dblclick", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          try {
            localStorage.removeItem(STORAGE_PREFIX + tableId);
          } catch (_err) {
            /* ignore */
          }
          applyWidths(table, defaultWidths(tableId, ths.length));
        });
      })(colIndex);
    }

    table.setAttribute("data-col-resize-ready", "1");
  }

  function initAll() {
    document.querySelectorAll(".tv-table--col-resize").forEach(initTable);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();`;
}

export function renderDashboardTableColumnResizeScript(): string {
  return `<script>${getDashboardTableColumnResizeScriptBody()}</script>`;
}
