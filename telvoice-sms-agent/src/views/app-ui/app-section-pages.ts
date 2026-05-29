import { escapeHtml } from "../../utils/html.js";
import { renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

export {
  renderAppCampaignsPage,
  renderAppInboxPage,
} from "./app-sms-pages.js";
export { renderAppReportsPage } from "./app-reports-page.js";
export {
  parseContactsPageFilters,
  renderAppContactsPage,
} from "./app-contacts-page.js";

export { renderAppTemplatesPage } from "./app-templates-page.js";

export { renderAppApiPage } from "./app-api-page.js";

export { renderAppSupportPage } from "./app-support-page.js";

export function renderAppSettingsPage(ctx: AppPageContext): string {
  const body = `
    ${renderPageHeader({
      title: "Configuración",
      subtitle: "Datos de tu empresa y preferencias de cuenta.",
    })}
    <section class="tv-panel">
      <div class="tv-panel__body tv-form-grid">
        <div><dt style="font-weight:600">Empresa</dt><dd>${escapeHtml(ctx.company.name)}</dd></div>
        <div><dt style="font-weight:600">RUT</dt><dd>${escapeHtml(ctx.company.rut ?? "—")}</dd></div>
        <div><dt style="font-weight:600">Email facturación</dt><dd>${escapeHtml(ctx.company.billing_email ?? "—")}</dd></div>
        <div><dt style="font-weight:600">Contacto</dt><dd>${escapeHtml(ctx.company.contact_name ?? "—")}</dd></div>
        <div><dt style="font-weight:600">Tu rol</dt><dd>${escapeHtml(ctx.profile.role)}</dd></div>
        <div><dt style="font-weight:600">Estado cuenta</dt><dd>${escapeHtml(ctx.company.status)}</dd></div>
      </div>
    </section>`;
  return wrapAppPage(ctx, "settings", "Configuración", body);
}
