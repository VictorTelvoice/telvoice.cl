import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

function comingSoon(
  ctx: AppPageContext,
  activeNav: string,
  title: string,
  subtitle: string,
  icon: string,
  bullets: string[],
): string {
  const lis = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  const body = `
    ${renderPageHeader({ title, subtitle })}
    <div class="tv-coming-soon">
      <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(icon)}</span>
      <h2 style="margin-top:1rem">Próximamente</h2>
      <p class="tv-page-sub">Esta sección mostrará solo los datos de <strong>${escapeHtml(ctx.company.name)}</strong>.</p>
      <ul style="text-align:left;max-width:360px;margin:1rem auto;color:var(--tv-muted)">${lis}</ul>
    </div>`;
  return wrapAppPage(ctx, activeNav, title, body);
}

export function renderAppCampaignsPage(ctx: AppPageContext): string {
  return comingSoon(ctx, "campaigns", "Campañas", "Tus campañas de SMS masivo.", "campaign", [
    "Crear y programar campañas",
    "Estados de envío por campaña",
    "Sin acceso a rutas ni proveedores internos",
  ]);
}

export function renderAppInboxPage(ctx: AppPageContext): string {
  return comingSoon(ctx, "inbox", "Bandeja", "Mensajes y respuestas de tu empresa.", "inbox", [
    "Conversaciones entrantes",
    "Historial por destinatario",
    "Vinculado a campañas propias",
  ]);
}

export function renderAppContactsPage(ctx: AppPageContext): string {
  return comingSoon(ctx, "contacts", "Contactos", "Tus listas y contactos.", "contacts", [
    "Importar contactos",
    "Segmentación por etiquetas",
    "Solo contactos de tu empresa",
  ]);
}

export function renderAppTemplatesPage(ctx: AppPageContext): string {
  return comingSoon(ctx, "templates", "Plantillas", "Plantillas de mensaje aprobadas.", "description", [
    "Plantillas con variables",
    "Vista previa móvil",
    "Reutilizar en campañas",
  ]);
}

export function renderAppReportsPage(ctx: AppPageContext): string {
  return comingSoon(ctx, "reports", "Reportes", "Métricas de entrega y consumo.", "bar_chart", [
    "Tasa de entrega",
    "SMS consumidos por período",
    "Sin datos globales de Telvoice",
  ]);
}

export function renderAppInvoicesPage(ctx: AppPageContext): string {
  return comingSoon(ctx, "invoices", "Facturas", "Documentos tributarios de tu cuenta.", "receipt_long", [
    "Facturas por compra de bolsas",
    "Descarga PDF",
    "Historial de pagos",
  ]);
}

export function renderAppApiPage(ctx: AppPageContext): string {
  return comingSoon(ctx, "api", "API", "Integra Telvoice con tus sistemas.", "api", [
    "API key por empresa",
    "Webhooks de entrega",
    "Documentación de endpoints",
  ]);
}

export function renderAppSupportPage(ctx: AppPageContext): string {
  const body = `
    ${renderPageHeader({
      title: "Soporte",
      subtitle: "Contacta al equipo Telvoice para ayuda con tu cuenta.",
    })}
    <section class="tv-panel">
      <div class="tv-panel__body">
        <p><strong>Email:</strong> <a href="mailto:soporte@telvoice.cl">soporte@telvoice.cl</a></p>
        <p><strong>Horario:</strong> Lunes a viernes, 9:00 – 18:00 (Chile)</p>
        <p class="field-hint">Para órdenes pendientes de pago, indica el ID de orden desde <a href="/app/orders">Mis órdenes</a>.</p>
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
