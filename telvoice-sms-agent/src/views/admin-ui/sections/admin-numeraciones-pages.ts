import type { AdminSessionUser } from "../../../types/admin.js";
import type { SimActivationRequestListItem } from "../../../types/sim-activation.js";
import type { RealNumberInventoryRow, RealNumberInventorySummary, PublicInventoryFilterCategory, PublicStockSummary, InventoryPublicDashboardRow } from "../../../types/real-number-inventory.js";
import { simActivationStatusLabel } from "../../../services/simActivationService.js";
import {
  maskE164,
  realNumberConnectionStatusLabel,
  realNumberSalesStatusLabel,
} from "../../../services/realNumberInventoryService.js";
import { agentPlanStatusLabel } from "../../../services/clientAgentPlanService.js";
import { formatClp } from "../../../utils/clp-format.js";
import type { AdminClientNumberItem } from "../../../services/adminClientNumberService.js";
import type { AdminNumeracionesFilters } from "../../../services/adminClientNumberService.js";
import type { CompanyRow } from "../../../types/tenant.js";
import type { ClientNumberStatus, ClientNumberType } from "../../../types/client-numbers.js";
import {
  clientNumberStatusLabel,
  clientNumberTypeLabel,
} from "../../../services/clientNumberService.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import {
  renderAgentModuleStyles,
  renderQaLabBadge,
} from "../../shared/agent-module-styles.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderBtn,
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

export type AdminNumeracionesPageOpts = {
  admin: AdminSessionUser;
  flash?: string;
  error?: string;
};

export type AdminNumeracionesPageContext = {
  filters: AdminNumeracionesFilters;
  inventoryFilter: PublicInventoryFilterCategory;
  numbers: AdminClientNumberItem[];
  companies: CompanyRow[];
  prefillCompanyId?: string;
  showCreateForm?: boolean;
  simActivations: SimActivationRequestListItem[];
  simModulePending?: boolean;
  inventory: RealNumberInventoryRow[];
  inventoryDashboard: InventoryPublicDashboardRow[];
  publicStockSummary: PublicStockSummary | null;
  inventorySummary: RealNumberInventorySummary | null;
  inventoryModulePending?: boolean;
};

const INVENTORY_FILTER_OPTIONS: Array<{ value: PublicInventoryFilterCategory; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "public_sellable", label: "Listos para venta" },
  { value: "pending_connection", label: "Pendientes conexión" },
  { value: "held_by_checkout", label: "Retenidos por checkout" },
  { value: "sold", label: "Vendidos" },
  { value: "assigned", label: "Asignados" },
  { value: "qa_not_sellable", label: "QA / no vendibles" },
];

export function parseInventoryPublicFilter(
  query: Record<string, string | string[] | undefined>,
): PublicInventoryFilterCategory {
  const raw = pickQuery(query, "inventory_filter");
  return INVENTORY_FILTER_OPTIONS.some((o) => o.value === raw)
    ? (raw as PublicInventoryFilterCategory)
    : "all";
}

function pickQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = query[key];
  return typeof v === "string" ? v.trim() : "";
}

export function parseAdminNumeracionesFilters(
  query: Record<string, string | string[] | undefined>,
): AdminNumeracionesFilters {
  const status = pickQuery(query, "status") as ClientNumberStatus | "";
  const type = pickQuery(query, "type") as ClientNumberType | "";
  const allowedStatus = [
    "available",
    "reserved",
    "pending_activation",
    "active",
    "suspended",
    "cancelled",
  ];
  const allowedType = ["sim_real", "fixed_line", "virtual", "other"];
  return {
    status: allowedStatus.includes(status) ? status : "",
    type: allowedType.includes(type) ? type : "",
    company_id: pickQuery(query, "company_id") || undefined,
    q: pickQuery(query, "q") || undefined,
  };
}

function wrap(opts: AdminNumeracionesPageOpts, body: string): string {
  const alert = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : opts.flash
      ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>`
      : "";
  return wrapAdminPage({
    admin: opts.admin,
    title: "Numeraciones",
    activeNav: "numeraciones",
    body: alert + body,
  });
}

function renderCreateForm(
  companies: CompanyRow[],
  prefillCompanyId?: string,
): string {
  const companyOpts = companies
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${prefillCompanyId === c.id ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
    )
    .join("");

  return renderPanel(
    "Crear numeración",
    `<p class="field-hint" style="margin:0 0 1rem">Para pruebas use proveedor <strong>QA / Telvoice Lab</strong> — quedará marcada como numeración de laboratorio.</p>
    <form method="post" action="/admin/numeraciones" class="tv-admin-num-form">
      <label>Empresa<select name="company_id" class="tv-filter-input" required>${companyOpts}</select></label>
      <label>Número<input type="text" name="number" class="tv-filter-input" placeholder="+569..." required /></label>
      <label>País<input type="text" name="country_code" class="tv-filter-input" value="CL" maxlength="4" /></label>
      <label>Tipo<select name="type" class="tv-filter-input">
        <option value="sim_real">SIM real</option>
        <option value="fixed_line">Red fija</option>
        <option value="virtual">Virtual</option>
        <option value="other">Otro</option>
      </select></label>
      <label>Estado<select name="status" class="tv-filter-input">
        <option value="pending_activation">Pendiente de activación</option>
        <option value="active">Activo</option>
        <option value="reserved">Reservado</option>
        <option value="suspended">Suspendido</option>
      </select></label>
      <label>Proveedor<input type="text" name="provider" class="tv-filter-input" placeholder="QA / Telvoice Lab" /></label>
      <label>Gateway<input type="text" name="gateway_id" class="tv-filter-input" placeholder="qa-gateway" /></label>
      <label>SIM slot<input type="text" name="sim_slot" class="tv-filter-input" placeholder="lab-slot-1" /></label>
      <button type="submit" class="btn btn-primary">Crear numeración</button>
    </form>`,
  );
}

function renderCapabilities(caps: AdminClientNumberItem["capabilities"]): string {
  const items: string[] = [];
  if (caps.receive_sms) items.push("MO");
  if (caps.send_sms) items.push("MT");
  if (caps.otp_authorized) items.push("OTP");
  if (caps.api_webhook) items.push("API");
  return items.length ? items.join(" · ") : "—";
}

function renderTable(numbers: AdminClientNumberItem[]): string {
  if (!numbers.length) {
    return `<p class="field-hint">No hay numeraciones registradas.</p>`;
  }
  const rows = numbers
    .map((n) => {
      const statusCls =
        n.status === "active" ? "ok" : n.status === "pending_activation" ? "warn" : "muted";
      return `<tr${/qa|lab/i.test(n.provider ?? "") ? ' class="tv-row-qa"' : ""}>
        <td><strong>${escapeHtml(n.number)}</strong>${renderQaLabBadge(n.provider)}</td>
        <td>${escapeHtml(n.company_name)}</td>
        <td>${escapeHtml(clientNumberTypeLabel(n.type))}</td>
        <td>${escapeHtml(n.country_code ?? "CL")}</td>
        <td><span class="badge badge-${statusCls}">${escapeHtml(clientNumberStatusLabel(n.status))}</span></td>
        <td>${escapeHtml(n.provider ?? "—")}</td>
        <td>${escapeHtml(n.gateway_id ?? "—")}${n.sim_slot ? `<br><small>slot: ${escapeHtml(n.sim_slot)}</small>` : ""}</td>
        <td>${renderCapabilities(n.capabilities)}</td>
        <td>${n.activated_at ? formatDate(n.activated_at) : "—"}</td>
        <td>
          <form method="post" action="/admin/numeraciones/${escapeHtml(n.id)}/status" style="display:inline-flex;gap:0.35rem;align-items:center">
            <select name="status" class="tv-filter-input" style="min-width:9rem">
              ${["pending_activation", "active", "suspended", "cancelled", "reserved"]
                .map(
                  (s) =>
                    `<option value="${s}"${n.status === s ? " selected" : ""}>${escapeHtml(clientNumberStatusLabel(s as ClientNumberStatus))}</option>`,
                )
                .join("")}
            </select>
            <button type="submit" class="btn btn-ghost btn-sm">Cambiar estado</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  return `<div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
    <th>Número</th><th>Empresa</th><th>Tipo</th><th>País</th><th>Estado</th><th>Proveedor</th><th>Gateway / SIM</th><th>Capacidades</th><th>Activación</th><th>Acciones</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSimActivationsTable(items: SimActivationRequestListItem[]): string {
  if (!items.length) {
    return `<p class="field-hint">No hay activaciones SIM pendientes.</p>`;
  }

  const rows = items
    .map((a) => {
      const statusCls =
        a.activation_status === "paid_pending_activation" ? "warn" : "muted";
      const ref = a.public_checkout_reference ?? a.order_id.slice(0, 8).toUpperCase();
      return `<tr id="sim-activation-${escapeHtml(a.id)}">
        <td>${formatDate(a.created_at)}</td>
        <td>${escapeHtml(a.payer_name ?? "—")}<br><small>${escapeHtml(a.checkout_email)}</small></td>
        <td>${escapeHtml(a.company_display_name ?? a.company_name ?? "—")}</td>
        <td>${escapeHtml(a.plan_name)}</td>
        <td>${escapeHtml(a.agent_plan_name ?? "—")}<br><small>${escapeHtml(a.agent_plan_status ? agentPlanStatusLabel(a.agent_plan_status as "paid_pending_setup") : "—")}</small></td>
        <td>${escapeHtml(new Intl.NumberFormat("es-CL").format(a.included_sms_monthly))}</td>
        <td><span class="badge badge-${statusCls}">${escapeHtml(simActivationStatusLabel(a.activation_status))}</span></td>
        <td><code>${escapeHtml(ref)}</code></td>
        <td style="white-space:nowrap">
          <details>
            <summary class="btn btn-ghost btn-sm">Detalle</summary>
            <div style="margin-top:0.5rem;font-size:0.85rem">
              <div>Tel: ${escapeHtml(a.phone ?? "—")}</div>
              <div>RUT: ${escapeHtml(a.tax_id ?? "—")}</div>
              <div>Caso de uso: ${escapeHtml(a.agent_use_case ?? a.use_case ?? "—")}</div>
              <div>Monto: ${escapeHtml(a.order_amount != null ? formatClp(a.order_amount) : "—")}</div>
              ${a.admin_notes ? `<div>Notas: ${escapeHtml(a.admin_notes)}</div>` : ""}
            </div>
          </details>
          <form method="post" action="/admin/numeraciones/sim-activations/${escapeHtml(a.id)}/review" style="display:inline">
            <button type="submit" class="btn btn-ghost btn-sm">En revisión</button>
          </form>
          <form method="post" action="/admin/numeraciones/sim-activations/${escapeHtml(a.id)}/activate" style="display:inline">
            <button type="submit" class="btn btn-primary btn-sm">Activar</button>
          </form>
          <form method="post" action="/admin/numeraciones/sim-activations/${escapeHtml(a.id)}/resend-access" style="display:inline">
            <button type="submit" class="btn btn-ghost btn-sm">Reenviar acceso</button>
          </form>
          <form method="post" action="/admin/numeraciones/sim-activations/${escapeHtml(a.id)}/resend-active" style="display:inline">
            <button type="submit" class="btn btn-ghost btn-sm">Reenviar activo</button>
          </form>
          ${a.client_number_id ? `<a href="/admin/sms-inbox?number_id=${escapeHtml(a.client_number_id)}" class="btn btn-ghost btn-sm">Ver SMS entrantes</a>` : ""}
          <form method="post" action="/admin/numeraciones/sim-activations/${escapeHtml(a.id)}/notes" style="display:inline-flex;gap:0.25rem;margin-top:0.35rem">
            <input type="text" name="admin_notes" class="tv-filter-input" placeholder="Nota interna" value="${escapeHtml(a.admin_notes ?? "")}" />
            <button type="submit" class="btn btn-ghost btn-sm">Guardar nota</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  return `<div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
    <th>Fecha</th><th>Cliente</th><th>Empresa</th><th>Plan SIM</th><th>Agente</th><th>SMS</th><th>Estado SIM</th><th>Ref.</th><th>Acciones</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function eligibilityBadgeClass(code: string): string {
  if (code === "public_sellable") return "ok";
  if (
    code === "held_by_pending_order" ||
    code === "reserved" ||
    code === "sold_pending_activation"
  ) {
    return "warn";
  }
  return "muted";
}

function renderPublicStockSummary(summary: PublicStockSummary): string {
  const cards = [
    ["Stock público vendible", summary.publicSellable, "public_sellable"],
    ["Pendientes conexión", summary.pendingConnection, "pending_connection"],
    [
      "Retenidos por checkout vigente",
      summary.heldByCheckoutActive,
      "held_by_checkout",
    ],
    [
      "Reservas expiradas",
      summary.heldByCheckoutExpired,
      "held_by_checkout",
    ],
    [
      "Vendidos pendiente activación",
      summary.soldPendingActivation,
      "sold",
    ],
    ["Activos asignados", summary.activeAssigned, "assigned"],
    ["QA / no vendibles", summary.qaNotSellable, "qa_not_sellable"],
  ]
    .map(
      ([label, value, filter]) =>
        `<a href="/admin/numeraciones?inventory_filter=${escapeHtml(String(filter))}" class="tv-stat-card tv-stat-card--link${Number(value) > 0 ? " tv-stat-card--active" : ""}">
          <span class="tv-stat-label">${escapeHtml(String(label))}</span>
          <strong class="tv-stat-value">${escapeHtml(String(value))}</strong>
        </a>`,
    )
    .join("");

  return `<div class="tv-inventory-public-stock">
    <h4 class="tv-inventory-public-stock__title">Estado del stock público</h4>
    <div class="tv-stat-grid tv-stat-grid--public">${cards}</div>
  </div>`;
}

function renderInventoryFilterTabs(active: PublicInventoryFilterCategory): string {
  const tabs = INVENTORY_FILTER_OPTIONS.map(
    (opt) =>
      `<a href="/admin/numeraciones?inventory_filter=${escapeHtml(opt.value)}" class="tv-inv-filter-tab${active === opt.value ? " is-active" : ""}">${escapeHtml(opt.label)}</a>`,
  ).join("");
  return `<nav class="tv-inv-filter-tabs" aria-label="Filtros inventario">${tabs}</nav>`;
}

function renderInventoryLegacySummary(summary: RealNumberInventorySummary): string {
  return `<details class="tv-inventory-legacy-summary">
    <summary class="btn btn-ghost btn-sm">Ver contadores técnicos (sales_status)</summary>
    <div class="tv-stat-grid" style="margin-top:0.75rem">
      ${[
        ["Total inventario", summary.total],
        ["Disponibles conectados", summary.connected_available],
        ["Preconfigurados pendientes", summary.preconfigured_pending],
        ["Reservados", summary.reserved],
        ["Vendidos pendientes activación", summary.sold_pending_activation],
        ["Activos asignados", summary.active_assigned],
        ["No vendibles", summary.not_for_sale],
        ["Suspendidos", summary.suspended],
      ]
        .map(
          ([label, value]) =>
            `<div class="tv-stat-card"><span class="tv-stat-label">${escapeHtml(String(label))}</span><strong class="tv-stat-value">${escapeHtml(String(value))}</strong></div>`,
        )
        .join("")}
    </div>
  </details>`;
}

function renderInventoryAddForm(): string {
  return `<form method="post" action="/admin/numeraciones/inventory/add" class="tv-admin-num-form tv-inventory-add-form">
    <label>Número E.164<input type="text" name="e164_number" class="tv-filter-input" placeholder="+56000000001" required /></label>
    <label>Estado conexión<select name="connection_status" class="tv-filter-input">
      <option value="connected">Conectado</option>
      <option value="preconfigured_pending" selected>Preconfigurado pendiente</option>
    </select></label>
    <label>Estado comercial<select name="sales_status" class="tv-filter-input">
      <option value="connected_available">Disponible conectado</option>
      <option value="preconfigured_pending" selected>Preconfigurado pendiente</option>
      <option value="not_for_sale">No vendible</option>
    </select></label>
    <label>Provider (admin)<input type="text" name="provider" class="tv-filter-input" value="telsim" /></label>
    <label>Gateway ID<input type="text" name="gateway_id" class="tv-filter-input" placeholder="opcional" /></label>
    <label>SIM slot<input type="text" name="sim_slot" class="tv-filter-input" placeholder="opcional" /></label>
    <label>Webhook URL<input type="text" name="webhook_url" class="tv-filter-input" placeholder="opcional" /></label>
    <label>Webhook conectado<input type="checkbox" name="webhook_connected" value="1" /></label>
    <label class="tv-field-full">Notas internas<textarea name="internal_notes" class="tv-filter-input" rows="2" placeholder="Solo admin Telvoice"></textarea></label>
    <button type="submit" class="btn btn-primary">Agregar al inventario</button>
  </form>`;
}

function lookupCompanyName(
  companies: CompanyRow[],
  companyId: string | null,
): string {
  if (!companyId) return "—";
  const match = companies.find((c) => c.id === companyId);
  return match ? match.name : companyId.slice(0, 8) + "…";
}

function renderInventoryTable(
  items: InventoryPublicDashboardRow[],
  companies: CompanyRow[],
  simActivations: SimActivationRequestListItem[],
  inventoryFilter: PublicInventoryFilterCategory,
): string {
  if (!items.length) {
    const filterLabel =
      INVENTORY_FILTER_OPTIONS.find((o) => o.value === inventoryFilter)?.label ??
      "este filtro";
    return `<p class="field-hint">Sin registros para ${escapeHtml(filterLabel)}.</p>`;
  }

  const companyOpts = companies
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`,
    )
    .join("");

  const activationOpts = simActivations
    .map(
      (a) =>
        `<option value="${escapeHtml(a.id)}">${escapeHtml(a.payer_name ?? a.checkout_email)} · ${escapeHtml(a.plan_name)}</option>`,
    )
    .join("");

  const bulkCandidates = items.filter(
    (item) => item.eligibility.canBulkMarkConnected,
  ).length;

  const rows = items
    .map(({ row: n, eligibility: e }) => {
      const salesCls =
        n.sales_status === "connected_available"
          ? "ok"
          : n.sales_status === "reserved_pending_payment"
            ? "warn"
            : "muted";
      const eligCls = eligibilityBadgeClass(e.code);
      const orderRef = n.current_order_id
        ? n.current_order_id.slice(0, 8).toUpperCase()
        : e.heldOrder?.orderCode ?? "—";
      const linkedActivation = n.current_agent_request_id
        ? simActivations.find((a) => a.id === n.current_agent_request_id)
        : null;

      const heldDetail = e.heldOrder
        ? `<div class="tv-inv-held-detail">
            <span class="badge ${e.heldOrder.reservationExpired ? "badge-muted" : "badge-warn"}">${e.heldOrder.reservationExpired ? "Expirada" : "Retenido por checkout pendiente"}</span>
            <div><a href="/admin/orders/${escapeHtml(e.heldOrder.orderId)}"><code>${escapeHtml(e.heldOrder.orderCode)}</code></a></div>
            ${e.heldOrder.email ? `<div><small>${escapeHtml(e.heldOrder.email)}</small></div>` : ""}
            ${e.heldOrder.planId ? `<div><small>Plan: ${escapeHtml(e.heldOrder.planId)}</small></div>` : ""}
            <div><small>Hace ${escapeHtml(e.heldOrder.ageHours.toFixed(1))} h</small></div>
            ${
              e.heldOrder.reservationExpired
                ? `<div><span class="badge badge-muted">Expirada</span></div>`
                : e.heldOrder.remainingMinutes != null
                  ? `<div><span class="badge badge-warn">Expira en ${escapeHtml(String(e.heldOrder.remainingMinutes))} min</span></div>`
                  : ""
            }
          </div>`
        : "";

      const actions: string[] = [];

      if (e.canMarkConnected) {
        actions.push(`<form method="post" action="/admin/numeraciones/inventory/${escapeHtml(n.id)}/mark-connected" style="display:inline">
            <button type="submit" class="btn btn-primary btn-sm">Marcar conectado</button>
          </form>`);
      }

      if (e.canReleaseExpiredHold) {
        actions.push(`<form method="post" action="/admin/numeraciones/inventory/${escapeHtml(n.id)}/release-expired-hold" style="display:inline" onsubmit="return confirm('¿Liberar retención expirada (mín. 30 min)? Solo superadmin. No cancela la orden ni acredita SMS. Para venta real, preferir órdenes antiguas evidentes (ej. QA &gt;36 h).');">
            <input type="hidden" name="confirm" value="1" />
            <button type="submit" class="btn btn-ghost btn-sm">Liberar reserva expirada</button>
          </form>`);
      }

      if (e.heldOrder) {
        actions.push(
          `<a href="/admin/orders/${escapeHtml(e.heldOrder.orderId)}" class="btn btn-ghost btn-sm">Ver orden</a>`,
        );
      }

      if (e.canMarkNotForSale) {
        actions.push(`<form method="post" action="/admin/numeraciones/inventory/${escapeHtml(n.id)}/not-for-sale" style="display:inline" onsubmit="return confirm('¿Marcar como no vendible?');">
            <button type="submit" class="btn btn-ghost btn-sm">No vendible</button>
          </form>`);
      }

      if (n.sales_status === "reserved_pending_payment" && !e.canReleaseExpiredHold) {
        actions.push(
          `<span class="field-hint">Reserva activa</span>`,
        );
      }

      if (e.canAssign) {
        actions.push(`<details class="tv-inventory-assign">
            <summary class="btn btn-ghost btn-sm">Asignar</summary>
            <form method="post" action="/admin/numeraciones/inventory/${escapeHtml(n.id)}/assign" class="tv-inventory-assign-form">
              <label>Empresa<select name="company_id" class="tv-filter-input" required>${companyOpts}</select></label>
              <label>Plan<select name="plan_code" class="tv-filter-input">
                <option value="sim_starter">Starter</option>
                <option value="sim_pro">Pro</option>
                <option value="custom">A medida / manual</option>
              </select></label>
              ${
                activationOpts
                  ? `<label>Solicitud activación (opcional)<select name="sim_activation_request_id" class="tv-filter-input"><option value="">—</option>${activationOpts}</select></label>`
                  : ""
              }
              <button type="submit" class="btn btn-primary btn-sm">Confirmar asignación</button>
            </form>
          </details>`);
      }

      if (linkedActivation) {
        actions.push(
          `<a class="btn btn-ghost btn-sm" href="#sim-activation-${escapeHtml(linkedActivation.id)}">Ver activación</a>`,
        );
      }

      if (e.code === "active_assigned" && n.current_company_id) {
        actions.push(
          `<span class="field-hint">Cliente: ${escapeHtml(lookupCompanyName(companies, n.current_company_id))}</span>`,
        );
      }

      if (e.code === "sold_pending_activation" && n.current_order_id) {
        actions.push(
          `<a href="/admin/orders/${escapeHtml(n.current_order_id)}" class="btn btn-ghost btn-sm">Ver orden</a>`,
        );
      }

      const checkbox = e.canBulkMarkConnected
        ? `<input type="checkbox" name="inventory_ids" value="${escapeHtml(n.id)}" form="tv-inv-bulk-form" class="tv-inv-bulk-check" />`
        : "";

      return `<tr class="tv-inv-row tv-inv-row--${escapeHtml(e.code)}">
        <td>${checkbox}</td>
        <td><strong title="ID ${escapeHtml(n.id)}">${escapeHtml(maskE164(n.e164_number))}</strong></td>
        <td><span class="badge badge-${eligCls}">${escapeHtml(e.label)}</span></td>
        <td><small>${escapeHtml(e.reason)}</small>${heldDetail}</td>
        <td><span class="badge badge-${salesCls}">${escapeHtml(realNumberSalesStatusLabel(n.sales_status))}</span></td>
        <td>${escapeHtml(realNumberConnectionStatusLabel(n.connection_status))}${n.webhook_connected ? " · webhook" : ""}</td>
        <td>${escapeHtml(lookupCompanyName(companies, n.current_company_id))}</td>
        <td><code>${escapeHtml(orderRef)}</code></td>
        <td>${n.reserved_until ? formatDate(n.reserved_until) : "—"}</td>
        <td style="white-space:nowrap">${actions.join(" ")}</td>
      </tr>`;
    })
    .join("");

  const bulkBar =
    bulkCandidates > 0
      ? `<form id="tv-inv-bulk-form" method="post" action="/admin/numeraciones/inventory/bulk-mark-connected" class="tv-inv-bulk-bar" onsubmit="return confirm('Vas a marcar las numeraciones seleccionadas como conectadas y disponibles para venta pública. Esta acción no asigna clientes ni activa líneas. ¿Continuar?');">
          <input type="hidden" name="confirm" value="1" />
          <span class="field-hint">${bulkCandidates} candidato(s) para marcar conectado</span>
          <button type="submit" class="btn btn-primary btn-sm">Marcar seleccionados como conectados</button>
        </form>`
      : "";

  return `${bulkBar}
    <div class="table-wrap tv-panel"><table class="tv-table tv-inventory-table"><thead><tr>
    <th style="width:2rem"></th>
    <th>Número</th><th>Elegibilidad pública</th><th>Motivo</th><th>Estado comercial</th><th>Conexión</th><th>Empresa</th><th>Orden</th><th>Reservado hasta</th><th>Acciones</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderInventorySection(ctx: AdminNumeracionesPageContext): string {
  if (ctx.inventoryModulePending) {
    return `<p class="field-hint">Requiere migración 057 (real_number_inventory) en Supabase.</p>`;
  }

  const filteredRows =
    ctx.inventoryFilter === "all"
      ? ctx.inventoryDashboard
      : ctx.inventoryDashboard.filter(
          (item) => item.eligibility.filterCategory === ctx.inventoryFilter,
        );

  return `
    <div class="tv-inventory-header">
      <h3 class="tv-inventory-title">Inventario de números SIM reales</h3>
      <p class="field-hint tv-inventory-subtitle">Operación de stock para checkout público en <a href="/numeracion-sim.html" target="_blank" rel="noopener">numeracion-sim.html</a>. Los contadores usan la misma lógica que <code>/api/public/sim-available-numbers</code>.</p>
    </div>
    ${ctx.publicStockSummary ? renderPublicStockSummary(ctx.publicStockSummary) : ""}
    ${renderInventoryFilterTabs(ctx.inventoryFilter)}
    ${ctx.inventorySummary ? renderInventoryLegacySummary(ctx.inventorySummary) : ""}
    <form method="post" action="/admin/numeraciones/inventory/release-expired" style="margin:0.75rem 0" onsubmit="return confirm('¿Liberar todas las reservas expiradas (&gt;30 min)? No cancela órdenes ni pagos en MercadoPago.');">
      <button type="submit" class="btn btn-ghost btn-sm">Liberar expiradas</button>
    </form>
    ${renderPanel("Agregar número al inventario", renderInventoryAddForm())}
    ${renderInventoryTable(filteredRows, ctx.companies, ctx.simActivations, ctx.inventoryFilter)}`;
}

export function renderAdminNumeracionesPage(
  opts: AdminNumeracionesPageOpts,
  ctx: AdminNumeracionesPageContext,
): string {
  const statusOpts = [
    ["", "Todos"],
    ["pending_activation", "Pendiente"],
    ["active", "Activo"],
    ["suspended", "Suspendido"],
    ["cancelled", "Cancelado"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}"${ctx.filters.status === v ? " selected" : ""}>${l}</option>`,
    )
    .join("");

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Numeraciones Telvoice",
      subtitle: "Crear, asignar y gestionar líneas SMS de clientes.",
      actions: `
        ${renderBtn("Planes agente", { href: "/admin/agent-plans", variant: "secondary", size: "sm" })}
        ${renderBtn("SMS entrantes", { href: "/admin/sms-inbox", variant: "ghost", size: "sm" })}
      `,
    })}
    ${renderPanel(
      "Filtros",
      `<form method="get" action="/admin/numeraciones">
        ${renderFilterBar(`
          ${renderFilterField("Buscar", `<input name="q" class="tv-filter-input" value="${escapeHtml(ctx.filters.q ?? "")}" />`)}
          ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
          <button type="submit" class="btn btn-primary btn-sm">Filtrar</button>
        `)}
      </form>`,
    )}
    ${renderPanel("Inventario SIM", renderInventorySection(ctx))}
    ${renderPanel(
      "Activaciones SIM pendientes",
      ctx.simModulePending
        ? `<p class="field-hint">Requiere migración 055 (sim_activation_requests) en Supabase.</p>`
        : renderSimActivationsTable(ctx.simActivations),
    )}
    ${ctx.showCreateForm !== false ? renderCreateForm(ctx.companies, ctx.prefillCompanyId) : ""}
    ${renderPanel("Numeraciones registradas", renderTable(ctx.numbers))}
    <style>
      .tv-row-qa { background: rgba(245,158,11,0.04); }
      .tv-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.75rem; }
      .tv-stat-grid--public { grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
      .tv-stat-card { border: 1px solid rgba(0,0,0,0.08); border-radius: 0.75rem; padding: 0.75rem; }
      .tv-stat-card--link { text-decoration: none; color: inherit; display: block; transition: border-color 0.15s, box-shadow 0.15s; }
      .tv-stat-card--link:hover { border-color: rgba(0,82,204,0.35); box-shadow: 0 0 0 1px rgba(0,82,204,0.08); }
      .tv-stat-card--active { border-color: rgba(0,82,204,0.45); background: rgba(0,82,204,0.03); }
      .tv-stat-label { display: block; font-size: 0.75rem; color: #64748b; }
      .tv-stat-value { font-size: 1.25rem; }
      .tv-inventory-public-stock { margin-bottom: 1rem; }
      .tv-inventory-public-stock__title { margin: 0 0 0.5rem; font-size: 0.95rem; font-weight: 600; }
      .tv-inv-filter-tabs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.75rem 0 1rem; }
      .tv-inv-filter-tab { font-size: 0.8rem; padding: 0.35rem 0.65rem; border-radius: 999px; border: 1px solid rgba(0,0,0,0.1); text-decoration: none; color: inherit; }
      .tv-inv-filter-tab.is-active { background: #0052cc; color: #fff; border-color: #0052cc; }
      .tv-inv-held-detail { margin-top: 0.35rem; font-size: 0.8rem; }
      .tv-inv-bulk-bar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; padding: 0.65rem 0.75rem; border: 1px dashed rgba(0,0,0,0.12); border-radius: 0.75rem; }
      .tv-inv-row--public_sellable { background: rgba(34,197,94,0.04); }
      .tv-inv-row--held_by_pending_order { background: rgba(245,158,11,0.04); }
      .tv-inventory-legacy-summary { margin: 0.5rem 0 0.75rem; }
      .tv-inventory-title { margin: 0 0 0.35rem; font-size: 1.15rem; }
      .tv-inventory-subtitle { margin: 0 0 1rem; }
      .tv-inventory-add-form { margin-top: 0.5rem; }
      .tv-inventory-assign { display: inline-block; margin-top: 0.35rem; }
      .tv-inventory-assign-form {
        margin-top: 0.5rem;
        padding: 0.75rem;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 0.75rem;
        display: grid;
        gap: 0.5rem;
        min-width: 14rem;
      }
      .tv-field-full { grid-column: 1 / -1; }
    </style>
    ${renderAgentModuleStyles()}`;

  return wrap(opts, body);
}
