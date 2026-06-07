/** Preferencia de tema del panel cliente (/app): claro u oscuro (Lab). */

export const PANEL_THEME_STORAGE_KEY = "telvoice-panel-theme";

export type PanelTheme = "light" | "dark";

export function panelThemeBodyClass(theme: PanelTheme): string {
  return theme === "dark" ? "tv-lab-theme" : "tv-light-theme";
}

export function panelThemeColor(theme: PanelTheme): string {
  return theme === "dark" ? "#050814" : "#eef2f8";
}

/** Script síncrono al inicio del body: aplica tema guardado antes de pintar el shell. */
export function renderPanelThemeBootScript(): string {
  return `<script>
(function () {
  var KEY = ${JSON.stringify(PANEL_THEME_STORAGE_KEY)};
  var theme = "light";
  try {
    var stored = localStorage.getItem(KEY);
    if (stored === "dark" || stored === "light") theme = stored;
  } catch (e) {}
  var cls = theme === "dark" ? "tv-lab-theme" : "tv-light-theme";
  document.body.classList.add(cls);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#050814" : "#eef2f8");
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
  var btn = document.getElementById("tv-panel-theme-toggle");
  if (!btn) return;

  function currentTheme() {
    return document.body.classList.contains("tv-lab-theme") ? "dark" : "light";
  }

  function applyTheme(theme) {
    var isDark = theme === "dark";
    document.body.classList.toggle("tv-lab-theme", isDark);
    document.body.classList.toggle("tv-light-theme", !isDark);
    btn.setAttribute("data-theme", theme);
    btn.setAttribute("aria-label", isDark ? "Activar modo claro" : "Activar modo oscuro");
    btn.setAttribute("title", isDark ? "Modo claro" : "Modo oscuro");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#050814" : "#eef2f8");
    try { localStorage.setItem(KEY, theme); } catch (e) {}
  }

  applyTheme(currentTheme());

  btn.addEventListener("click", function () {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  });
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
