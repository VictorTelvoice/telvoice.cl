import { readFileSync } from "node:fs";
import { escapeHtml } from "../../utils/html.js";
import { getPublicDir } from "../../utils/public-dir.js";
import {
  brandPageTitle,
  renderFaviconLink,
  renderSidebarBrand,
} from "../brand.js";
import { renderTelvoiceAgentStylesheetLink } from "../../components/agent/telvoice-agent-widget-ui.js";
import {
  getPanelAgentWidgetScript,
  renderPanelAgentWidget,
} from "../../components/app/client-agent-widget.js";
import {
  APP_NAV_PRIMARY,
  APP_NAV_REST,
  APP_NAV_SEND_SMS,
} from "./app-nav.js";

function appPanelStylesheetHref(): string {
  try {
    const ver = readFileSync(
      `${getPublicDir()}/app-panel.ver`,
      "utf8",
    ).trim();
    return ver ? `/app-panel.css?v=${encodeURIComponent(ver)}` : "/app-panel.css";
  } catch {
    return "/app-panel.css";
  }
}

/** CSS estático generado por npm run build:app-css (cacheable). */
const APP_PANEL_STYLESHEET = appPanelStylesheetHref();

export type AppLayoutTopbar = {
  companyName: string;
  smsAvailable: string;
  accountStatus: string;
  accountStatusOk?: boolean;
  userName: string;
};

export type AppLayoutOptions = {
  title: string;
  body: string;
  activeNav: string;
  topbar: AppLayoutTopbar;
};

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (name.trim()[0] ?? "U").toUpperCase();
}

function renderNavLink(item: { id: string; label: string; href: string; icon: string }, active: string, extraClass = ""): string {
  const isActive = active === item.id;
  return `<a href="${item.href}" class="tv-nav-link${extraClass}${isActive ? " tv-nav-link--active" : ""}"${isActive ? ' aria-current="page"' : ""}>
      <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(item.icon)}</span>
      ${escapeHtml(item.label)}
    </a>`;
}

function renderNavLinks(active: string): string {
  const send = renderNavLink(APP_NAV_SEND_SMS, active, " tv-nav-link--send");
  const primary = APP_NAV_PRIMARY.map((item) => renderNavLink(item, active)).join("");
  const rest = APP_NAV_REST.map((item) => renderNavLink(item, active)).join("");
  return `${send}
    <div class="tv-sidebar__nav-group">${primary}</div>
    <div class="tv-sidebar__nav-divider" role="presentation"></div>
    <div class="tv-sidebar__nav-group tv-sidebar__nav-group--secondary">${rest}</div>`;
}

function renderSidebar(active: string): string {
  return `<aside class="tv-sidebar" id="tv-sidebar" aria-label="Menú cliente">
    <div class="tv-sidebar__brand">
      ${renderSidebarBrand("/app/dashboard", { badge: "Panel cliente" })}
    </div>
    <nav class="tv-sidebar__nav">
      ${renderNavLinks(active)}
    </nav>
  </aside>`;
}

function renderTopbar(tb: AppLayoutTopbar): string {
  const statusClass = tb.accountStatusOk !== false ? "tv-pill--ok" : "tv-pill--warn";
  return `<header class="tv-topbar">
    <button type="button" class="tv-topbar__menu" id="tv-sidebar-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="tv-sidebar">
      <span class="material-symbols-outlined">menu</span>
    </button>
    <div class="tv-topbar__pills">
      <span class="tv-pill" title="Empresa">
        <span class="material-symbols-outlined" aria-hidden="true">business</span>
        <span class="tv-pill__text">${escapeHtml(tb.companyName)}</span>
      </span>
      <span class="tv-pill tv-pill--balance" title="SMS disponibles">
        <span class="material-symbols-outlined" aria-hidden="true">sms</span>
        <span class="tv-pill__text">${escapeHtml(tb.smsAvailable)} disponibles</span>
      </span>
      <span class="tv-pill ${statusClass}" title="Estado cuenta">
        <span class="tv-pill__text">${escapeHtml(tb.accountStatus)}</span>
      </span>
    </div>
    <div class="tv-topbar__actions">
      <a href="/app/buy-sms" class="tv-btn-buy-sms">
        <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">shopping_cart</span>
        Comprar SMS
      </a>
      <button type="button" class="tv-topbar__icon-btn" aria-label="Notificaciones" title="Notificaciones">
        <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
      </button>
      <div class="tv-user">
        <span class="tv-user__avatar" aria-hidden="true">${escapeHtml(userInitials(tb.userName))}</span>
        <span class="tv-user__meta">
          <span class="tv-user__name">${escapeHtml(tb.userName)}</span>
          <span class="tv-user__company">Cuenta cliente</span>
        </span>
        <form method="post" action="/app/logout" class="logout-form">
          <button type="submit" class="btn btn-ghost btn-sm" title="Cerrar sesión">Salir</button>
        </form>
      </div>
    </div>
  </header>`;
}

const SIDEBAR_SCRIPT = `<script>
(function () {
  var app = document.querySelector(".tv-app");
  var toggle = document.getElementById("tv-sidebar-toggle");
  var overlay = document.getElementById("tv-sidebar-overlay");
  if (!app || !toggle) return;
  function setOpen(open) {
    app.classList.toggle("tv-app--sidebar-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  toggle.addEventListener("click", function () {
    setOpen(!app.classList.contains("tv-app--sidebar-open"));
  });
  if (overlay) {
    overlay.addEventListener("click", function () { setOpen(false); });
  }
  window.addEventListener("resize", function () {
    if (window.innerWidth > 900) setOpen(false);
  });
})();
</script>`;

export function renderAppLayout(options: AppLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brandPageTitle(options.title))}</title>
  ${renderFaviconLink()}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@600;700&display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${APP_PANEL_STYLESHEET}" />
  ${renderTelvoiceAgentStylesheetLink()}
</head>
<body class="tv-admin tv-app-client">
  <div class="tv-app">
    <div class="tv-overlay" id="tv-sidebar-overlay" aria-hidden="true"></div>
    ${renderSidebar(options.activeNav)}
    <div class="tv-main">
      ${renderTopbar(options.topbar)}
      <main class="tv-content">${options.body}</main>
    </div>
  </div>
  ${renderPanelAgentWidget()}
  ${SIDEBAR_SCRIPT}
  <script>${getPanelAgentWidgetScript()}</script>
</body>
</html>`;
}

export function renderAppMinimalPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brandPageTitle(title))}</title>
  ${renderFaviconLink()}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Montserrat:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${APP_PANEL_STYLESHEET}" />
</head>
<body class="tv-admin tv-app-client">
  <main class="tv-auth-wrap">${body}</main>
</body>
</html>`;
}
