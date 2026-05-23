import { escapeHtml } from "../../utils/html.js";
import { renderLayout } from "./shell.js";

export function renderAdminForbiddenPage(options?: {
  message?: string;
  adminName?: string;
}): string {
  const message =
    options?.message ??
    "Tu cuenta no tiene permisos para ingresar al panel interno de Telvoice.";

  const body = `
    <div class="tv-forbidden">
      <div class="tv-forbidden__card">
        <span class="material-symbols-outlined tv-forbidden__icon" aria-hidden="true">gpp_bad</span>
        <h1 class="tv-forbidden__title">Acceso no autorizado</h1>
        <p class="tv-forbidden__text">${escapeHtml(message)}</p>
        <div class="tv-forbidden__actions">
          <a href="/admin/login" class="btn btn-primary">Volver al inicio de sesión</a>
          <a href="/app" class="btn btn-secondary">Panel cliente (próximamente)</a>
        </div>
      </div>
    </div>`;

  return renderLayout({
    title: "Acceso no autorizado",
    body,
    showNav: false,
    adminName: options?.adminName,
  });
}
