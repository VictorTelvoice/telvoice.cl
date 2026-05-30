import type { AdminSessionUser } from "../../../types/admin.js";
import type {
  WholesaleInternationalRatePlanEnriched,
  WholesaleSmppConnectionEnriched,
} from "../../../types/smpp-lab.js";
import {
  WHOLESALE_CUSTOMER_CONNECTION_TYPES,
  WHOLESALE_PROVIDER_CONNECTION_TYPES,
  WHOLESALE_QUALITY_ESTIMATES,
  WHOLESALE_STATUSES,
  WHOLESALE_TRAFFIC_TYPES,
  type WholesaleCustomerRow,
  type WholesaleDashboardSnapshot,
  type WholesaleOpportunityWithCustomer,
  type WholesaleProviderRow,
  type WholesaleRateOfferWithProvider,
  type WholesaleRouteTestEnriched,
  type WholesaleRouteWithProvider,
  type WholesaleStatus,
} from "../../../types/wholesale.js";
import {
  computeRouteMargin,
  formatRouteMarginPct,
} from "../../../services/wholesaleService.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { renderKpiCard, renderQuickAction, renderSectionTitle } from "../components.js";
import { renderBtn, renderPageHeader } from "../page-kit.js";

type BaseOpts = {
  admin: AdminSessionUser;
  success?: string;
  error?: string;
};

export type WholesaleSection =
  | "hub"
  | "providers"
  | "routes"
  | "rates"
  | "route-tests"
  | "customers"
  | "opportunities"
  | "smpp-lab"
  | "international-rates";

const WHOLESALE_SECTIONS: { id: WholesaleSection; href: string; label: string }[] = [
  { id: "hub", href: "/admin/wholesale", label: "Inicio" },
  { id: "smpp-lab", href: "/admin/wholesale/smpp-lab", label: "SMPP Lab" },
  { id: "international-rates", href: "/admin/wholesale/international-rates", label: "Rate plans intl." },
  { id: "providers", href: "/admin/wholesale/providers", label: "Proveedores" },
  { id: "routes", href: "/admin/wholesale/routes", label: "Rutas intl." },
  { id: "rates", href: "/admin/wholesale/rates", label: "Ofertas rates" },
  { id: "route-tests", href: "/admin/wholesale/route-tests", label: "Pruebas ruta" },
  { id: "customers", href: "/admin/wholesale/customers", label: "Clientes SMPP/API" },
  { id: "opportunities", href: "/admin/wholesale/opportunities", label: "Oportunidades" },
];

const STATUS_LABELS: Record<WholesaleStatus, string> = {
  draft: "Borrador",
  testing: "En prueba",
  approved: "Aprobado",
  live: "Live",
  paused: "Pausado",
  rejected: "Rechazado",
};

const STATUS_BADGE_CLASS: Record<WholesaleStatus, string> = {
  draft: "muted",
  testing: "warn",
  approved: "ok",
  live: "ok",
  paused: "warn",
  rejected: "err",
};

export function wholesaleStatusBadge(status: string): string {
  const key = status.toLowerCase() as WholesaleStatus;
  const cls = STATUS_BADGE_CLASS[key] ?? "muted";
  const label = STATUS_LABELS[key] ?? status;
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

function trafficTypeLabel(t: string): string {
  const m: Record<string, string> = {
    promotional: "Promocional",
    transactional: "Transaccional",
    otp: "OTP",
    mixed: "Mixto",
  };
  return m[t] ?? t;
}

function qualityLabel(q: string): string {
  const m: Record<string, string> = {
    excellent: "Excelente",
    good: "Buena",
    fair: "Regular",
    poor: "Baja",
    unknown: "Sin dato",
  };
  return m[q] ?? q;
}

function connectionLabel(t: string): string {
  const m: Record<string, string> = {
    http_api: "HTTP API",
    smpp: "SMPP",
    other: "Otro",
    api: "API",
    manual: "Manual",
  };
  return m[t] ?? t;
}

function renderWholesaleScopeBanner(): string {
  return `<div class="tv-wholesale-scope" role="note">
    <span class="material-symbols-outlined" aria-hidden="true">public</span>
    <div>
      <strong>Telvoice.net · Wholesale Core</strong>
      <span>Consola operativa wholesale — distinta de
        <a href="/admin/providers">Proveedores SMS</a> (routing Chile retail) y
        <a href="/admin/routes">Rutas SMS</a> (telco actual).</span>
    </div>
  </div>`;
}

function renderWholesaleSubNav(active: WholesaleSection): string {
  const links = WHOLESALE_SECTIONS.map(
    (s) =>
      `<a href="${escapeHtml(s.href)}" class="tv-wholesale-subnav__link${active === s.id ? " tv-wholesale-subnav__link--active" : ""}"${active === s.id ? ' aria-current="page"' : ""}>${escapeHtml(s.label)}</a>`,
  ).join("");
  return `<nav class="tv-wholesale-subnav" role="navigation" aria-label="Wholesale">${links}</nav>`;
}

function wrapWholesale(
  opts: BaseOpts,
  active: WholesaleSection,
  title: string,
  body: string,
): string {
  const alerts = [
    opts.success ? `<div class="alert alert-success">${escapeHtml(opts.success)}</div>` : "",
    opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : "",
  ].join("");
  return wrapAdminPage({
    admin: opts.admin,
    title,
    activeNav: active === "smpp-lab" ? "wholesale-smpp-lab" : active === "international-rates" ? "wholesale-international-rates" : "wholesale",
    body: alerts + renderWholesaleScopeBanner() + renderWholesaleSubNav(active) + body,
    topbar: {
      smsBalance: "—",
      routesLabel: "Wholesale",
      routesOk: true,
      companyName: "telvoice · wholesale",
    },
  });
}

/** Wrapper exportado para páginas wholesale adicionales (SMPP Lab, etc.). */
export function wrapWholesalePage(
  opts: BaseOpts,
  active: WholesaleSection,
  title: string,
  body: string,
): string {
  return wrapWholesale(opts, active, title, body);
}

function fmtVolume(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("es-CL");
}

function fmtRate(value: number | null | undefined, currency = "USD"): string {
  if (value == null) return "—";
  return `${Number(value).toFixed(4)} ${currency}`;
}

function renderMarginCell(cost: number, salePrice: number): string {
  const margin = computeRouteMargin(cost, salePrice);
  const pct = formatRouteMarginPct(cost, salePrice);
  return `<span class="tv-wholesale-margin">${margin.toFixed(4)}</span><span class="tv-wholesale-margin__pct">${escapeHtml(pct)}</span>`;
}

function renderRatePreview(raw: string, maxLines = 4): string {
  const lines = raw.split(/\r?\n/).slice(0, maxLines).join("\n").trim();
  const suffix = raw.split(/\r?\n/).length > maxLines ? "\n…" : "";
  return `<div class="tv-wholesale-rate-preview">${escapeHtml(lines + suffix)}</div>`;
}

function deliveryBadge(status: string | null | undefined): string {
  const key = (status ?? "").toLowerCase();
  if (["delivered", "ok", "success"].includes(key)) {
    return `<span class="tv-wholesale-dlr--ok">${escapeHtml(status ?? "—")}</span>`;
  }
  if (["failed", "error", "rejected"].includes(key)) {
    return `<span class="tv-wholesale-dlr--err">${escapeHtml(status ?? "—")}</span>`;
  }
  if (key) return `<span class="tv-wholesale-dlr--warn">${escapeHtml(status!)}</span>`;
  return "—";
}

function renderSummaryPanel(opts: {
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
  tableHtml: string;
}): string {
  return `<section class="tv-panel tv-wholesale-summary-panel">
    <div class="tv-panel__head">
      <div>
        <h2>${escapeHtml(opts.title)}</h2>
        <p class="tv-panel__sub">${escapeHtml(opts.subtitle)}</p>
      </div>
      <a href="${escapeHtml(opts.href)}" class="btn btn-ghost btn-sm">${escapeHtml(opts.linkLabel)}</a>
    </div>
    <div class="table-wrap">${opts.tableHtml}</div>
  </section>`;
}

function renderEmptyRow(colspan: number, message: string): string {
  return `<tr><td colspan="${colspan}"><div class="tv-wholesale-empty">${escapeHtml(message)}</div></td></tr>`;
}

function renderDeleteForm(action: string, label: string): string {
  return `<form method="post" action="${escapeHtml(action)}" style="display:inline" onsubmit="return confirm('¿Eliminar ${escapeHtml(label)}?')">
    <button type="submit" class="btn btn-ghost btn-sm">Eliminar</button>
  </form>`;
}

function val(values: Record<string, unknown> | undefined, key: string, fallback = ""): string {
  if (values && values[key] !== undefined && values[key] !== null) {
    return String(values[key]);
  }
  return fallback;
}

function renderStatusSelect(name: string, selected: string): string {
  return `<select name="${escapeHtml(name)}" class="tv-input-full">
    ${WHOLESALE_STATUSES.map(
      (s) =>
        `<option value="${s}"${selected === s ? " selected" : ""}>${escapeHtml(STATUS_LABELS[s])}</option>`,
    ).join("")}
  </select>`;
}

function renderTrafficSelect(name: string, selected: string): string {
  return `<select name="${escapeHtml(name)}" class="tv-input-full">
    ${WHOLESALE_TRAFFIC_TYPES.map(
      (t) =>
        `<option value="${t}"${selected === t ? " selected" : ""}>${escapeHtml(trafficTypeLabel(t))}</option>`,
    ).join("")}
  </select>`;
}

function renderQualitySelect(name: string, selected: string): string {
  return `<select name="${escapeHtml(name)}" class="tv-input-full">
    ${WHOLESALE_QUALITY_ESTIMATES.map(
      (q) =>
        `<option value="${q}"${selected === q ? " selected" : ""}>${escapeHtml(qualityLabel(q))}</option>`,
    ).join("")}
  </select>`;
}

function renderProviderSelect(
  providers: WholesaleProviderRow[],
  selectedId: string,
  optional = false,
): string {
  const empty = optional ? `<option value="">— Sin proveedor —</option>` : "";
  return `<select name="provider_id" class="tv-input-full"${optional ? "" : " required"}>
    ${empty}
    ${providers
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}"${selectedId === p.id ? " selected" : ""}>${escapeHtml(p.name)} (${escapeHtml(p.code)})</option>`,
      )
      .join("")}
  </select>`;
}

function renderRouteSelect(
  routes: WholesaleRouteWithProvider[],
  selectedId: string,
): string {
  return `<select name="route_id" class="tv-input-full">
    <option value="">— Sin ruta —</option>
    ${routes
      .map((r) => {
        const label = `${r.country_code} · ${r.operator_name}${r.provider_name ? ` (${r.provider_name})` : ""}`;
        return `<option value="${escapeHtml(r.id)}"${selectedId === r.id ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("")}
  </select>`;
}

function renderCustomerSelect(
  customers: WholesaleCustomerRow[],
  selectedId: string,
): string {
  return `<select name="customer_id" class="tv-input-full" required>
    <option value="">— Seleccionar cliente —</option>
    ${customers
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}"${selectedId === c.id ? " selected" : ""}>${escapeHtml(c.company_name)}</option>`,
      )
      .join("")}
  </select>`;
}

function renderWholesaleKpiLink(href: string, cardHtml: string): string {
  return `<a href="${escapeHtml(href)}" class="tv-kpi-link">${cardHtml}</a>`;
}

export function renderWholesaleHubPage(
  opts: BaseOpts & { dashboard: WholesaleDashboardSnapshot },
): string {
  const { kpis, sellableRoutes, pendingOffers, recentTests, pipelineOpportunities, smppNoc } =
    opts.dashboard;

  const noc = smppNoc;
  const nocPanel = noc
    ? `<section class="tv-panel tv-wholesale-noc">
    <div class="tv-panel__head"><div><h2>SMPP NOC</h2><p class="tv-panel__sub">Estado operativo conexiones y rate plans internacionales</p></div>
    <a href="/admin/wholesale/smpp-lab" class="btn btn-ghost btn-sm">Abrir SMPP Lab</a></div>
    <div class="tv-kpi-grid tv-kpi-grid--wholesale" style="margin-top:0">
      ${renderKpiCard({ label: "Conexiones SMPP", value: String(noc.connectionsTotal), hint: `${noc.connectionsActive} activas`, icon: "cable", variant: "primary" }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale')}
      ${renderKpiCard({ label: "Rate plans draft", value: String(noc.ratePlansDraft), hint: `${noc.ratePlansTesting} en testing`, icon: "currency_exchange", variant: "warn" }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale')}
      ${renderKpiCard({ label: "Rate plans live", value: String(noc.ratePlansLive), hint: "Internacionales", icon: "public", variant: "success" }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale')}
    </div>
    <div class="tv-wholesale-noc__grid">
      <div><strong>Último bind OK</strong><br>${noc.lastBindOk ? `${escapeHtml(noc.lastBindOk.tested_at)} · ${noc.lastBindOk.latency_ms ?? "—"} ms` : "—"}</div>
      <div><strong>Último bind fallido</strong><br>${noc.lastBindFailed ? `${escapeHtml(noc.lastBindFailed.tested_at)} · ${escapeHtml(noc.lastBindFailed.error_message ?? "—")}` : "—"}</div>
      <div><strong>Último SMS test</strong><br>${noc.lastSendTest ? `${escapeHtml(noc.lastSendTest.sent_at)} · ${escapeHtml(noc.lastSendTest.submit_status)} / DLR ${escapeHtml(noc.lastSendTest.dlr_status)}` : "—"}</div>
      <div><strong>Rutas live por país</strong><br>${noc.routesLiveByCountry.length ? noc.routesLiveByCountry.map((r) => `${escapeHtml(r.country_iso)} (${r.count})`).join(", ") : "—"}</div>
    </div>
  </section>`
    : "";

  const kpiGrid = `<div class="tv-kpi-grid tv-kpi-grid--wholesale">
    ${renderWholesaleKpiLink("/admin/wholesale/providers", renderKpiCard({
      label: "Proveedores activos",
      value: String(kpis.activeProviders),
      hint: "Live o aprobados",
      icon: "hub",
      variant: "primary",
    }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale'))}
    ${renderWholesaleKpiLink("/admin/wholesale/routes", renderKpiCard({
      label: "Rutas live",
      value: String(kpis.routesLive),
      hint: "Listas para vender",
      icon: "route",
      variant: "success",
    }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale'))}
    ${renderWholesaleKpiLink("/admin/wholesale/routes", renderKpiCard({
      label: "Rutas en testing",
      value: String(kpis.routesTesting),
      hint: "En validación",
      icon: "science",
      variant: "warn",
    }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale'))}
    ${renderWholesaleKpiLink("/admin/wholesale/rates", renderKpiCard({
      label: "Ofertas pendientes",
      value: String(kpis.pendingOffers),
      hint: "Draft o en prueba",
      icon: "mail",
      variant: "warn",
    }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale'))}
    ${renderWholesaleKpiLink("/admin/wholesale/customers", renderKpiCard({
      label: "Clientes wholesale",
      value: String(kpis.customers),
      hint: "Pipeline comercial",
      icon: "business",
      variant: "default",
    }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale'))}
    ${renderWholesaleKpiLink("/admin/wholesale/opportunities", renderKpiCard({
      label: "Oportunidades abiertas",
      value: String(kpis.openOpportunities),
      hint: "Draft, testing o aprobadas",
      icon: "trending_up",
      variant: "primary",
    }).replace('class="tv-kpi', 'class="tv-kpi tv-kpi--wholesale'))}
  </div>`;

  const quickActions = `<div class="tv-wholesale-actions">
    <section class="tv-panel tv-wholesale-actions__group">
      <h2 class="tv-panel__title">Operación</h2>
      <div class="tv-quick-grid">
        ${renderQuickAction({ href: "/admin/wholesale/smpp-lab", label: "SMPP Lab", description: "Conexiones, bind test y SMS test", icon: "cable" })}
        ${renderQuickAction({ href: "/admin/wholesale/international-rates", label: "Rate plans intl.", description: "RO, GB, CL y destinos globales", icon: "currency_exchange" })}
        ${renderQuickAction({ href: "/admin/wholesale/providers/new", label: "Nuevo proveedor", description: "Agregador o carrier internacional", icon: "hub" })}
        ${renderQuickAction({ href: "/admin/wholesale/routes/new", label: "Nueva ruta", description: "País, operador, costo y margen", icon: "route" })}
        ${renderQuickAction({ href: "/admin/wholesale/route-tests/new", label: "Registrar prueba", description: "Validar entrega antes de live", icon: "science" })}
      </div>
    </section>
    <section class="tv-panel tv-wholesale-actions__group">
      <h2 class="tv-panel__title">Comercial</h2>
      <div class="tv-quick-grid">
        ${renderQuickAction({ href: "/admin/wholesale/rates/new", label: "Pegar oferta rates", description: "Texto recibido por email o WhatsApp", icon: "content_paste" })}
        ${renderQuickAction({ href: "/admin/wholesale/customers/new", label: "Nuevo cliente", description: "API, SMPP o conexión manual", icon: "person_add" })}
        ${renderQuickAction({ href: "/admin/wholesale/opportunities/new", label: "Nueva oportunidad", description: "Volumen, país y precio objetivo", icon: "handshake" })}
      </div>
    </section>
  </div>`;

  const sellableRows = sellableRoutes.length
    ? sellableRoutes
        .map((r) => {
          const cost = Number(r.cost);
          const sale = Number(r.sale_price);
          return `<tr>
          <td><strong>${escapeHtml(r.country_code)}</strong>${r.country_name ? `<br><span class="field-hint">${escapeHtml(r.country_name)}</span>` : ""}</td>
          <td>${escapeHtml(r.operator_name)}</td>
          <td class="tv-wholesale-price">${Number(sale).toFixed(4)} ${escapeHtml(r.currency)}</td>
          <td>${renderMarginCell(cost, sale)}</td>
          <td>${wholesaleStatusBadge(r.status)}</td>
        </tr>`;
        })
        .join("")
    : renderEmptyRow(5, "Sin rutas live o aprobadas todavía.");

  const offerRows = pendingOffers.length
    ? pendingOffers
        .map(
          (o) => `<tr>
          <td><strong>${escapeHtml(o.title ?? "Sin título")}</strong></td>
          <td>${escapeHtml(o.provider_name ?? "—")}</td>
          <td>${renderRatePreview(o.raw_text)}</td>
          <td>${wholesaleStatusBadge(o.status)}</td>
        </tr>`,
        )
        .join("")
    : renderEmptyRow(4, "Sin ofertas pendientes de revisión.");

  const testRows = recentTests.length
    ? recentTests
        .map(
          (t) => `<tr>
          <td>${escapeHtml(t.route_label ?? "—")}</td>
          <td><code>${escapeHtml(t.test_number ?? "—")}</code></td>
          <td>${deliveryBadge(t.delivery_status)}</td>
          <td>${wholesaleStatusBadge(t.status)}</td>
        </tr>`,
        )
        .join("")
    : renderEmptyRow(4, "Sin pruebas registradas.");

  const pipelineRows = pipelineOpportunities.length
    ? pipelineOpportunities
        .map(
          (o) => `<tr>
          <td><strong>${escapeHtml(o.company_name ?? "—")}</strong></td>
          <td>${escapeHtml(o.country_code ?? "—")}</td>
          <td class="tv-wholesale-vol">${fmtVolume(o.volume_estimate)}</td>
          <td class="tv-wholesale-price">${o.target_price != null ? fmtRate(Number(o.target_price), o.currency) : "—"}</td>
          <td>${wholesaleStatusBadge(o.commercial_status)}</td>
        </tr>`,
        )
        .join("")
    : renderEmptyRow(5, "Sin oportunidades en pipeline.");

  const summaries = `<div class="tv-wholesale-summary-grid">
    ${renderSummaryPanel({
      title: "Rutas disponibles para vender",
      subtitle: "Últimas rutas live o aprobadas",
      href: "/admin/wholesale/routes",
      linkLabel: "Ver todas",
      tableHtml: `<table class="tv-table tv-table--compact tv-table--wholesale"><thead><tr>
        <th>País</th><th>Operador</th><th>Precio venta</th><th>Margen</th><th>Estado</th>
      </tr></thead><tbody>${sellableRows}</tbody></table>`,
    })}
    ${renderSummaryPanel({
      title: "Ofertas pendientes",
      subtitle: "Rates en draft o testing",
      href: "/admin/wholesale/rates",
      linkLabel: "Ver ofertas",
      tableHtml: `<table class="tv-table tv-table--compact tv-table--wholesale"><thead><tr>
        <th>Título</th><th>Proveedor</th><th>Preview</th><th>Estado</th>
      </tr></thead><tbody>${offerRows}</tbody></table>`,
    })}
    ${renderSummaryPanel({
      title: "Pruebas recientes",
      subtitle: "Resultado de entrega y DLR",
      href: "/admin/wholesale/route-tests",
      linkLabel: "Ver pruebas",
      tableHtml: `<table class="tv-table tv-table--compact tv-table--wholesale"><thead><tr>
        <th>Ruta</th><th>Número</th><th>DLR</th><th>Estado</th>
      </tr></thead><tbody>${testRows}</tbody></table>`,
    })}
    ${renderSummaryPanel({
      title: "Pipeline comercial",
      subtitle: "Oportunidades wholesale recientes",
      href: "/admin/wholesale/opportunities",
      linkLabel: "Ver pipeline",
      tableHtml: `<table class="tv-table tv-table--compact tv-table--wholesale"><thead><tr>
        <th>Cliente</th><th>País</th><th>Volumen est.</th><th>Precio objetivo</th><th>Estado</th>
      </tr></thead><tbody>${pipelineRows}</tbody></table>`,
    })}
  </div>`;

  const body = `
    ${renderPageHeader({
      title: "Wholesale Core",
      subtitle:
        "Centro operativo para proveedores, rutas internacionales, ofertas de rates, pruebas, clientes y oportunidades comerciales de Telvoice.net.",
    })}
    ${kpiGrid}
    ${nocPanel}
    ${quickActions}
    ${renderSectionTitle("Resumen operativo", "Vista rápida de lo más relevante para operación y comercial wholesale.")}
    ${summaries}`;

  return wrapWholesale(opts, "hub", "Wholesale Core", body);
}

// ── Providers ──────────────────────────────────────────────────────────────────

export function renderWholesaleProvidersListPage(
  opts: BaseOpts & { providers: WholesaleProviderRow[] },
): string {
  const rows = opts.providers.length
    ? opts.providers
        .map(
          (p) => `<tr>
        <td><strong>${escapeHtml(p.name)}</strong><br><code class="tv-code-sm">${escapeHtml(p.code)}</code></td>
        <td>${escapeHtml(p.country_code)}</td>
        <td>${escapeHtml(connectionLabel(p.connection_type))}</td>
        <td>${escapeHtml(p.contact_name ?? "—")}<br><span class="field-hint">${escapeHtml(p.contact_email ?? p.contact_whatsapp ?? "—")}</span></td>
        <td>${wholesaleStatusBadge(p.status)}</td>
        <td class="tv-table-actions">
          <a href="/admin/wholesale/providers/${escapeHtml(p.id)}/edit" class="row-link">Editar</a>
          ${renderDeleteForm(`/admin/wholesale/providers/${p.id}/delete`, p.name)}
        </td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="field-hint">Sin proveedores registrados.</td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Proveedores wholesale",
      subtitleHtml:
        'Carriers y agregadores internacionales para <strong>Telvoice.net</strong>. No confundir con <a href="/admin/providers">Proveedores SMS</a> del routing Chile.',
      actions: renderBtn("Nuevo proveedor", { href: "/admin/wholesale/providers/new", variant: "primary", icon: "add" }),
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr>
        <th>Proveedor</th><th>País</th><th>Conexión</th><th>Contacto</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrapWholesale(opts, "providers", "Proveedores wholesale", body);
}

export function renderWholesaleProviderFormPage(
  opts: BaseOpts & {
    mode: "create" | "edit";
    provider?: WholesaleProviderRow;
    values?: Record<string, unknown>;
    error?: string;
  },
): string {
  const p = opts.provider;
  const v = opts.values;
  const isEdit = opts.mode === "edit";
  const action = isEdit
    ? `/admin/wholesale/providers/${escapeHtml(p!.id)}/edit`
    : "/admin/wholesale/providers";

  const connOptions = WHOLESALE_PROVIDER_CONNECTION_TYPES.map(
    (t) =>
      `<option value="${t}"${val(v, "connection_type", p?.connection_type ?? "http_api") === t ? " selected" : ""}>${escapeHtml(connectionLabel(t))}</option>`,
  ).join("");

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel">
      <h2 class="tv-panel__title">${isEdit ? "Editar proveedor" : "Nuevo proveedor"}</h2>
      <div class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>Nombre *</label>
          <input type="text" name="name" required class="tv-input-full" value="${escapeHtml(val(v, "name", p?.name))}" /></div>
        <div class="form-group"><label>Código *</label>
          <input type="text" name="code" required class="tv-input-full" value="${escapeHtml(val(v, "code", p?.code))}" placeholder="ej. carrier_xyz" /></div>
        <div class="form-group"><label>País (ISO)</label>
          <input type="text" name="country_code" class="tv-input-full" value="${escapeHtml(val(v, "country_code", p?.country_code ?? "CL"))}" maxlength="3" /></div>
        <div class="form-group"><label>Tipo conexión</label>
          <select name="connection_type" class="tv-input-full">${connOptions}</select></div>
        <div class="form-group"><label>Contacto</label>
          <input type="text" name="contact_name" class="tv-input-full" value="${escapeHtml(val(v, "contact_name", p?.contact_name ?? ""))}" /></div>
        <div class="form-group"><label>Email</label>
          <input type="email" name="contact_email" class="tv-input-full" value="${escapeHtml(val(v, "contact_email", p?.contact_email ?? ""))}" /></div>
        <div class="form-group"><label>WhatsApp</label>
          <input type="text" name="contact_whatsapp" class="tv-input-full" value="${escapeHtml(val(v, "contact_whatsapp", p?.contact_whatsapp ?? ""))}" /></div>
        <div class="form-group"><label>Estado</label>
          ${renderStatusSelect("status", val(v, "status", p?.status ?? "draft"))}</div>
        <div class="form-group" style="grid-column:1/-1"><label>Notas</label>
          <textarea name="notes" class="tv-input-full" rows="3">${escapeHtml(val(v, "notes", p?.notes ?? ""))}</textarea></div>
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Guardar cambios" : "Crear proveedor", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/providers" class="btn btn-ghost">Cancelar</a>
      </div>
    </form>`;

  return wrapWholesale(opts, "providers", isEdit ? "Editar proveedor" : "Nuevo proveedor", form);
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function renderWholesaleRoutesListPage(
  opts: BaseOpts & {
    routes: WholesaleRouteWithProvider[];
    providers: WholesaleProviderRow[];
  },
): string {
  const rows = opts.routes.length
    ? opts.routes
        .map((r) => {
          return `<tr>
        <td>${escapeHtml(r.provider_name ?? "—")}<br><code class="tv-code-sm">${escapeHtml(r.provider_code ?? "")}</code></td>
        <td>${escapeHtml(r.country_code)}${r.country_name ? `<br><span class="field-hint">${escapeHtml(r.country_name)}</span>` : ""}</td>
        <td>${escapeHtml(r.operator_name)}</td>
        <td>${escapeHtml(trafficTypeLabel(r.traffic_type))}</td>
        <td class="tv-wholesale-price">${Number(r.cost).toFixed(4)}</td>
        <td class="tv-wholesale-price">${Number(r.sale_price).toFixed(4)}</td>
        <td class="tv-wholesale-col-margin">${renderMarginCell(Number(r.cost), Number(r.sale_price))}</td>
        <td>${escapeHtml(r.currency)}</td>
        <td>${r.tps}</td>
        <td>${escapeHtml(qualityLabel(r.quality_estimate))}</td>
        <td>${wholesaleStatusBadge(r.status)}</td>
        <td class="tv-table-actions">
          <a href="/admin/wholesale/routes/${escapeHtml(r.id)}/edit" class="row-link">Editar</a>
          ${renderDeleteForm(`/admin/wholesale/routes/${r.id}/delete`, r.operator_name)}
        </td>
      </tr>`;
        })
        .join("")
    : renderEmptyRow(11, "Sin rutas wholesale registradas.");

  const body = `
    ${renderPageHeader({
      title: "Rutas wholesale",
      subtitleHtml:
        'Rutas internacionales con costo, precio venta y margen. Distinto de <a href="/admin/routes">Rutas SMS</a> del telco Chile.',
      actions: renderBtn("Nueva ruta", { href: "/admin/wholesale/routes/new", variant: "primary", icon: "add" }),
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr>
        <th>Proveedor</th><th>País</th><th>Operador</th><th>Tráfico</th>
        <th>Costo</th><th>Precio venta</th><th class="tv-wholesale-col-margin">Margen</th><th>Moneda</th>
        <th>TPS</th><th>Calidad</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrapWholesale(opts, "routes", "Rutas wholesale", body);
}

export function renderWholesaleRouteFormPage(
  opts: BaseOpts & {
    mode: "create" | "edit";
    route?: WholesaleRouteWithProvider;
    providers: WholesaleProviderRow[];
    smppConnections?: WholesaleSmppConnectionEnriched[];
    ratePlans?: WholesaleInternationalRatePlanEnriched[];
    values?: Record<string, unknown>;
    error?: string;
  },
): string {
  const r = opts.route;
  const v = opts.values;
  const isEdit = opts.mode === "edit";
  const action = isEdit
    ? `/admin/wholesale/routes/${escapeHtml(r!.id)}/edit`
    : "/admin/wholesale/routes";

  const smppOpts = (opts.smppConnections ?? [])
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${val(v, "smpp_connection_id", r?.smpp_connection_id ?? "") === c.id ? " selected" : ""}>${escapeHtml(c.label)}</option>`,
    )
    .join("");
  const rateOpts = (opts.ratePlans ?? [])
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}"${val(v, "rate_plan_id", r?.rate_plan_id ?? "") === p.id ? " selected" : ""}>${escapeHtml(p.country_iso)} · ${escapeHtml(p.operator_name)}</option>`,
    )
    .join("");

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel">
      <h2 class="tv-panel__title">${isEdit ? "Editar ruta" : "Nueva ruta"}</h2>
      <div class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>Proveedor *</label>
          ${renderProviderSelect(opts.providers, val(v, "provider_id", r?.provider_id ?? ""))}</div>
        <div class="form-group"><label>País (ISO) *</label>
          <input type="text" name="country_code" required class="tv-input-full" value="${escapeHtml(val(v, "country_code", r?.country_code ?? ""))}" /></div>
        <div class="form-group"><label>Nombre país</label>
          <input type="text" name="country_name" class="tv-input-full" value="${escapeHtml(val(v, "country_name", r?.country_name ?? ""))}" /></div>
        <div class="form-group"><label>Operador *</label>
          <input type="text" name="operator_name" required class="tv-input-full" value="${escapeHtml(val(v, "operator_name", r?.operator_name ?? ""))}" /></div>
        <div class="form-group"><label>Tipo tráfico</label>
          ${renderTrafficSelect("traffic_type", val(v, "traffic_type", r?.traffic_type ?? "promotional"))}</div>
        <div class="form-group"><label>Costo</label>
          <input type="text" name="cost" class="tv-input-full" value="${escapeHtml(val(v, "cost", r?.cost != null ? String(r.cost) : "0"))}" /></div>
        <div class="form-group"><label>Precio venta</label>
          <input type="text" name="sale_price" class="tv-input-full" value="${escapeHtml(val(v, "sale_price", r?.sale_price != null ? String(r.sale_price) : "0"))}" /></div>
        <div class="form-group"><label>Moneda</label>
          <input type="text" name="currency" class="tv-input-full" value="${escapeHtml(val(v, "currency", r?.currency ?? "USD"))}" /></div>
        <div class="form-group"><label>TPS</label>
          <input type="number" name="tps" min="1" class="tv-input-full" value="${escapeHtml(val(v, "tps", r?.tps != null ? String(r.tps) : "1"))}" /></div>
        <div class="form-group"><label>Calidad estimada</label>
          ${renderQualitySelect("quality_estimate", val(v, "quality_estimate", r?.quality_estimate ?? "unknown"))}</div>
        <div class="form-group"><label>Estado</label>
          ${renderStatusSelect("status", val(v, "status", r?.status ?? "draft"))}</div>
        <div class="form-group"><label>Conexión SMPP</label>
          <select name="smpp_connection_id" class="tv-input-full"><option value="">—</option>${smppOpts}</select></div>
        <div class="form-group"><label>Rate plan intl.</label>
          <select name="rate_plan_id" class="tv-input-full"><option value="">—</option>${rateOpts}</select></div>
        <div class="form-group" style="grid-column:1/-1"><label>Notas</label>
          <textarea name="notes" class="tv-input-full" rows="3">${escapeHtml(val(v, "notes", r?.notes ?? ""))}</textarea></div>
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Guardar cambios" : "Crear ruta", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/routes" class="btn btn-ghost">Cancelar</a>
      </div>
    </form>`;

  return wrapWholesale(opts, "routes", isEdit ? "Editar ruta" : "Nueva ruta", form);
}

// ── Rate offers ──────────────────────────────────────────────────────────────

export function renderWholesaleRateOffersListPage(
  opts: BaseOpts & { offers: WholesaleRateOfferWithProvider[] },
): string {
  const rows = opts.offers.length
    ? opts.offers
        .map(
          (o) => `<tr>
        <td><strong>${escapeHtml(o.title ?? "—")}</strong></td>
        <td>${escapeHtml(o.provider_name ?? "—")}</td>
        <td>${escapeHtml(o.country_code ?? "—")}</td>
        <td>${renderRatePreview(o.raw_text)}</td>
        <td>${o.received_at ? formatDate(o.received_at) : "—"}</td>
        <td>${wholesaleStatusBadge(o.status)}</td>
        <td class="tv-table-actions">
          <a href="/admin/wholesale/rates/${escapeHtml(o.id)}/edit" class="row-link">Editar</a>
          ${renderDeleteForm(`/admin/wholesale/rates/${o.id}/delete`, o.title ?? "oferta")}
        </td>
      </tr>`,
        )
        .join("")
    : renderEmptyRow(7, "Sin ofertas de rates registradas.");

  const body = `
    ${renderPageHeader({
      title: "Ofertas de rates",
      subtitle: "Pega y revisa texto recibido por correo o WhatsApp desde proveedores internacionales.",
      actions: renderBtn("Nueva oferta", { href: "/admin/wholesale/rates/new", variant: "primary", icon: "add" }),
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr>
        <th>Título</th><th>Proveedor</th><th>País</th><th>Texto recibido</th><th>Recibida</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrapWholesale(opts, "rates", "Ofertas de rates", body);
}

export function renderWholesaleRateOfferFormPage(
  opts: BaseOpts & {
    mode: "create" | "edit";
    offer?: WholesaleRateOfferWithProvider;
    providers: WholesaleProviderRow[];
    values?: Record<string, unknown>;
    error?: string;
  },
): string {
  const o = opts.offer;
  const v = opts.values;
  const isEdit = opts.mode === "edit";
  const action = isEdit
    ? `/admin/wholesale/rates/${escapeHtml(o!.id)}/edit`
    : "/admin/wholesale/rates";

  const receivedVal = val(
    v,
    "received_at",
    o?.received_at ? o.received_at.slice(0, 16) : "",
  );

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel">
      <h2 class="tv-panel__title">${isEdit ? "Editar oferta" : "Nueva oferta de rates"}</h2>
      <div class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>Título</label>
          <input type="text" name="title" class="tv-input-full" value="${escapeHtml(val(v, "title", o?.title ?? ""))}" placeholder="ej. Rates LATAM marzo 2026" /></div>
        <div class="form-group"><label>Proveedor</label>
          ${renderProviderSelect(opts.providers, val(v, "provider_id", o?.provider_id ?? ""), true)}</div>
        <div class="form-group"><label>País (ISO)</label>
          <input type="text" name="country_code" class="tv-input-full" value="${escapeHtml(val(v, "country_code", o?.country_code ?? ""))}" /></div>
        <div class="form-group"><label>Fecha recepción</label>
          <input type="datetime-local" name="received_at" class="tv-input-full" value="${escapeHtml(receivedVal)}" /></div>
        <div class="form-group"><label>Estado</label>
          ${renderStatusSelect("status", val(v, "status", o?.status ?? "draft"))}</div>
        <div class="form-group" style="grid-column:1/-1"><label>Texto original * <span class="field-hint">(pegar desde email o WhatsApp)</span></label>
          <textarea name="raw_text" required class="tv-input-full" rows="12" placeholder="Pegar aquí la tabla o texto de rates recibido...">${escapeHtml(val(v, "raw_text", o?.raw_text ?? ""))}</textarea></div>
        <div class="form-group" style="grid-column:1/-1"><label>Notas de parseo / observaciones</label>
          <textarea name="parsed_notes" class="tv-input-full" rows="3">${escapeHtml(val(v, "parsed_notes", o?.parsed_notes ?? ""))}</textarea></div>
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Guardar cambios" : "Registrar oferta", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/rates" class="btn btn-ghost">Cancelar</a>
      </div>
    </form>`;

  return wrapWholesale(opts, "rates", isEdit ? "Editar oferta" : "Nueva oferta", form);
}

// ── Route tests ────────────────────────────────────────────────────────────────

export function renderWholesaleRouteTestsListPage(
  opts: BaseOpts & { tests: WholesaleRouteTestEnriched[] },
): string {
  const rows = opts.tests.length
    ? opts.tests
        .map(
          (t) => `<tr>
        <td>${escapeHtml(t.route_label ?? "—")}</td>
        <td>${escapeHtml(t.provider_name ?? "—")}</td>
        <td><code>${escapeHtml(t.test_number ?? "—")}</code></td>
        <td>${escapeHtml(t.destination_country ?? "—")}</td>
        <td>${deliveryBadge(t.delivery_status)}</td>
        <td>${t.tested_at ? formatDate(t.tested_at) : "—"}</td>
        <td>${wholesaleStatusBadge(t.status)}</td>
        <td class="tv-table-actions">
          <a href="/admin/wholesale/route-tests/${escapeHtml(t.id)}/edit" class="row-link">Editar</a>
          ${renderDeleteForm(`/admin/wholesale/route-tests/${t.id}/delete`, "prueba")}
        </td>
      </tr>`,
        )
        .join("")
    : renderEmptyRow(8, "Sin pruebas de ruta registradas.");

  const body = `
    ${renderPageHeader({
      title: "Pruebas de rutas",
      subtitle: "Registro manual de pruebas de entrega y DLR antes de activar rutas live.",
      actions: renderBtn("Nueva prueba", { href: "/admin/wholesale/route-tests/new", variant: "primary", icon: "add" }),
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr>
        <th>Ruta</th><th>Proveedor</th><th>Número prueba</th><th>País destino</th>
        <th>DLR / entrega</th><th>Fecha prueba</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrapWholesale(opts, "route-tests", "Pruebas de rutas", body);
}

export function renderWholesaleRouteTestFormPage(
  opts: BaseOpts & {
    mode: "create" | "edit";
    test?: WholesaleRouteTestEnriched;
    providers: WholesaleProviderRow[];
    routes: WholesaleRouteWithProvider[];
    values?: Record<string, unknown>;
    error?: string;
  },
): string {
  const t = opts.test;
  const v = opts.values;
  const isEdit = opts.mode === "edit";
  const action = isEdit
    ? `/admin/wholesale/route-tests/${escapeHtml(t!.id)}/edit`
    : "/admin/wholesale/route-tests";

  const testedVal = val(v, "tested_at", t?.tested_at ? t.tested_at.slice(0, 16) : "");

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel">
      <h2 class="tv-panel__title">${isEdit ? "Editar prueba" : "Nueva prueba de ruta"}</h2>
      <div class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>Ruta</label>
          ${renderRouteSelect(opts.routes, val(v, "route_id", t?.route_id ?? ""))}</div>
        <div class="form-group"><label>Proveedor</label>
          ${renderProviderSelect(opts.providers, val(v, "provider_id", t?.provider_id ?? ""), true)}</div>
        <div class="form-group"><label>Número de prueba</label>
          <input type="text" name="test_number" class="tv-input-full" value="${escapeHtml(val(v, "test_number", t?.test_number ?? ""))}" /></div>
        <div class="form-group"><label>País destino</label>
          <input type="text" name="destination_country" class="tv-input-full" value="${escapeHtml(val(v, "destination_country", t?.destination_country ?? ""))}" /></div>
        <div class="form-group"><label>Estado entrega</label>
          <input type="text" name="delivery_status" class="tv-input-full" value="${escapeHtml(val(v, "delivery_status", t?.delivery_status ?? ""))}" placeholder="delivered, failed, pending..." /></div>
        <div class="form-group"><label>Fecha prueba</label>
          <input type="datetime-local" name="tested_at" class="tv-input-full" value="${escapeHtml(testedVal)}" /></div>
        <div class="form-group"><label>Estado</label>
          ${renderStatusSelect("status", val(v, "status", t?.status ?? "draft"))}</div>
        <div class="form-group" style="grid-column:1/-1"><label>Resumen resultado</label>
          <textarea name="result_summary" class="tv-input-full" rows="3">${escapeHtml(val(v, "result_summary", t?.result_summary ?? ""))}</textarea></div>
        <div class="form-group" style="grid-column:1/-1"><label>Notas</label>
          <textarea name="notes" class="tv-input-full" rows="2">${escapeHtml(val(v, "notes", t?.notes ?? ""))}</textarea></div>
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Guardar cambios" : "Registrar prueba", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/route-tests" class="btn btn-ghost">Cancelar</a>
      </div>
    </form>`;

  return wrapWholesale(opts, "route-tests", isEdit ? "Editar prueba" : "Nueva prueba", form);
}

// ── Customers ──────────────────────────────────────────────────────────────────

export function renderWholesaleCustomersListPage(
  opts: BaseOpts & { customers: WholesaleCustomerRow[] },
): string {
  const rows = opts.customers.length
    ? opts.customers
        .map(
          (c) => `<tr>
        <td><strong>${escapeHtml(c.company_name)}</strong></td>
        <td>${escapeHtml(c.contact_name ?? "—")}</td>
        <td>${escapeHtml(c.email ?? "—")}<br><span class="field-hint">${escapeHtml(c.whatsapp ?? "")}</span></td>
        <td>${escapeHtml(c.country_code)}${c.country_name ? `<br><span class="field-hint">${escapeHtml(c.country_name)}</span>` : ""}</td>
        <td>${escapeHtml(connectionLabel(c.connection_type))}</td>
        <td class="tv-wholesale-vol">${fmtVolume(c.monthly_volume_estimate)}</td>
        <td>${wholesaleStatusBadge(c.commercial_status)}</td>
        <td class="tv-table-actions">
          <a href="/admin/wholesale/customers/${escapeHtml(c.id)}/edit" class="row-link">Editar</a>
          ${renderDeleteForm(`/admin/wholesale/customers/${c.id}/delete`, c.company_name)}
        </td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="8" class="field-hint">Sin clientes wholesale registrados.</td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Clientes wholesale",
      subtitle: "Empresas interesadas en API, SMPP o conexión manual.",
      actions: renderBtn("Nuevo cliente", { href: "/admin/wholesale/customers/new", variant: "primary", icon: "add" }),
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr>
        <th>Empresa</th><th>Contacto</th><th>Email / WhatsApp</th><th>País</th>
        <th>Conexión</th><th>Vol. mensual est.</th><th>Estado comercial</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrapWholesale(opts, "customers", "Clientes wholesale", body);
}

export function renderWholesaleCustomerFormPage(
  opts: BaseOpts & {
    mode: "create" | "edit";
    customer?: WholesaleCustomerRow;
    values?: Record<string, unknown>;
    error?: string;
  },
): string {
  const c = opts.customer;
  const v = opts.values;
  const isEdit = opts.mode === "edit";
  const action = isEdit
    ? `/admin/wholesale/customers/${escapeHtml(c!.id)}/edit`
    : "/admin/wholesale/customers";

  const connOptions = WHOLESALE_CUSTOMER_CONNECTION_TYPES.map(
    (t) =>
      `<option value="${t}"${val(v, "connection_type", c?.connection_type ?? "api") === t ? " selected" : ""}>${escapeHtml(connectionLabel(t))}</option>`,
  ).join("");

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel">
      <h2 class="tv-panel__title">${isEdit ? "Editar cliente" : "Nuevo cliente wholesale"}</h2>
      <div class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>Empresa *</label>
          <input type="text" name="company_name" required class="tv-input-full" value="${escapeHtml(val(v, "company_name", c?.company_name))}" /></div>
        <div class="form-group"><label>Contacto</label>
          <input type="text" name="contact_name" class="tv-input-full" value="${escapeHtml(val(v, "contact_name", c?.contact_name ?? ""))}" /></div>
        <div class="form-group"><label>Email</label>
          <input type="email" name="email" class="tv-input-full" value="${escapeHtml(val(v, "email", c?.email ?? ""))}" /></div>
        <div class="form-group"><label>WhatsApp</label>
          <input type="text" name="whatsapp" class="tv-input-full" value="${escapeHtml(val(v, "whatsapp", c?.whatsapp ?? ""))}" /></div>
        <div class="form-group"><label>País (ISO)</label>
          <input type="text" name="country_code" class="tv-input-full" value="${escapeHtml(val(v, "country_code", c?.country_code ?? "CL"))}" /></div>
        <div class="form-group"><label>Nombre país</label>
          <input type="text" name="country_name" class="tv-input-full" value="${escapeHtml(val(v, "country_name", c?.country_name ?? ""))}" /></div>
        <div class="form-group"><label>Conexión solicitada</label>
          <select name="connection_type" class="tv-input-full">${connOptions}</select></div>
        <div class="form-group"><label>Volumen mensual estimado (SMS)</label>
          <input type="number" name="monthly_volume_estimate" min="0" class="tv-input-full" value="${escapeHtml(val(v, "monthly_volume_estimate", c?.monthly_volume_estimate != null ? String(c.monthly_volume_estimate) : ""))}" /></div>
        <div class="form-group"><label>Estado comercial</label>
          ${renderStatusSelect("commercial_status", val(v, "commercial_status", c?.commercial_status ?? "draft"))}</div>
        <div class="form-group" style="grid-column:1/-1"><label>Notas</label>
          <textarea name="notes" class="tv-input-full" rows="3">${escapeHtml(val(v, "notes", c?.notes ?? ""))}</textarea></div>
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Guardar cambios" : "Registrar cliente", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/customers" class="btn btn-ghost">Cancelar</a>
      </div>
    </form>`;

  return wrapWholesale(opts, "customers", isEdit ? "Editar cliente" : "Nuevo cliente", form);
}

// ── Opportunities ────────────────────────────────────────────────────────────

export function renderWholesaleOpportunitiesListPage(
  opts: BaseOpts & { opportunities: WholesaleOpportunityWithCustomer[] },
): string {
  const rows = opts.opportunities.length
    ? opts.opportunities
        .map(
          (o) => `<tr>
        <td>${escapeHtml(o.company_name ?? "—")}</td>
        <td>${escapeHtml(o.country_code ?? "—")}${o.country_name ? `<br><span class="field-hint">${escapeHtml(o.country_name)}</span>` : ""}</td>
        <td>${escapeHtml(trafficTypeLabel(o.traffic_type))}</td>
        <td class="tv-wholesale-vol">${fmtVolume(o.volume_estimate)}</td>
        <td class="tv-wholesale-price">${o.target_price != null ? fmtRate(Number(o.target_price), o.currency) : "—"}</td>
        <td>${wholesaleStatusBadge(o.commercial_status)}</td>
        <td class="tv-table-actions">
          <a href="/admin/wholesale/opportunities/${escapeHtml(o.id)}/edit" class="row-link">Editar</a>
          ${renderDeleteForm(`/admin/wholesale/opportunities/${o.id}/delete`, "oportunidad")}
        </td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="7" class="field-hint">Sin oportunidades registradas.</td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Oportunidades comerciales",
      subtitle: "Pipeline wholesale vinculado a clientes, países y precios objetivo.",
      actions: renderBtn("Nueva oportunidad", { href: "/admin/wholesale/opportunities/new", variant: "primary", icon: "add" }),
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr>
        <th>Cliente</th><th>País</th><th>Tráfico</th><th>Volumen est.</th>
        <th>Precio objetivo</th><th>Estado comercial</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrapWholesale(opts, "opportunities", "Oportunidades comerciales", body);
}

export function renderWholesaleOpportunityFormPage(
  opts: BaseOpts & {
    mode: "create" | "edit";
    opportunity?: WholesaleOpportunityWithCustomer;
    customers: WholesaleCustomerRow[];
    values?: Record<string, unknown>;
    error?: string;
  },
): string {
  const o = opts.opportunity;
  const v = opts.values;
  const isEdit = opts.mode === "edit";
  const action = isEdit
    ? `/admin/wholesale/opportunities/${escapeHtml(o!.id)}/edit`
    : "/admin/wholesale/opportunities";

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel">
      <h2 class="tv-panel__title">${isEdit ? "Editar oportunidad" : "Nueva oportunidad comercial"}</h2>
      <div class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>Cliente *</label>
          ${renderCustomerSelect(opts.customers, val(v, "customer_id", o?.customer_id ?? ""))}</div>
        <div class="form-group"><label>País (ISO)</label>
          <input type="text" name="country_code" class="tv-input-full" value="${escapeHtml(val(v, "country_code", o?.country_code ?? ""))}" /></div>
        <div class="form-group"><label>Nombre país</label>
          <input type="text" name="country_name" class="tv-input-full" value="${escapeHtml(val(v, "country_name", o?.country_name ?? ""))}" /></div>
        <div class="form-group"><label>Tipo tráfico</label>
          ${renderTrafficSelect("traffic_type", val(v, "traffic_type", o?.traffic_type ?? "promotional"))}</div>
        <div class="form-group"><label>Volumen estimado (SMS/mes)</label>
          <input type="number" name="volume_estimate" min="0" class="tv-input-full" value="${escapeHtml(val(v, "volume_estimate", o?.volume_estimate != null ? String(o.volume_estimate) : ""))}" /></div>
        <div class="form-group"><label>Precio objetivo</label>
          <input type="text" name="target_price" class="tv-input-full" value="${escapeHtml(val(v, "target_price", o?.target_price != null ? String(o.target_price) : ""))}" /></div>
        <div class="form-group"><label>Moneda</label>
          <input type="text" name="currency" class="tv-input-full" value="${escapeHtml(val(v, "currency", o?.currency ?? "USD"))}" /></div>
        <div class="form-group"><label>Estado comercial</label>
          ${renderStatusSelect("commercial_status", val(v, "commercial_status", o?.commercial_status ?? "draft"))}</div>
        <div class="form-group" style="grid-column:1/-1"><label>Notas</label>
          <textarea name="notes" class="tv-input-full" rows="3">${escapeHtml(val(v, "notes", o?.notes ?? ""))}</textarea></div>
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Guardar cambios" : "Crear oportunidad", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/opportunities" class="btn btn-ghost">Cancelar</a>
      </div>
    </form>`;

  return wrapWholesale(opts, "opportunities", isEdit ? "Editar oportunidad" : "Nueva oportunidad", form);
}
