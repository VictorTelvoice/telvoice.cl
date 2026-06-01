import type { AdminSessionUser } from "../../../types/admin.js";
import type { AgentSalesDashboardData } from "../../../services/agent/agentSalesMetricsService.js";
import { agentSalesFiltersToQuery } from "../../../services/agent/agentSalesMetricsService.js";
import type {
  AgentBlockedCampaignRow,
  AgentSalesOrderRow,
} from "../../../types/agent-sales.js";
import { formatClp } from "../../../utils/clp-format.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";

export type AgentSalesPageOpts = {
  admin: AdminSessionUser;
  data: AgentSalesDashboardData;
  flash?: string;
  error?: string;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function paymentBadge(status: string): string {
  const map: Record<string, string> = {
    pending: "Pendiente",
    paid: "Pagada",
    cancelled: "Cancelada",
    rejected: "Rechazada",
    refunded: "Reembolsada",
  };
  const cls =
    status === "paid"
      ? "tv-badge tv-badge--ok"
      : status === "pending"
        ? "tv-badge tv-badge--warn"
        : "tv-badge";
  return `<span class="${cls}">${escapeHtml(map[status] ?? status)}</span>`;
}

function renderFilters(data: AgentSalesDashboardData): string {
  const f = data.filters;

  const companyOptions = [
    `<option value="">Todas las empresas</option>`,
    ...data.companies.map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${f.companyId === c.id ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
    ),
  ].join("");

  return renderFilterBar(`<form method="get" action="/admin/agent-sales" class="tv-filters__form">
      ${renderFilterField("Rango", `<select name="date_range" class="tv-input">
        <option value="all"${f.dateRange === "all" ? " selected" : ""}>Todo</option>
        <option value="today"${f.dateRange === "today" ? " selected" : ""}>Hoy</option>
        <option value="7d"${f.dateRange === "7d" ? " selected" : ""}>7 días</option>
        <option value="30d"${f.dateRange === "30d" ? " selected" : ""}>30 días</option>
        <option value="month"${f.dateRange === "month" ? " selected" : ""}>Mes actual</option>
      </select>`)}
      ${renderFilterField("Empresa", `<select name="company_id" class="tv-input">${companyOptions}</select>`)}
      ${renderFilterField("Pago", `<select name="payment_status" class="tv-input">
        <option value="all"${f.paymentStatus === "all" ? " selected" : ""}>Todos</option>
        <option value="pending"${f.paymentStatus === "pending" ? " selected" : ""}>Pendiente</option>
        <option value="paid"${f.paymentStatus === "paid" ? " selected" : ""}>Pagada</option>
        <option value="cancelled"${f.paymentStatus === "cancelled" ? " selected" : ""}>Cancelada</option>
      </select>`)}
      ${renderFilterField("SMS mín.", `<input type="number" name="min_sms" class="tv-input" value="${f.minSms ?? ""}" placeholder="—" min="0" />`)}
      ${renderFilterField("SMS máx.", `<input type="number" name="max_sms" class="tv-input" value="${f.maxSms ?? ""}" placeholder="—" min="0" />`)}
      <input type="hidden" name="tab" value="${escapeHtml(f.tab ?? "overview")}" />
      <button type="submit" class="btn btn-primary">Filtrar</button>
      <a href="/admin/agent-sales" class="btn btn-ghost">Limpiar</a>
    </form>`);
}

function renderOrderActions(row: AgentSalesOrderRow): string {
  const parts: string[] = [];
  parts.push(
    `<a href="/admin/orders/${escapeHtml(row.id)}" class="btn btn-sm btn-secondary">Ver orden</a>`,
  );
  if (row.company_id) {
    parts.push(
      `<a href="/admin/clients/${escapeHtml(row.company_id)}" class="btn btn-sm btn-ghost">Cliente</a>`,
    );
  }
  if (row.agent_session_id) {
    parts.push(
      `<a href="/admin/agent-sales/conversations/${escapeHtml(row.agent_session_id)}" class="btn btn-sm btn-ghost">Conversación</a>`,
    );
  }
  if (row.checkout_url) {
    parts.push(
      `<a href="${escapeHtml(row.checkout_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost">MercadoPago</a>`,
    );
  }
  if (row.company_id) {
    parts.push(
      `<a href="/admin/wallets?company_id=${escapeHtml(row.company_id)}" class="btn btn-sm btn-ghost">Wallet</a>`,
    );
  }
  return `<div class="tv-actions-inline">${parts.join("")}</div>`;
}

function renderOrdersTable(orders: AgentSalesOrderRow[]): string {
  if (orders.length === 0) {
    return `<p class="tv-muted">No hay órdenes del agente en este período.</p>`;
  }

  const rows = orders
    .map((o) => {
      const checkoutCell = o.checkout_url
        ? `<button type="button" class="btn btn-sm btn-ghost" data-copy="${escapeHtml(o.checkout_url)}">Copiar link</button>`
        : "—";
      return `<tr>
        <td>${escapeHtml(formatDate(o.created_at))}</td>
        <td>${o.company_name ? escapeHtml(o.company_name) : "—"}</td>
        <td>${o.contact_email ? escapeHtml(o.contact_email) : "—"}</td>
        <td>${escapeHtml(o.sms_quantity.toLocaleString("es-CL"))}</td>
        <td>${o.subtotal_net != null ? escapeHtml(formatClp(o.subtotal_net)) : "—"}</td>
        <td>${o.iva != null ? escapeHtml(formatClp(o.iva)) : "—"}</td>
        <td>${escapeHtml(formatClp(o.amount))}</td>
        <td>${paymentBadge(o.payment_status)}</td>
        <td><span class="tv-badge">${escapeHtml(o.credit_status)}</span></td>
        <td>${escapeHtml(o.source)}</td>
        <td>${escapeHtml(o.channel)}</td>
        <td>${checkoutCell}</td>
        <td><a href="/admin/orders/${escapeHtml(o.id)}">${escapeHtml(o.id.slice(0, 8))}…</a></td>
        <td>${o.agent_session_id ? `<a href="/admin/agent-sales/conversations/${escapeHtml(o.agent_session_id)}">${escapeHtml(o.agent_session_id.slice(0, 8))}…</a>` : "—"}</td>
        <td>${renderOrderActions(o)}</td>
      </tr>`;
    })
    .join("");

  return `<div class="tv-table-wrap">
    <table class="tv-table">
      <thead>
        <tr>
          <th>Fecha</th><th>Empresa</th><th>Contacto</th><th>SMS</th>
          <th>Neto</th><th>IVA</th><th>Total</th><th>Pago</th><th>Crédito</th>
          <th>Source</th><th>Canal</th><th>Checkout</th><th>Orden</th><th>Sesión</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <script>
  document.querySelectorAll("[data-copy]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var t = btn.getAttribute("data-copy");
      if (t && navigator.clipboard) navigator.clipboard.writeText(t);
    });
  });
  </script>`;
}

function renderBlockedSection(blocked: AgentBlockedCampaignRow[]): string {
  if (blocked.length === 0) {
    return `<p class="tv-muted">Sin campañas bloqueadas por saldo en el período.</p>`;
  }

  const rows = blocked
    .map(
      (b) => `<tr>
        <td>${escapeHtml(formatDate(b.created_at))}</td>
        <td>${b.company_name ? escapeHtml(b.company_name) : "—"}</td>
        <td>${escapeHtml(b.available_sms.toLocaleString("es-CL"))}</td>
        <td>${escapeHtml(b.required_sms.toLocaleString("es-CL"))}</td>
        <td>${escapeHtml(b.shortfall_sms.toLocaleString("es-CL"))}</td>
        <td>${escapeHtml(b.recommended_bag.toLocaleString("es-CL"))}</td>
        <td>${b.generated_payment_link ? "Sí" : "No"}</td>
        <td>${b.order_paid ? "Sí" : "No"}</td>
        <td>${b.session_id ? `<a href="/admin/agent-sales/conversations/${escapeHtml(b.session_id)}">Ver</a>` : "—"}</td>
      </tr>`,
    )
    .join("");

  return `<div class="tv-table-wrap">
    <table class="tv-table">
      <thead>
        <tr>
          <th>Fecha</th><th>Empresa</th><th>Saldo</th><th>Requeridos</th>
          <th>Faltante</th><th>Bolsa recom.</th><th>Link</th><th>Pagó</th><th>Chat</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function renderAgentSalesPage(opts: AgentSalesPageOpts): string {
  const { data, admin } = opts;
  const k = data.kpis;
  const tab = data.filters.tab ?? "overview";

  const tabs = [
    { id: "overview", label: "Resumen", href: `/admin/agent-sales${agentSalesFiltersToQuery({ ...data.filters, tab: "overview" })}` },
    { id: "orders", label: "Órdenes", href: `/admin/agent-sales${agentSalesFiltersToQuery({ ...data.filters, tab: "orders" })}` },
    { id: "blocked", label: "Bloqueos saldo", href: `/admin/agent-sales${agentSalesFiltersToQuery({ ...data.filters, tab: "blocked" })}` },
  ];

  const tabNav = tabs
    .map(
      (t) =>
        `<a href="${escapeHtml(t.href)}" class="tv-tab${tab === t.id ? " tv-tab--active" : ""}">${escapeHtml(t.label)}</a>`,
    )
    .join("");

  const kpis = `<div class="tv-kpi-grid">
    ${renderKpiCard({ label: "Cotizaciones", value: String(k.quotesGenerated), icon: "request_quote", variant: "primary" })}
    ${renderKpiCard({ label: "Links de pago", value: String(k.paymentLinksGenerated), icon: "link" })}
    ${renderKpiCard({ label: "Órdenes pendientes", value: String(k.pendingOrders), icon: "hourglass_empty", variant: "warn" })}
    ${renderKpiCard({ label: "Órdenes pagadas", value: String(k.paidOrders), icon: "check_circle", variant: "success" })}
    ${renderKpiCard({ label: "Monto potencial", value: formatClp(k.potentialAmountClp), hint: "Pendientes + pagadas" })}
    ${renderKpiCard({ label: "Monto pagado", value: formatClp(k.paidAmountClp), variant: "success" })}
    ${renderKpiCard({ label: "SMS vendidos", value: k.smsSold.toLocaleString("es-CL"), icon: "sms" })}
    ${renderKpiCard({ label: "Conversión", value: pct(k.conversionRate), hint: "Pagadas / links" })}
    ${renderKpiCard({ label: "Ticket promedio", value: formatClp(k.averagePaidOrderClp) })}
    ${renderKpiCard({ label: "Bloqueos por saldo", value: String(k.blockedByBalance), icon: "block", variant: "danger" })}
  </div>`;

  const topCompanies =
    data.topCompanies.length > 0
      ? `<ul class="tv-list">${data.topCompanies
          .map(
            (c) =>
              `<li><a href="/admin/clients/${escapeHtml(c.company_id)}">${escapeHtml(c.company_name)}</a> — ${escapeHtml(String(c.interactions))} sesiones</li>`,
          )
          .join("")}</ul>`
      : `<p class="tv-muted">Sin datos de sesiones en el período.</p>`;

  let main = "";
  if (tab === "orders") {
    main = renderPanel("Órdenes del agente", renderOrdersTable(data.orders));
  } else if (tab === "blocked") {
    main = renderPanel(
      "Campañas bloqueadas por saldo",
      renderBlockedSection(data.blocked),
    );
  } else {
    main = `
      ${renderPanel("Órdenes recientes", renderOrdersTable(data.orders.slice(0, 25)))}
      ${renderPanel("Campañas bloqueadas por saldo", renderBlockedSection(data.blocked.slice(0, 15)))}
      ${renderPanel("Empresas con más interacción", topCompanies)}
    `;
  }

  const flash =
    opts.flash || opts.error
      ? `<div class="tv-flash${opts.error ? " tv-flash--error" : ""}">${escapeHtml(opts.error ?? opts.flash ?? "")}</div>`
      : "";

  const body = `
    ${flash}
    ${renderPageHeader({
      title: "Ventas del Agente",
      subtitle:
        "Cotizaciones, links de pago y compras generadas por el Agente Telvoice.",
    })}
    ${renderFilters(data)}
    ${kpis}
    <nav class="tv-tabs" style="margin:1.5rem 0 1rem">${tabNav}</nav>
    ${main}
  `;

  return wrapAdminPage({
    admin,
    title: "Ventas del Agente",
    activeNav: "agent-sales",
    body,
  });
}

export function renderAgentSalesConversationPage(opts: {
  admin: AdminSessionUser;
  detail: Awaited<
    ReturnType<
      typeof import("../../../services/agent/agentSalesMetricsService.js").loadAgentSalesConversation
    >
  >;
  flash?: string;
  error?: string;
}): string {
  const { detail, admin } = opts;
  const msgs = detail.messages
    .map(
      (m) => `<article class="tv-chat-bubble tv-chat-bubble--${escapeHtml(m.role)}">
        <header>${escapeHtml(m.role)} · ${escapeHtml(formatDate(m.created_at))}</header>
        <pre class="tv-chat-text">${escapeHtml(m.content)}</pre>
        ${m.metadata ? `<details><summary>Metadata</summary><pre>${escapeHtml(JSON.stringify(m.metadata, null, 2))}</pre></details>` : ""}
      </article>`,
    )
    .join("");

  const orders = renderOrdersTable(detail.relatedOrders);

  const body = `
    ${renderPageHeader({
      title: "Conversación del agente",
      subtitle: detail.companyName
        ? `${detail.companyName} · ${detail.sessionId}`
        : detail.sessionId,
      actions: `<a href="/admin/agent-sales" class="btn btn-secondary">Volver</a>`,
    })}
    ${renderPanel("Mensajes", msgs || "<p class=\"tv-muted\">Sin mensajes persistidos.</p>")}
    ${renderPanel("Órdenes vinculadas", orders)}
  `;

  return wrapAdminPage({
    admin,
    title: "Conversación agente",
    activeNav: "agent-sales",
    body,
  });
}
