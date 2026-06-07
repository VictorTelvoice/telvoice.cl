import type { AdminSessionUser } from "../../../types/admin.js";
import type {
  AdminAgentPlanRequestItem,
  AdminAgentPlanSubscriptionItem,
} from "../../../services/adminAgentPlanService.js";
import type { AdminAgentPlanFilters } from "../../../services/adminAgentPlanService.js";
import type { AdminAgentPlanModuleState } from "../../../services/adminAgentPlanService.js";
import type { AdminClientNumberItem } from "../../../services/adminClientNumberService.js";
import type { AgentPlanRequestStatus, AgentPlanCode } from "../../../types/client-numbers.js";
import { agentPlanDisplayName } from "../../../utils/agent-plan-intent.js";
import {
  agentPlanRequestStatusMessage,
  agentPlanStatusLabel,
  preferredNumberTypeLabel,
} from "../../../services/clientAgentPlanService.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { renderAgentModuleStyles } from "../../shared/agent-module-styles.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderBtn,
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

export type AdminAgentPlansPageOpts = {
  admin: AdminSessionUser;
  flash?: string;
  error?: string;
};

export type AdminAgentPlansPageContext = {
  module: AdminAgentPlanModuleState;
  filters: AdminAgentPlanFilters;
  requests: AdminAgentPlanRequestItem[];
  subscriptions: AdminAgentPlanSubscriptionItem[];
  selectedRequest: AdminAgentPlanRequestItem | null;
  companyNumbers: AdminClientNumberItem[];
};

function pickQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = query[key];
  return typeof v === "string" ? v.trim() : "";
}

export function parseAdminAgentPlanFilters(
  query: Record<string, string | string[] | undefined>,
): AdminAgentPlanFilters {
  const status = pickQuery(query, "status") as AgentPlanRequestStatus | "";
  const plan = pickQuery(query, "plan") as AgentPlanCode | "";
  const allowedStatus = [
    "pending",
    "reviewing",
    "approved",
    "rejected",
    "activated",
  ];
  const allowedPlan = ["start", "pro", "business"];
  return {
    status: allowedStatus.includes(status) ? status : "",
    plan_code: allowedPlan.includes(plan) ? plan : "",
    company_id: pickQuery(query, "company_id") || undefined,
    q: pickQuery(query, "q") || undefined,
  };
}

function statusBadge(status: string): string {
  const cls =
    status === "active" || status === "activated" || status === "approved"
      ? "ok"
      : status === "rejected"
        ? "err"
        : status === "pending"
          ? "warn"
          : status === "reviewing"
            ? "warn"
            : "muted";
  return `<span class="badge badge-${cls}">${escapeHtml(agentPlanStatusLabel(status as never))}</span>`;
}

function wrap(opts: AdminAgentPlansPageOpts, body: string): string {
  const alert = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : opts.flash
      ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>`
      : "";
  return wrapAdminPage({
    admin: opts.admin,
    title: "Planes Agente",
    activeNav: "agent-plans",
    body: alert + body,
  });
}

function renderFilters(filters: AdminAgentPlanFilters): string {
  const statusOpts = [
    ["", "Todos"],
    ["pending", "Pendiente"],
    ["reviewing", "En revisión"],
    ["approved", "Aprobado"],
    ["activated", "Activado"],
    ["rejected", "Rechazado"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}"${filters.status === v ? " selected" : ""}>${l}</option>`,
    )
    .join("");
  const planOpts = [
    ["", "Todos"],
    ["start", "Start"],
    ["pro", "Pro"],
    ["business", "Business"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}"${filters.plan_code === v ? " selected" : ""}>${l}</option>`,
    )
    .join("");

  return renderPanel(
    "Filtros",
    `<form method="get" action="/admin/agent-plans" class="tv-filters-form">
      ${renderFilterBar(`
        ${renderFilterField("Buscar empresa", `<input type="search" name="q" class="tv-filter-input" value="${escapeHtml(filters.q ?? "")}" placeholder="Empresa, plan, ID…" />`)}
        ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
        ${renderFilterField("Plan", `<select name="plan" class="tv-filter-input">${planOpts}</select>`)}
        <div class="tv-filter-field tv-filter-field--actions" style="align-self:end">
          <button type="submit" class="btn btn-primary btn-sm">Filtrar</button>
          <a href="/admin/agent-plans" class="btn btn-ghost btn-sm">Limpiar</a>
        </div>
      `)}
    </form>`,
  );
}

function renderRequestsTable(requests: AdminAgentPlanRequestItem[]): string {
  if (!requests.length) {
    return `<p class="field-hint">No hay solicitudes con los filtros aplicados.</p>`;
  }
  const rows = requests
    .map(
      (r) => `<tr>
        <td>${formatDate(r.created_at)}</td>
        <td><a href="/admin/agent-plans?request=${encodeURIComponent(r.id)}"><strong>${escapeHtml(r.company_name)}</strong></a></td>
        <td>${escapeHtml(agentPlanDisplayName(r.plan_code))}</td>
        <td>${escapeHtml(preferredNumberTypeLabel(r.preferred_number_type))}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="tv-table-actions">
          <a href="/admin/agent-plans?request=${encodeURIComponent(r.id)}" class="btn btn-ghost btn-sm">Ver detalle</a>
        </td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
    <th>Fecha</th><th>Empresa</th><th>Plan</th><th>Numeración preferida</th><th>Estado</th><th>Acciones</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSubscriptionsTable(subs: AdminAgentPlanSubscriptionItem[]): string {
  if (!subs.length) return `<p class="field-hint">Sin suscripciones registradas.</p>`;
  const rows = subs
    .map(
      (s) => `<tr>
        <td>${escapeHtml(s.company_name)}</td>
        <td>${escapeHtml(agentPlanDisplayName(s.plan_code))}</td>
        <td>${statusBadge(s.status)}</td>
        <td>${escapeHtml(s.number_label ?? "Sin asignar")}</td>
        <td>${s.renews_at ? formatDate(s.renews_at) : "—"}</td>
      </tr>`,
    )
    .join("");
  return `<table class="tv-table"><thead><tr>
    <th>Empresa</th><th>Plan</th><th>Estado</th><th>Línea</th><th>Renovación</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderRequestDetail(
  req: AdminAgentPlanRequestItem,
  numbers: AdminClientNumberItem[],
  subscriptions: AdminAgentPlanSubscriptionItem[],
): string {
  const linkedSub = subscriptions.find(
    (s) => s.company_id === req.company_id && s.plan_code === req.plan_code && s.status === "active",
  );
  const linkedNumber = numbers.find((n) => n.id === linkedSub?.included_number_id);

  const numberOpts = [
    `<option value="">Sin línea asociada</option>`,
    ...numbers.map(
      (n) =>
        `<option value="${escapeHtml(n.id)}">${escapeHtml(n.number)} (${escapeHtml(n.status)})</option>`,
    ),
  ].join("");

  let actions = "";
  if (req.status === "pending") {
    actions = `
      <form method="post" action="/admin/agent-plans/requests/${escapeHtml(req.id)}/reviewing">
        <button type="submit" class="btn btn-secondary btn-sm">Marcar en revisión</button>
      </form>
      <form method="post" action="/admin/agent-plans/requests/${escapeHtml(req.id)}/approve">
        <button type="submit" class="btn btn-primary btn-sm">Aprobar</button>
      </form>
      <form method="post" action="/admin/agent-plans/requests/${escapeHtml(req.id)}/reject">
        <button type="submit" class="btn btn-ghost btn-sm">Rechazar</button>
      </form>`;
  } else if (req.status === "reviewing") {
    actions = `
      <form method="post" action="/admin/agent-plans/requests/${escapeHtml(req.id)}/approve">
        <button type="submit" class="btn btn-primary btn-sm">Aprobar</button>
      </form>
      <form method="post" action="/admin/agent-plans/requests/${escapeHtml(req.id)}/reject">
        <button type="submit" class="btn btn-ghost btn-sm">Rechazar</button>
      </form>`;
  } else if (req.status === "approved") {
    actions = `
      <form method="post" action="/admin/agent-plans/requests/${escapeHtml(req.id)}/activate" class="tv-admin-activate-form">
        <label>Línea Telvoice (opcional)
          <select name="included_number_id" class="tv-filter-input">${numberOpts}</select>
        </label>
        <button type="submit" class="btn btn-primary btn-sm">Activar plan manualmente</button>
      </form>
      <p class="field-hint">La activación crea la suscripción. No asigna línea automáticamente si no se selecciona.</p>`;
  } else if (req.status === "activated") {
    actions = `<p class="field-hint">Solicitud activada. No hay acciones pendientes en esta solicitud.</p>`;
  } else if (req.status === "rejected") {
    actions = `<p class="field-hint">Solicitud rechazada.</p>`;
  }

  const secondaryActions = req.status !== "activated" && req.status !== "rejected"
    ? renderBtn("Crear numeración", {
        href: `/admin/numeraciones?company_id=${encodeURIComponent(req.company_id)}`,
        size: "sm",
        variant: "ghost",
        icon: "add_call",
      })
    : linkedNumber
      ? renderBtn("Ver numeración", {
          href: `/admin/numeraciones?company_id=${encodeURIComponent(req.company_id)}&q=${encodeURIComponent(linkedNumber.number)}`,
          size: "sm",
          variant: "ghost",
          icon: "sim_card",
        })
      : "";

  return renderPanel(
    `Detalle — ${escapeHtml(req.company_name)}`,
    `<dl class="tv-dl-grid">
      <dt>ID solicitud</dt><dd><code>${escapeHtml(req.id)}</code></dd>
      <dt>Plan solicitado</dt><dd>${escapeHtml(agentPlanDisplayName(req.plan_code))}</dd>
      <dt>Estado</dt><dd>${statusBadge(req.status)}</dd>
      <dt>Numeración preferida</dt><dd>${escapeHtml(preferredNumberTypeLabel(req.preferred_number_type))}</dd>
      <dt>Fecha solicitud</dt><dd>${formatDate(req.created_at)}</dd>
      <dt>Línea asociada</dt><dd>${escapeHtml(linkedNumber?.number ?? linkedSub?.number_label ?? "Sin asignar")}</dd>
      <dt>Suscripción</dt><dd>${linkedSub ? `${escapeHtml(agentPlanDisplayName(linkedSub.plan_code))} · ${statusBadge(linkedSub.status)}` : "—"}</dd>
      <dt>Mensaje</dt><dd>${escapeHtml(agentPlanRequestStatusMessage(req.status))}</dd>
    </dl>
    <div class="tv-admin-detail-actions">
      ${actions}
      ${secondaryActions}
    </div>`,
  );
}

export function renderAdminAgentPlansPage(
  opts: AdminAgentPlansPageOpts,
  ctx: AdminAgentPlansPageContext,
): string {
  if (!ctx.module.available) {
    return wrap(
      opts,
      `${renderSuperadminBanner()}<div class="alert alert-warn">Migración 054 pendiente. Aplica las tablas de planes agente.</div>`,
    );
  }

  const detail = ctx.selectedRequest
    ? renderRequestDetail(ctx.selectedRequest, ctx.companyNumbers, ctx.subscriptions)
    : "";

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Planes Agente",
      subtitle: "Gestiona solicitudes, aprueba planes y activa suscripciones manualmente.",
      actions: `
        ${renderBtn("Numeraciones", { href: "/admin/numeraciones", variant: "secondary", size: "sm", icon: "sim_card" })}
        ${renderBtn("SMS entrantes", { href: "/admin/sms-inbox", variant: "ghost", size: "sm", icon: "sms" })}
      `,
    })}
    ${renderFilters(ctx.filters)}
    ${detail}
    ${renderPanel("Solicitudes", renderRequestsTable(ctx.requests))}
    ${renderPanel("Suscripciones activas", renderSubscriptionsTable(ctx.subscriptions))}
    ${renderAgentModuleStyles()}`;

  return wrap(opts, body);
}
