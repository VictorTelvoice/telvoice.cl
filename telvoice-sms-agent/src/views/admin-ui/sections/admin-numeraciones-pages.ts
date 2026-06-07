import type { AdminSessionUser } from "../../../types/admin.js";
import type { SimActivationRequestListItem } from "../../../types/sim-activation.js";
import { simActivationStatusLabel } from "../../../services/simActivationService.js";
import { formatClp } from "../../../utils/clp-format.js";
import type {
  AdminClientNumberItem,
  AdminNumeracionesFilters,
} from "../../../services/adminClientNumberService.js";
import type { CompanyRow } from "../../../types/tenant.js";
import type { ClientNumberStatus, ClientNumberType } from "../../../types/client-numbers.js";
import {
  clientNumberStatusLabel,
  clientNumberTypeLabel,
} from "../../../services/clientNumberService.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
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
  numbers: AdminClientNumberItem[];
  companies: CompanyRow[];
  prefillCompanyId?: string;
  showCreateForm?: boolean;
  simActivations: SimActivationRequestListItem[];
  simModulePending?: boolean;
};

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
    `<form method="post" action="/admin/numeraciones" class="tv-admin-num-form">
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
      <label>Proveedor<input type="text" name="provider" class="tv-filter-input" /></label>
      <label>SIM slot<input type="text" name="sim_slot" class="tv-filter-input" /></label>
      <label>Gateway ID<input type="text" name="gateway_id" class="tv-filter-input" /></label>
      <button type="submit" class="btn btn-primary">Crear numeración</button>
    </form>`,
  );
}

function renderTable(numbers: AdminClientNumberItem[]): string {
  if (!numbers.length) {
    return `<p class="field-hint">No hay numeraciones registradas.</p>`;
  }
  const rows = numbers
    .map((n) => {
      const statusCls =
        n.status === "active" ? "ok" : n.status === "pending_activation" ? "warn" : "muted";
      return `<tr>
        <td><strong>${escapeHtml(n.number)}</strong></td>
        <td>${escapeHtml(n.company_name)}</td>
        <td>${escapeHtml(clientNumberTypeLabel(n.type))}</td>
        <td>${escapeHtml(n.country_code ?? "CL")}</td>
        <td><span class="badge badge-${statusCls}">${escapeHtml(clientNumberStatusLabel(n.status))}</span></td>
        <td>${escapeHtml(n.provider ?? "—")}</td>
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
            <button type="submit" class="btn btn-ghost btn-sm">Actualizar</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  return `<div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
    <th>Número</th><th>Empresa</th><th>Tipo</th><th>País</th><th>Estado</th><th>Proveedor</th><th>Activación</th><th>Acciones</th>
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
      return `<tr>
        <td>${formatDate(a.created_at)}</td>
        <td>${escapeHtml(a.payer_name ?? "—")}<br><small>${escapeHtml(a.checkout_email)}</small></td>
        <td>${escapeHtml(a.company_display_name ?? a.company_name ?? "—")}</td>
        <td>${escapeHtml(a.plan_name)}</td>
        <td>${escapeHtml(new Intl.NumberFormat("es-CL").format(a.included_sms_monthly))}</td>
        <td><span class="badge badge-${statusCls}">${escapeHtml(simActivationStatusLabel(a.activation_status))}</span></td>
        <td><code>${escapeHtml(ref)}</code></td>
        <td style="white-space:nowrap">
          <details>
            <summary class="btn btn-ghost btn-sm">Detalle</summary>
            <div style="margin-top:0.5rem;font-size:0.85rem">
              <div>Tel: ${escapeHtml(a.phone ?? "—")}</div>
              <div>RUT: ${escapeHtml(a.tax_id ?? "—")}</div>
              <div>Monto: ${escapeHtml(a.order_amount != null ? formatClp(a.order_amount) : "—")}</div>
              ${a.admin_notes ? `<div>Notas: ${escapeHtml(a.admin_notes)}</div>` : ""}
            </div>
          </details>
          <form method="post" action="/admin/numeraciones/sim-activations/${escapeHtml(a.id)}/review" style="display:inline">
            <button type="submit" class="btn btn-ghost btn-sm">En revisión</button>
          </form>
          <form method="post" action="/admin/numeraciones/sim-activations/${escapeHtml(a.id)}/notes" style="display:inline-flex;gap:0.25rem;margin-top:0.35rem">
            <input type="text" name="admin_notes" class="tv-filter-input" placeholder="Nota interna" value="${escapeHtml(a.admin_notes ?? "")}" />
            <button type="submit" class="btn btn-ghost btn-sm">Guardar nota</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  return `<div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
    <th>Fecha</th><th>Cliente</th><th>Empresa</th><th>Plan</th><th>SMS</th><th>Estado</th><th>Ref.</th><th>Acciones</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
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
    ${renderPanel(
      "Activaciones SIM pendientes",
      ctx.simModulePending
        ? `<p class="field-hint">Requiere migración 055 (sim_activation_requests) en Supabase.</p>`
        : renderSimActivationsTable(ctx.simActivations),
    )}
    ${ctx.showCreateForm !== false ? renderCreateForm(ctx.companies, ctx.prefillCompanyId) : ""}
    ${renderTable(ctx.numbers)}
    <style>
      .tv-admin-num-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:0.75rem; align-items:end; }
      .tv-admin-num-form label { display:flex; flex-direction:column; gap:0.25rem; font-size:0.85rem; }
    </style>`;

  return wrap(opts, body);
}
