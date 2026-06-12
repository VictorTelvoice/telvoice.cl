export function renderDashboardTableColumnResizeScript(): string {
  return `<script>
(function () {
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
    for (var i = 0; i < widths.length; i += 1) {
      var w = widths[i];
      if (typeof w === "number" && w > 40) {
        colgroup.children[i].style.width = w + "px";
      }
    }
  }

  function readCurrentWidths(table) {
    var ths = table.querySelectorAll("thead th");
    var widths = [];
    for (var i = 0; i < ths.length; i += 1) {
      widths.push(Math.round(ths[i].getBoundingClientRect().width));
    }
    return widths;
  }

  function initTable(table) {
    var tableId = table.getAttribute("data-table-id");
    if (!tableId) return;

    var ths = table.querySelectorAll("thead th");
    if (!ths.length) return;

    ensureColgroup(table, ths.length);

    var saved = loadWidths(tableId);
    if (saved && saved.length === ths.length) {
      applyWidths(table, saved);
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
        th.appendChild(grip);

        var dragging = false;
        var startX = 0;
        var startWidth = 0;
        var nextStartWidth = 0;

        function onMove(ev) {
          if (!dragging) return;
          var delta = ev.clientX - startX;
          var min = 56;
          var newWidth = Math.max(min, startWidth + delta);
          var nextWidth = Math.max(min, nextStartWidth - delta);
          var colgroup = table.querySelector("colgroup");
          if (!colgroup) return;
          colgroup.children[index].style.width = newWidth + "px";
          if (colgroup.children[index + 1]) {
            colgroup.children[index + 1].style.width = nextWidth + "px";
          }
        }

        function onUp() {
          if (!dragging) return;
          dragging = false;
          grip.classList.remove("is-dragging");
          document.body.classList.remove("tv-col-resize-active");
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          saveWidths(tableId, readCurrentWidths(table));
        }

        grip.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          dragging = true;
          startX = ev.clientX;
          startWidth = ths[index].getBoundingClientRect().width;
          nextStartWidth =
            ths[index + 1] != null
              ? ths[index + 1].getBoundingClientRect().width
              : startWidth;
          grip.classList.add("is-dragging");
          document.body.classList.add("tv-col-resize-active");
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
      })(colIndex);
    }
  }

  document.querySelectorAll(".tv-table--col-resize").forEach(initTable);
})();
</script>`;
}
