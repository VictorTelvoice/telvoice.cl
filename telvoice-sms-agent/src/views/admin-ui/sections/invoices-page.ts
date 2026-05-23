import type { AdminSessionUser } from "../../../types/admin.js";
import { escapeHtml } from "../../../utils/html.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { MOCK_INVOICES, MOCK_SMS_BAGS } from "../mock-data-stage3.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

function invoiceStatusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    pagada: ["ok", "Pagada"],
    pendiente: ["warn", "Pendiente"],
    vencida: ["err", "Vencida"],
    en_revision: ["warn", "En revisión"],
    anulada: ["muted", "Anulada"],
  };
  const [cls, label] = map[status] ?? ["muted", status];
  return `<span class="badge badge-${cls}">${label}</span>`;
}

export function renderInvoicesPage(options: {
  admin: AdminSessionUser;
  smsBalance?: string;
}): string {
  const balance = options.smsBalance ?? "17.300";

  const kpis = `<div class="tv-kpi-grid">
    ${renderKpiCard({ label: "Saldo SMS actual", value: balance, icon: "sms", variant: "primary" })}
    ${renderKpiCard({ label: "Total comprado", value: "60.000", hint: "SMS históricos", icon: "shopping_cart", variant: "default" })}
    ${renderKpiCard({ label: "Total consumido", value: "42.700", icon: "trending_down", variant: "default" })}
    ${renderKpiCard({ label: "Monto facturado", value: "$550.000", icon: "receipt", variant: "success" })}
    ${renderKpiCard({ label: "Facturas pendientes", value: "1", icon: "pending", variant: "warn" })}
    ${renderKpiCard({ label: "Última compra", value: "15 may", icon: "event", variant: "default" })}
  </div>`;

  const docRows = MOCK_INVOICES.map(
    (inv) => `<tr>
      <td>${escapeHtml(inv.date)}</td>
      <td><strong>${escapeHtml(inv.doc)}</strong></td>
      <td>${escapeHtml(inv.type)}</td>
      <td>${escapeHtml(inv.bag)}</td>
      <td>${escapeHtml(inv.net)}</td>
      <td>${escapeHtml(inv.iva)}</td>
      <td>${escapeHtml(inv.total)}</td>
      <td>${invoiceStatusBadge(inv.status)}</td>
      <td>${escapeHtml(inv.payment)}</td>
      <td><button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">PDF</button></td>
    </tr>`,
  ).join("");

  const bagCards = MOCK_SMS_BAGS.map(
    (b) => `<article class="tv-bag-card">
      <h3>${escapeHtml(b.name)}</h3>
      <dl class="tv-meta-list">
        <div><dt>Compra</dt><dd>${escapeHtml(b.bought)}</dd></div>
        <div><dt>Consumidos</dt><dd>${escapeHtml(String(b.used))}</dd></div>
        <div><dt>Disponibles</dt><dd><strong>${escapeHtml(String(b.available))}</strong></dd></div>
        <div><dt>Estado</dt><dd>${invoiceStatusBadge(b.status === "activa" ? "pagada" : "en_revision")}</dd></div>
      </dl>
    </article>`,
  ).join("");

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Facturas y órdenes",
      subtitle:
        "Control de facturación, comprobantes y documentos de todos los clientes Telvoice.",
      actions: `
        <a href="/admin/orders" class="tv-btn-campaign">Ver compras</a>
        ${renderBtn("Emitir factura", { variant: "secondary", disabled: true })}
        ${renderBtn("Exportar", { variant: "ghost", disabled: true, icon: "download" })}
        <a href="/admin/pricing" class="btn btn-ghost btn-sm">Bolsas y tarifas →</a>
      `,
    })}
    ${kpis}
    ${renderPanel(
      "Documentos",
      `<div class="table-wrap" style="padding:0">
        <table class="tv-table">
          <thead><tr>
            <th>Fecha</th><th>Documento</th><th>Tipo</th><th>Bolsa SMS</th><th>Neto</th><th>IVA</th>
            <th>Total</th><th>Estado</th><th>Pago</th><th></th>
          </tr></thead>
          <tbody>${docRows}</tbody>
        </table>
      </div>`,
    )}
    ${renderPanel("Historial de bolsas SMS", `<div class="tv-bags-grid">${bagCards}</div>`)}
    <section class="tv-panel tv-panel--cta">
      <div class="tv-panel__body tv-cta-card">
        <h2>¿Necesitas alto volumen?</h2>
        <p>Solicita condiciones especiales para tráfico A2P, campañas recurrentes o integración directa con tu operación.</p>
        <a href="https://www.telvoice.cl" target="_blank" rel="noopener" class="btn btn-primary">Solicitar propuesta empresarial</a>
      </div>
    </section>
    ${renderAdminUiScript()}`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Facturas",
    activeNav: "invoices",
    body,
    topbar: { smsBalance: balance },
  });
}
