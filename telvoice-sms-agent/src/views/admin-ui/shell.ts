import {
  getAdminAgentWidgetScript,
  renderAdminAgentWidget,
} from "../../components/admin/admin-agent-widget.js";
import { renderTelvoiceAgentStylesheetLink } from "../../components/agent/telvoice-agent-widget-ui.js";
import { escapeHtml } from "../../utils/html.js";
import {
  brandPageTitle,
  renderFaviconLink,
  renderSidebarBrand,
  TV_BRAND,
} from "../brand.js";
import { LEGACY_NAV, MAIN_NAV } from "./nav.js";
import { getAdminStyles } from "./styles.js";
import { renderPanelStylesheetLink } from "../shared/panel-stylesheet.js";
import {
  getPanelFloatingAgentToggleScript,
  renderPanelFloatingAgentToggleBootScript,
  renderPanelFloatingAgentToggleButton,
} from "../../components/agent/panel-floating-agent-toggle.js";

export interface LayoutTopbarOptions {
  smsBalance?: string;
  routesLabel?: string;
  routesOk?: boolean;
  companyName?: string;
  roleLabel?: string;
}

export interface LayoutOptions {
  title: string;
  body: string;
  adminName?: string;
  showNav?: boolean;
  activeNav?: string;
  topbar?: LayoutTopbarOptions;
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (name.trim()[0] ?? "A").toUpperCase();
}

/** Resalta ítem del menú cuando la página legacy usa otro id de activeNav. */
const ACTIVE_NAV_ALIASES: Record<string, string> = {
  diagnostics: "api",
  telegram: "bot",
  knowledge: "templates",
  "knowledge-test": "templates",
  products: "pricing",
  leads: "clients",
  client: "client-test",
  "client-test": "clients",
  credit: "wallets",
  ledger: "wallets",
  "web-leads": "chat",
  "web-sessions": "chat",
  "web-quotes": "chat",
  send: "messages",
  inbox: "messages",
  contacts: "clients",
  "wholesale-providers": "wholesale",
  "wholesale-routes": "wholesale",
  "wholesale-rates": "wholesale",
  "wholesale-route-tests": "wholesale",
  "wholesale-customers": "wholesale",
  "wholesale-opportunities": "wholesale",
};

function resolveActiveNav(active: string): string {
  return ACTIVE_NAV_ALIASES[active] ?? active;
}

function renderNavLinks(
  items: typeof MAIN_NAV,
  active: string,
): string {
  const resolved = resolveActiveNav(active);
  return items
    .map((item) => {
      const isActive = resolved === item.id;
      return `<a href="${item.href}" class="tv-nav-link${isActive ? " tv-nav-link--active" : ""}"${isActive ? ' aria-current="page"' : ""}>
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(item.icon)}</span>
        ${escapeHtml(item.label)}
      </a>`;
    })
    .join("");
}

function renderSidebar(active: string): string {
  return `<aside class="tv-sidebar" id="tv-sidebar" aria-label="Menú principal">
    <div class="tv-sidebar__brand">
      ${renderSidebarBrand("/admin", { subtitle: "superadmin" })}
    </div>
    <nav class="tv-sidebar__nav">
      ${renderNavLinks(MAIN_NAV, active)}
      <div class="tv-sidebar__section">Herramientas y legacy</div>
      ${renderNavLinks(LEGACY_NAV, active)}
    </nav>
  </aside>`;
}

function renderTopbar(options: LayoutOptions): string {
  const tb = options.topbar ?? {};
  const balance = tb.smsBalance ?? "—";
  const routesLabel = tb.routesLabel ?? "Rutas";
  const routesOk = tb.routesOk ?? true;
  const company = tb.companyName ?? `${TV_BRAND.name} · superadmin`;
  const roleLabel = tb.roleLabel ?? "";
  const adminName = options.adminName ?? "Admin";
  const routesClass = routesOk ? "tv-pill--ok" : "tv-pill--warn";
  const roleBadge = roleLabel
    ? `<span class="tv-pill tv-pill--role" title="Rol en ${escapeHtml(TV_BRAND.name)}">${escapeHtml(roleLabel)}</span>`
    : "";

  return `<header class="tv-topbar">
    <button type="button" class="tv-topbar__menu" id="tv-sidebar-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="tv-sidebar">
      <span class="material-symbols-outlined">menu</span>
    </button>
    <div class="tv-topbar__search">
      <span class="material-symbols-outlined tv-topbar__search-icon" aria-hidden="true">search</span>
      <input type="search" name="q" placeholder="Buscar clientes, campañas, órdenes, API keys…" aria-label="Búsqueda global Superadmin" autocomplete="off" />
    </div>
    <div class="tv-topbar__pills">
      ${roleBadge}
      <span class="tv-pill" title="Saldo vendido agregado (referencial)">
        <span class="material-symbols-outlined" aria-hidden="true">sms</span>
        <span class="tv-pill__text">${escapeHtml(balance)} vendidos</span>
      </span>
      <span class="tv-pill ${routesClass}" title="Estado red global">
        <span class="material-symbols-outlined" aria-hidden="true">cell_tower</span>
        <span class="tv-pill__text">${escapeHtml(routesLabel)}</span>
      </span>
    </div>
    <div class="tv-topbar__actions">
      ${renderPanelFloatingAgentToggleButton("nav-floating-agent-toggle")}
      <a href="/admin/clients" class="tv-btn-campaign">
        <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">business</span>
        Nuevo cliente
      </a>
      <button type="button" class="tv-topbar__icon-btn" aria-label="Notificaciones" title="Notificaciones">
        <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
        <span class="tv-topbar__notif-dot" aria-hidden="true"></span>
      </button>
      <div class="tv-user">
        <span class="tv-user__avatar" aria-hidden="true">${escapeHtml(userInitials(adminName))}</span>
        <span class="tv-user__meta">
          <span class="tv-user__name">${escapeHtml(adminName)}</span>
          <span class="tv-user__company">${escapeHtml(company)}</span>
        </span>
        <form method="post" action="/admin/logout" class="logout-form">
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

export function renderLayout(options: LayoutOptions): string {
  const active = options.activeNav ?? "";
  const showNav = options.showNav !== false;

  if (!showNav) {
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
  <style>${getAdminStyles()}</style>
</head>
<body class="tv-admin tv-admin--auth">
  <main class="tv-auth-wrap">
    ${options.body}
  </main>
</body>
</html>`;
  }

  const routesOk = options.topbar?.routesOk ?? true;
  const routesLabel =
    options.topbar?.routesLabel ?? (routesOk ? "Rutas OK" : "Revisar rutas");

  const layoutWithTopbar: LayoutOptions = {
    ...options,
    topbar: {
      ...options.topbar,
      routesLabel,
    },
  };

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
  ${renderPanelStylesheetLink()}
  ${renderTelvoiceAgentStylesheetLink()}
  ${renderPanelFloatingAgentToggleBootScript("admin")}
</head>
<body class="tv-admin">
  <div class="tv-app">
    <div class="tv-overlay" id="tv-sidebar-overlay" aria-hidden="true"></div>
    ${renderSidebar(active)}
    <div class="tv-main">
      ${renderTopbar(layoutWithTopbar)}
      <main class="tv-content">${options.body}</main>
    </div>
  </div>
  ${renderAdminAgentWidget()}
  ${SIDEBAR_SCRIPT}
  <script>${getPanelFloatingAgentToggleScript({ buttonIds: ["nav-floating-agent-toggle"], floatingRootId: "tv-admin-agent", surface: "admin" })}</script>
  ${getAdminAgentWidgetScript()}
</body>
</html>`;
}
