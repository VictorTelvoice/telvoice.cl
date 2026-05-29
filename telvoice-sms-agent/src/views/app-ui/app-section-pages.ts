import type { SmsOrderWithDetails } from "../../types/wallet.js";
import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";
import { renderOrderShortIdCell } from "./app-order-ui.js";

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

export function renderAppSupportPage(
  ctx: AppPageContext,
  relatedOrder?: SmsOrderWithDetails | null,
): string {
  const orderCard = relatedOrder
    ? `<section class="tv-panel tv-panel--hint" style="margin-bottom:1rem">
      <div class="tv-panel__body">
        <p style="margin:0"><strong>Consulta relacionada a la orden:</strong>
          <code>${escapeHtml(relatedOrder.payment_reference ?? "—")}</code>
          · ${renderOrderShortIdCell(relatedOrder.id)}
          · <a href="/app/orders/${escapeHtml(relatedOrder.id)}">Ver detalle</a>
        </p>
      </div>
    </section>`
    : "";

  const body = `
    ${renderPageHeader({
      title: "Soporte",
      subtitle: "Contacta al equipo Telvoice para ayuda con tu cuenta.",
    })}
    ${orderCard}
    <section class="tv-panel">
      <div class="tv-panel__body">
        <p><strong>Email:</strong> <a href="mailto:soporte@telvoice.cl">soporte@telvoice.cl</a></p>
        <p><strong>Horario:</strong> Lunes a viernes, 9:00 – 18:00 (Chile)</p>
        <p class="field-hint">Para órdenes pendientes de pago, indica la referencia desde <a href="/app/orders">Mis órdenes</a>.</p>
        <div class="tv-quick-actions">
          ${renderBtn("Ver mis órdenes", { href: "/app/orders", variant: "secondary" })}
          ${renderBtn("Comprar SMS", { href: "/app/buy-sms", variant: "primary" })}
        </div>
      </div>
    </section>`;
  return wrapAppPage(ctx, "support", "Soporte", body);
}

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
