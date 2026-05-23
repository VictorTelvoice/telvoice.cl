import type { AdminSessionUser } from "../../../types/admin.js";
import { escapeHtml } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  MOCK_SA_API_KEYS,
  MOCK_SA_BAGS,
  MOCK_SA_CAMPAIGNS,
  MOCK_SA_CLIENTS,
  MOCK_SA_DLR,
  MOCK_SA_MESSAGES,
  MOCK_SA_ORDERS,
  MOCK_SA_PROVIDERS,
  MOCK_SA_ROUTES,
  MOCK_SA_WALLETS,
} from "../mock-data-superadmin.js";
import { renderKpiCard } from "../components.js";
import { renderBtn, renderFilterBar, renderPageHeader } from "../page-kit.js";
import { renderSuperadminBanner, statusBadgeSa } from "../superadmin-kit.js";

type PageOpts = { admin: AdminSessionUser; smsBalance?: string };

function wrap(
  opts: PageOpts,
  activeNav: string,
  title: string,
  body: string,
): string {
  return wrapAdminPage({
    admin: opts.admin,
    title,
    activeNav,
    body,
    topbar: {
      smsBalance: opts.smsBalance ?? "18.420",
      routesLabel: "Red global OK",
      routesOk: true,
      companyName: "Telvoice · Superadmin",
    },
  });
}

export function renderSaClientsPage(opts: PageOpts): string {
  const rows = MOCK_SA_CLIENTS.map(
    (c) => `<tr>
      <td><strong>${escapeHtml(c.company)}</strong></td>
      <td>${escapeHtml(c.contact)}</td>
      <td>${escapeHtml(c.email)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.country)}</td>
      <td>${statusBadgeSa(c.status)}</td>
      <td>${escapeHtml(c.balance)}</td>
      <td>${escapeHtml(c.monthly)}</td>
      <td>
        <a href="/admin/clients/test" class="row-link">Ver</a>
        <a href="/admin/clients/test/credit" class="btn btn-ghost btn-sm">Saldo</a>
      </td>
    </tr>`,
  ).join("");

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Clientes empresariales",
      subtitle: "Administra cuentas, estados, saldos y operación comercial de cada cliente.",
      actions: `${renderBtn("Nuevo cliente", { variant: "primary", icon: "add", disabled: true })} <a href="/admin/leads" class="btn btn-secondary btn-sm">Leads comerciales</a>`,
    })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Empresa</th><th>Contacto</th><th>Email</th><th>Teléfono</th><th>País</th><th>Estado</th><th>Saldo SMS</th><th>Consumo mes</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <p class="field-hint tv-mock-tag">Detalle completo en Cliente prueba hasta conectar listado real desde Supabase.</p>`;
  return wrap(opts, "clients", "Clientes", body);
}

export function renderSaPricingPage(opts: PageOpts): string {
  const rows = MOCK_SA_BAGS.map(
    (b) => `<tr>
      <td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.country)}</td><td>${escapeHtml(String(b.sms))}</td>
      <td>${escapeHtml(b.price)}</td><td>${escapeHtml(b.unit)}</td><td>${escapeHtml(b.cost)}</td>
      <td>${escapeHtml(b.margin)}</td><td>${statusBadgeSa(b.status)}</td>
      <td><a href="/admin/products" class="row-link">Editar</a></td>
    </tr>`,
  ).join("");
  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Bolsas y tarifas",
      subtitle: "Define bolsas SMS, precios de venta, costos estimados y márgenes por país y volumen.",
      actions: `<a href="/admin/products/new" class="btn btn-primary">Crear bolsa</a> <a href="/admin/pricing-tiers" class="btn btn-secondary">Tramos precio</a> <a href="/admin/calculator" class="btn btn-ghost btn-sm">Calculadora</a>`,
    })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Bolsa</th><th>País</th><th>SMS</th><th>Precio venta</th><th>Unitario</th><th>Costo est.</th><th>Margen</th><th>Estado</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "pricing", "Bolsas y tarifas", body);
}

export function renderSaCampaignsPage(opts: PageOpts): string {
  const rows = MOCK_SA_CAMPAIGNS.map(
    (c) => `<tr>
      <td>${escapeHtml(c.client)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(String(c.sent))}</td>
      <td>${escapeHtml(String(c.delivered))}</td><td>${statusBadgeSa(c.status)}</td><td>${escapeHtml(c.date)}</td>
      <td><a href="/admin/reports" class="row-link">Reporte</a></td>
    </tr>`,
  ).join("");
  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({ title: "Campañas globales", subtitle: "Monitorea campañas de todos los clientes en la plataforma.", actions: renderBtn("Nueva campaña", { disabled: true, variant: "primary" }) })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Cliente</th><th>Campaña</th><th>Enviados</th><th>Entregados</th><th>Estado</th><th>Fecha</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "campaigns", "Campañas", body);
}

export function renderSaMessagesPage(opts: PageOpts): string {
  const filters = renderFilterBar(`<input class="tv-filter-input" placeholder="Cliente, campaña, número…" /><select class="tv-filter-input" disabled><option>Estado</option></select><select class="tv-filter-input" disabled><option>Proveedor</option></select>`);
  const rows = MOCK_SA_MESSAGES.map(
    (m) => `<tr>
      <td>${escapeHtml(m.client)}</td><td>${escapeHtml(m.campaign)}</td><td>${escapeHtml(m.phone)}</td>
      <td>${statusBadgeSa(m.status)}</td><td>${escapeHtml(m.provider)}</td><td>${escapeHtml(m.operator)}</td>
      <td>${escapeHtml(m.date)}</td><td>${escapeHtml(m.country)}</td>
    </tr>`,
  ).join("");
  const body = `
    ${renderSuperadminBanner("Monitor operacional global — no es la bandeja de un cliente.")}
    ${renderPageHeader({ title: "Mensajería global", subtitle: "Todos los mensajes enviados por todos los clientes.", actions: `<a href="/admin/inbox" class="btn btn-ghost btn-sm">Bandeja operador (legacy)</a>` })}
    ${filters}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Cliente</th><th>Campaña</th><th>Número</th><th>Estado</th><th>Proveedor</th><th>Operador</th><th>Fecha</th><th>País</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "messages", "Mensajería", body);
}

export function renderSaDlrPage(opts: PageOpts): string {
  const kpis = `<div class="tv-kpi-grid">
    ${renderKpiCard({ label: "Entregados", value: "4.658", variant: "success", icon: "check_circle" })}
    ${renderKpiCard({ label: "Pendientes", value: "142", variant: "warn", icon: "schedule" })}
    ${renderKpiCard({ label: "Fallidos", value: "223", variant: "danger", icon: "error" })}
    ${renderKpiCard({ label: "Tasa DLR", value: "94,4%", variant: "primary", icon: "percent" })}
  </div>`;
  const rows = MOCK_SA_DLR.map(
    (r) => `<tr>
      <td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.client)}</td><td>${escapeHtml(r.campaign)}</td>
      <td>${escapeHtml(r.phone)}</td><td>${escapeHtml(r.provider)}</td><td>${escapeHtml(r.operator)}</td>
      <td>${statusBadgeSa(r.status)}</td><td>${escapeHtml(r.code)}</td>
      <td>${escapeHtml(r.sent)}</td><td>${escapeHtml(r.delivered)}</td>
    </tr>`,
  ).join("");
  const body = `${renderSuperadminBanner()}${renderPageHeader({ title: "DLR / Estados", subtitle: "Monitoreo de entregas y códigos de error por cliente y ruta." })}${kpis}
    <div class="table-wrap tv-panel"><table class="tv-table tv-table--compact"><thead><tr>
      <th>Fecha</th><th>Cliente</th><th>Campaña</th><th>Número</th><th>Proveedor</th><th>Operador</th><th>Estado</th><th>Código</th><th>Envío</th><th>Entrega</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "dlr", "DLR", body);
}

export function renderSaProvidersPage(opts: PageOpts): string {
  const rows = MOCK_SA_PROVIDERS.map(
    (p) => `<tr>
      <td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.type)}</td><td>${escapeHtml(p.route)}</td>
      <td>${statusBadgeSa(p.status)}</td><td>${escapeHtml(p.cost)}</td><td>${escapeHtml(p.capacity)}</td>
      <td>${escapeHtml(p.delivery)}</td><td>${escapeHtml(p.latency)}</td><td>${escapeHtml(p.traffic)}</td>
      <td><a href="/admin/asmsc/diagnostics" class="row-link">Config</a></td>
    </tr>`,
  ).join("");
  const body = `${renderSuperadminBanner()}${renderPageHeader({ title: "Proveedores SMS", subtitle: "Conectividad, costos y salud de proveedores upstream." })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Proveedor</th><th>Conexión</th><th>Ruta</th><th>Estado</th><th>Costo SMS</th><th>Capacidad</th><th>Entrega</th><th>Latencia</th><th>Tráfico</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "providers", "Proveedores", body);
}

export function renderSaRoutesPage(opts: PageOpts): string {
  const rows = MOCK_SA_ROUTES.map(
    (r) => `<tr>
      <td>${escapeHtml(r.country)}</td><td>${escapeHtml(r.operator)}</td><td>${escapeHtml(r.provider)}</td>
      <td>${escapeHtml(r.type)}</td><td>${escapeHtml(String(r.priority))}</td><td>${escapeHtml(r.cost)}</td>
      <td>${escapeHtml(r.price)}</td><td>${escapeHtml(r.margin)}</td><td>${statusBadgeSa(r.status)}</td>
      <td>${r.dlr ? "Sí" : "No"}</td><td><button class="btn btn-ghost btn-sm" disabled>Editar</button></td>
    </tr>`,
  ).join("");
  const body = `${renderSuperadminBanner()}${renderPageHeader({ title: "Rutas SMS", subtitle: "Rutas por país, operador, proveedor, prioridad y margen." })}
    <div class="table-wrap tv-panel"><table class="tv-table tv-table--compact"><thead><tr>
      <th>País</th><th>Operador</th><th>Proveedor</th><th>Tipo</th><th>Prior.</th><th>Costo</th><th>Venta</th><th>Margen</th><th>Estado</th><th>DLR</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "routes", "Rutas SMS", body);
}

export function renderSaOrdersPage(opts: PageOpts): string {
  const rows = MOCK_SA_ORDERS.map(
    (o) => `<tr>
      <td>${escapeHtml(o.date)}</td><td>${escapeHtml(o.client)}</td><td>${escapeHtml(o.bag)}</td>
      <td>${escapeHtml(String(o.qty))}</td><td>${escapeHtml(o.amount)}</td><td>${escapeHtml(o.payment)}</td>
      <td>${statusBadgeSa(o.payStatus)}</td><td>${statusBadgeSa(o.creditStatus)}</td>
      <td><code>${escapeHtml(o.ref)}</code></td>
      <td><button class="btn btn-primary btn-sm" disabled>Acreditar</button></td>
    </tr>`,
  ).join("");
  const body = `${renderSuperadminBanner()}${renderPageHeader({ title: "Compras", subtitle: "Órdenes de bolsas SMS y acreditación de saldo.", actions: `<a href="/admin/invoices" class="btn btn-secondary">Facturas</a>` })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Fecha</th><th>Cliente</th><th>Bolsa</th><th>SMS</th><th>Monto</th><th>Pago</th><th>Estado pago</th><th>Acreditación</th><th>Ref.</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "orders", "Compras", body);
}

export function renderSaWalletsPage(opts: PageOpts): string {
  const rows = MOCK_SA_WALLETS.map(
    (w) => `<tr>
      <td>${escapeHtml(w.client)}</td><td>${escapeHtml(w.country)}</td><td>${escapeHtml(w.available)}</td>
      <td>${escapeHtml(w.reserved)}</td><td>${escapeHtml(w.consumed)}</td><td>${escapeHtml(w.purchased)}</td>
      <td>${escapeHtml(w.lastMove)}</td><td>${statusBadgeSa(w.status)}</td>
      <td><a href="/admin/clients/test/credit" class="btn btn-secondary btn-sm">Ajustar</a> <a href="/admin/clients/test/ledger" class="btn btn-ghost btn-sm">Movimientos</a></td>
    </tr>`,
  ).join("");
  const body = `${renderSuperadminBanner()}${renderPageHeader({ title: "Saldos SMS", subtitle: "Saldos por cliente, reservas y movimientos.", actions: `<a href="/admin/clients/test/credit" class="btn btn-primary">Carga manual</a>` })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Cliente</th><th>País</th><th>Disponible</th><th>Reservado</th><th>Consumido</th><th>Comprado</th><th>Último mov.</th><th>Estado</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "wallets", "Saldos", body);
}

export function renderSaApiKeysPage(opts: PageOpts): string {
  const rows = MOCK_SA_API_KEYS.map(
    (k) => `<tr>
      <td>${escapeHtml(k.client)}</td><td><code>${escapeHtml(k.key)}</code></td><td>${statusBadgeSa(k.status)}</td>
      <td>${escapeHtml(k.perms)}</td><td>${escapeHtml(k.lastUse)}</td><td>${escapeHtml(String(k.requests))}</td><td>${escapeHtml(String(k.errors))}</td>
      <td>${escapeHtml(k.ips)}</td><td><button class="btn btn-ghost btn-sm" disabled>Revocar</button></td>
    </tr>`,
  ).join("");
  const body = `${renderSuperadminBanner()}${renderPageHeader({ title: "API keys de clientes", subtitle: "Control de credenciales, permisos y uso por cliente.", actions: `<a href="/admin/asmsc/diagnostics" class="btn btn-secondary">Diagnóstico técnico</a>` })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Cliente</th><th>API Key</th><th>Estado</th><th>Permisos</th><th>Último uso</th><th>Req. hoy</th><th>Errores</th><th>IPs</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return wrap(opts, "api", "API", body);
}
