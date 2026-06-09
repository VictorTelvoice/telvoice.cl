/** Preferencia de tema del panel cliente (/app): claro u oscuro (Lab). */

export const PANEL_THEME_STORAGE_KEY = "telvoice-panel-theme";

/** Hora local (inclusive) en la que empieza el modo claro. */
export const PANEL_THEME_LIGHT_START_HOUR = 7;

/** Hora local (exclusive) en la que termina el modo claro. */
export const PANEL_THEME_LIGHT_END_HOUR = 20;

export type PanelTheme = "light" | "dark";

export function panelThemeFromHour(
  hour: number,
  lightStart = PANEL_THEME_LIGHT_START_HOUR,
  lightEnd = PANEL_THEME_LIGHT_END_HOUR,
): PanelTheme {
  return hour >= lightStart && hour < lightEnd ? "light" : "dark";
}

export function panelThemeBodyClass(theme: PanelTheme): string {
  return theme === "dark" ? "tv-lab-theme" : "tv-light-theme";
}

export function panelThemeColor(theme: PanelTheme): string {
  return theme === "dark" ? "#050814" : "#eef2f8";
}

/** Script síncrono al inicio del body: tema guardado o automático por hora local. */
export function renderPanelThemeBootScript(): string {
  return `<script>
(function () {
  var KEY = ${JSON.stringify(PANEL_THEME_STORAGE_KEY)};
  var LIGHT_START = ${PANEL_THEME_LIGHT_START_HOUR};
  var LIGHT_END = ${PANEL_THEME_LIGHT_END_HOUR};

  function hourTheme() {
    var h = new Date().getHours();
    return (h >= LIGHT_START && h < LIGHT_END) ? "light" : "dark";
  }

  function resolveTheme() {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch (e) {}
    return hourTheme();
  }

  function applyThemeClass(theme) {
    var isDark = theme === "dark";
    document.body.classList.toggle("tv-lab-theme", isDark);
    document.body.classList.toggle("tv-light-theme", !isDark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#050814" : "#eef2f8");
    return theme;
  }

  window.__tvResolvePanelTheme = resolveTheme;
  window.__tvApplyPanelThemeClass = applyThemeClass;
  applyThemeClass(resolveTheme());
})();
</script>`;
}

export function renderPanelThemeToggleButton(): string {
  return `<button type="button" class="tv-topbar__icon-btn tv-theme-toggle" id="tv-panel-theme-toggle" aria-label="Activar modo oscuro" title="Modo oscuro" data-theme="light">
      <span class="material-symbols-outlined tv-theme-toggle__icon tv-theme-toggle__icon--to-dark" aria-hidden="true">dark_mode</span>
      <span class="material-symbols-outlined tv-theme-toggle__icon tv-theme-toggle__icon--to-light" aria-hidden="true">light_mode</span>
    </button>`;
}

export function renderPanelThemeToggleScript(): string {
  return `<script>
(function () {
  var KEY = ${JSON.stringify(PANEL_THEME_STORAGE_KEY)};
  var LIGHT_START = ${PANEL_THEME_LIGHT_START_HOUR};
  var LIGHT_END = ${PANEL_THEME_LIGHT_END_HOUR};
  var btn = document.getElementById("tv-panel-theme-toggle");
  if (!btn) return;

  function hourTheme() {
    var h = new Date().getHours();
    return (h >= LIGHT_START && h < LIGHT_END) ? "light" : "dark";
  }

  function resolveTheme() {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch (e) {}
    return hourTheme();
  }

  function currentTheme() {
    return document.body.classList.contains("tv-lab-theme") ? "dark" : "light";
  }

  function applyTheme(theme, persist) {
    var isDark = theme === "dark";
    document.body.classList.toggle("tv-lab-theme", isDark);
    document.body.classList.toggle("tv-light-theme", !isDark);
    btn.setAttribute("data-theme", theme);
    btn.setAttribute("aria-label", isDark ? "Activar modo claro" : "Activar modo oscuro");
    btn.setAttribute("title", isDark ? "Modo claro" : "Modo oscuro");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#050814" : "#eef2f8");
    if (persist) {
      try { localStorage.setItem(KEY, theme); } catch (e) {}
    }
  }

  function syncToggleUi() {
    applyTheme(currentTheme(), false);
  }

  syncToggleUi();

  btn.addEventListener("click", function () {
    applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
  });

  window.setInterval(function () {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === "dark" || stored === "light") return;
    } catch (e) {}
    applyTheme(resolveTheme(), false);
  }, 60000);
})();
</script>`;
}

export function getPanelThemeToggleStyles(): string {
  return `
    .tv-light-theme .tv-lab-bg-wrap,
    .tv-lab-theme .tv-light-bg-wrap {
      display: none !important;
    }

    .tv-theme-toggle__icon {
      font-size: 1.35rem;
      line-height: 1;
    }
    .tv-theme-toggle__icon--to-light {
      display: none;
    }
    .tv-lab-theme .tv-theme-toggle__icon--to-dark {
      display: none;
    }
    .tv-lab-theme .tv-theme-toggle__icon--to-light {
      display: inline;
    }

    .tv-lab-theme.tv-app-client .tv-topbar__icon-btn,
    .tv-lab-theme.tv-app-client .tv-theme-toggle {
      color: var(--tv-lab-muted, #a8b4d0);
      border-color: var(--tv-lab-border, rgba(120, 160, 255, 0.16));
      background: rgba(12, 20, 48, 0.55);
    }
    .tv-lab-theme.tv-app-client .tv-topbar__icon-btn:hover,
    .tv-lab-theme.tv-app-client .tv-theme-toggle:hover {
      background: rgba(56, 189, 248, 0.1);
      color: var(--tv-lab-text, #eef2ff);
    }

    .tv-light-theme .tv-panel-alert {
      border-radius: 0.85rem;
      padding: 0.85rem 1.1rem;
      font-size: 0.88rem;
      border: 1px solid rgba(0, 82, 204, 0.2);
      background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
      color: #1e40af;
    }
    .tv-lab-theme .tv-panel-alert {
      border-radius: 0.85rem;
      padding: 0.85rem 1.1rem;
      font-size: 0.88rem;
      border: 1px solid var(--tv-lab-border-bright, rgba(56, 189, 248, 0.32));
      background: rgba(56, 189, 248, 0.08);
      color: var(--tv-lab-cyan, #38bdf8);
    }
  `;
}
