import { escapeHtml } from "../../utils/html.js";
import type { UserProfileContext } from "../../types/tenant.js";
import { roleDisplayLabel } from "../../types/roles.js";
import { renderLayout } from "../admin-ui/shell.js";

export function renderAppPlaceholderPage(profile: UserProfileContext): string {
  const companyLine = profile.companyId
    ? `Empresa asociada: <code>${escapeHtml(profile.companyId)}</code>`
    : "Sin empresa asociada aún.";

  const body = `
    <div class="tv-app-placeholder">
      <div class="tv-app-placeholder__card">
        <span class="material-symbols-outlined tv-app-placeholder__icon" aria-hidden="true">construction</span>
        <h1 class="tv-page-title">Panel cliente telvoice</h1>
        <p class="tv-page-sub">Hola, ${escapeHtml(profile.fullName)} · ${escapeHtml(roleDisplayLabel(profile.role))}</p>
        <p class="tv-app-placeholder__note">
          El portal <strong>/app</strong> se habilitará en la siguiente etapa.
          Aquí podrás comprar bolsas SMS, ver saldo, enviar campañas y administrar tu empresa.
        </p>
        <p class="tv-app-placeholder__meta">${companyLine}</p>
        <ul class="tv-app-placeholder__routes">
          <li><code>/app/dashboard</code> — Resumen</li>
          <li><code>/app/buy-sms</code> — Comprar bolsas</li>
          <li><code>/app/send-sms</code> — Enviar SMS</li>
          <li><code>/app/campaigns</code> — Campañas</li>
          <li><code>/app/reports</code> — Reportes</li>
          <li><code>/app/api</code> — Tu API</li>
        </ul>
        <form method="post" action="/app/logout" class="logout-form" style="display:inline">
          <button type="submit" class="btn btn-ghost btn-sm">Cerrar sesión</button>
        </form>
      </div>
    </div>`;

  return renderLayout({
    title: "Panel cliente",
    body,
    showNav: false,
    adminName: profile.fullName,
    topbar: {
      companyName: "telvoice · cliente",
    },
  });
}

export function renderAppLoginRequiredPage(): string {
  const body = `
    <div class="tv-app-placeholder">
      <div class="tv-app-placeholder__card">
        <h1 class="tv-page-title">Panel cliente</h1>
        <p class="tv-page-sub">Inicia sesión para continuar.</p>
        <a href="/login?next=%2Fapp" class="btn btn-primary">Iniciar sesión</a>
      </div>
    </div>`;

  return renderLayout({
    title: "Panel cliente",
    body,
    showNav: false,
  });
}
