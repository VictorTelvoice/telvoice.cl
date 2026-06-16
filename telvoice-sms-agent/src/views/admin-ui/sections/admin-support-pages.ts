import type { AdminSessionUser } from "../../../types/admin.js";
import type {
  AdminSupportTicketFilters,
  AdminSupportTicketListItem,
  AdminSupportTicketStats,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketsModuleState,
} from "../../../types/support-tickets.js";
import { SUPPORT_CATEGORIES } from "../../../types/support-tickets.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { resolveSupportReplyDisplayName } from "../../../utils/supportDisplayName.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderAdminUiScript,
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";
import {
  auditActionLabel,
  formatAuditChange,
  getSupportTicketAuditLog,
} from "../../../services/supportTicketAudit.js";

export type AdminSupportPageOpts = {
  admin: AdminSessionUser;
  smsBalance?: string;
  flash?: string;
  error?: string;
};

export type AdminSupportPageContext = {
  module: SupportTicketsModuleState;
  filters: AdminSupportTicketFilters;
  tickets: AdminSupportTicketListItem[];
  stats: AdminSupportTicketStats;
  selectedTicket: AdminSupportTicketListItem | null;
  loadError?: string;
  preserveQuery: AdminSupportTicketFilters;
};

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Abierto",
  in_review: "En revisión",
  waiting: "Esperando respuesta",
  resolved: "Resuelto",
};

const PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

function pickQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = query[key];
  return typeof v === "string" ? v.trim() : "";
}

export function parseAdminSupportFilters(
  query: Record<string, string | string[] | undefined>,
): AdminSupportTicketFilters {
  const statusRaw = pickQuery(query, "status");
  const priorityRaw = pickQuery(query, "priority");
  const categoryRaw = pickQuery(query, "category");
  const dateRaw = pickQuery(query, "date_range");

  const statuses: (SupportTicketStatus | "all")[] = [
    "all",
    "open",
    "in_review",
    "waiting",
    "resolved",
  ];
  const priorities: (SupportTicketPriority | "all")[] = [
    "all",
    "low",
    "medium",
    "high",
    "urgent",
  ];
  const dateRanges = ["all", "today", "7d", "30d"] as const;

  return {
    search: pickQuery(query, "q") || undefined,
    status: statuses.includes(statusRaw as SupportTicketStatus | "all")
      ? (statusRaw as SupportTicketStatus | "all")
      : "all",
    priority: priorities.includes(priorityRaw as SupportTicketPriority | "all")
      ? (priorityRaw as SupportTicketPriority | "all")
      : "all",
    category: SUPPORT_CATEGORIES.includes(categoryRaw as SupportTicketCategory)
      ? (categoryRaw as SupportTicketCategory)
      : categoryRaw === "all" || !categoryRaw
        ? "all"
        : "all",
    dateRange: dateRanges.includes(dateRaw as (typeof dateRanges)[number])
      ? (dateRaw as AdminSupportTicketFilters["dateRange"])
      : "all",
  };
}

function shortId(id: string): string {
  return id.replaceAll("-", "").slice(0, 8).toUpperCase();
}

function statusBadge(status: SupportTicketStatus): string {
  const cls: Record<SupportTicketStatus, string> = {
    open: "warn",
    in_review: "muted",
    waiting: "warn",
    resolved: "ok",
  };
  return `<span class="badge badge-${cls[status]}">${escapeHtml(STATUS_LABELS[status])}</span>`;
}

function priorityBadge(priority: SupportTicketPriority): string {
  const cls: Record<SupportTicketPriority, string> = {
    low: "muted",
    medium: "muted",
    high: "warn",
    urgent: "err",
  };
  return `<span class="badge badge-${cls[priority]}">${escapeHtml(PRIORITY_LABELS[priority])}</span>`;
}

function isPriorityCase(t: AdminSupportTicketListItem): boolean {
  return t.category === "SMPP / Alto volumen" || t.priority === "urgent";
}

function wrap(opts: AdminSupportPageOpts, title: string, body: string): string {
  const alert = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : opts.flash
      ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>`
      : "";
  return wrapAdminPage({
    admin: opts.admin,
    title,
    activeNav: "support",
    body: alert + body,
    topbar: {
      smsBalance: opts.smsBalance ?? "—",
      routesLabel: "Soporte",
      routesOk: true,
      companyName: "telvoice · superadmin",
    },
  });
}

function renderKpis(stats: AdminSupportTicketStats): string {
  return `<div class="tv-kpi-grid tv-kpi-grid--admin" style="margin-bottom:1.25rem">
    ${renderKpiCard({ label: "Tickets abiertos", value: String(stats.open), icon: "confirmation_number", variant: "warn" })}
    ${renderKpiCard({ label: "En revisión", value: String(stats.in_review), icon: "manage_search", variant: "default" })}
    ${renderKpiCard({ label: "Esperando respuesta", value: String(stats.waiting), icon: "hourglass_top", variant: "warn" })}
    ${renderKpiCard({ label: "Resueltos", value: String(stats.resolved), icon: "task_alt", variant: "success" })}
    ${renderKpiCard({ label: "Urgentes", value: String(stats.urgent), icon: "priority_high", variant: "danger" })}
  </div>`;
}

function renderFiltersForm(filters: AdminSupportTicketFilters): string {
  const statusOpts = [
    ["all", "Todos"],
    ["open", "Abierto"],
    ["in_review", "En revisión"],
    ["waiting", "Esperando respuesta"],
    ["resolved", "Resuelto"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}"${filters.status === v ? " selected" : ""}>${l}</option>`,
    )
    .join("");

  const priorityOpts = [
    ["all", "Todas"],
    ["low", "Baja"],
    ["medium", "Media"],
    ["high", "Alta"],
    ["urgent", "Urgente"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}"${filters.priority === v ? " selected" : ""}>${l}</option>`,
    )
    .join("");

  const catOpts = [
    `<option value="all"${filters.category === "all" ? " selected" : ""}>Todas</option>`,
    ...SUPPORT_CATEGORIES.map(
      (c) =>
        `<option value="${escapeHtml(c)}"${filters.category === c ? " selected" : ""}>${escapeHtml(c)}</option>`,
    ),
  ].join("");

  const dateOpts = [
    ["all", "Todos"],
    ["today", "Hoy"],
    ["7d", "Últimos 7 días"],
    ["30d", "Últimos 30 días"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}"${filters.dateRange === v ? " selected" : ""}>${l}</option>`,
    )
    .join("");

  return renderPanel(
    "Filtros",
    `<form method="get" action="/admin/support" class="tv-filters-form">
      ${renderFilterBar(`
        ${renderFilterField("Buscar", `<input type="search" name="q" class="tv-filter-input" placeholder="Código, asunto, empresa…" value="${escapeHtml(filters.search ?? "")}" />`)}
        ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
        ${renderFilterField("Prioridad", `<select name="priority" class="tv-filter-input">${priorityOpts}</select>`)}
        ${renderFilterField("Categoría", `<select name="category" class="tv-filter-input">${catOpts}</select>`)}
        ${renderFilterField("Fecha", `<select name="date_range" class="tv-filter-input">${dateOpts}</select>`)}
        <div class="tv-filter-field tv-filter-field--actions" style="align-self:end">
          <button type="submit" class="btn btn-primary btn-sm">Filtrar</button>
          <a href="/admin/support" class="btn btn-ghost btn-sm">Limpiar</a>
        </div>
      `)}
    </form>`,
  );
}

function ticketRow(t: AdminSupportTicketListItem): string {
  const company = t.companyName
    ? `<strong>${escapeHtml(t.companyName)}</strong>`
    : `<code class="field-hint">${escapeHtml(shortId(t.companyId))}</code>`;
  const priority = isPriorityCase(t)
    ? `${priorityBadge(t.priority)} <span class="badge badge-err">Caso prioritario</span>`
    : priorityBadge(t.priority);
  const href = `/admin/support?ticket=${escapeHtml(t.id)}`;

  return `<tr data-ticket-row="${escapeHtml(t.id)}">
    <td><code>${escapeHtml(t.code)}</code></td>
    <td>${company}</td>
    <td><strong>${escapeHtml(t.subject)}</strong></td>
    <td>${escapeHtml(t.category)}</td>
    <td>${priority}</td>
    <td>${statusBadge(t.status)}</td>
    <td>${escapeHtml(formatDate(t.updatedAt))}</td>
    <td>${escapeHtml(formatDate(t.createdAt))}</td>
    <td><a href="${href}" class="btn btn-ghost btn-sm">Ver detalle</a></td>
  </tr>`;
}

function ticketCard(t: AdminSupportTicketListItem): string {
  const href = `/admin/support?ticket=${escapeHtml(t.id)}`;
  return `<article class="tv-panel" style="padding:1rem;margin-bottom:0.75rem">
    <div style="display:flex;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem">
      <code>${escapeHtml(t.code)}</code>
      ${statusBadge(t.status)}
    </div>
    <strong>${escapeHtml(t.subject)}</strong>
    <p class="field-hint" style="margin:0.35rem 0">${escapeHtml(t.companyName ?? shortId(t.companyId))} · ${escapeHtml(t.category)}</p>
    <p class="field-hint" style="margin:0">${PRIORITY_LABELS[t.priority]} · Actualizado ${escapeHtml(formatDate(t.updatedAt))}</p>
    <a href="${href}" class="btn btn-secondary btn-sm" style="margin-top:0.75rem">Ver detalle</a>
  </article>`;
}

function renderTable(tickets: AdminSupportTicketListItem[]): string {
  if (!tickets.length) {
    return renderPanel(
      "Tickets",
      `<div style="text-align:center;padding:2.5rem 1rem">
        <span class="material-symbols-outlined" style="font-size:2.5rem;color:var(--tv-primary);opacity:0.7" aria-hidden="true">support_agent</span>
        <h2 style="margin:1rem 0 0.5rem;font-size:1.1rem">No hay tickets de soporte</h2>
        <p class="field-hint" style="max-width:420px;margin:0 auto">Cuando los clientes creen solicitudes desde el panel, aparecerán aquí para su revisión y seguimiento.</p>
      </div>`,
    );
  }

  const rows = tickets.map(ticketRow).join("");
  const cards = tickets.map(ticketCard).join("");

  return `${renderPanel(
    "Tickets de clientes",
    `<div class="tv-support-admin-table-wrap table-wrap" style="padding:0;overflow-x:auto">
      <table class="tv-table">
        <thead><tr>
          <th>Código</th><th>Empresa</th><th>Asunto</th><th>Categoría</th><th>Prioridad</th>
          <th>Estado</th><th>Última actualización</th><th>Creado</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="tv-support-admin-cards" style="display:none">${cards}</div>
    <p class="field-hint" style="margin:0.75rem 0 0">${tickets.length} ticket(s)</p>`,
  )}
  <style>
    @media (max-width: 768px) {
      .tv-support-admin-table-wrap { display: none !important; }
      .tv-support-admin-cards { display: block !important; }
    }
  </style>`;
}

function renderAuditActivity(ticket: AdminSupportTicketListItem): string {
  const events = getSupportTicketAuditLog(ticket.metadata).slice().reverse();
  if (!events.length) {
    return `<section class="tv-support-audit" style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--tv-border)">
      <h3 style="font-size:0.9rem;margin:0 0 0.5rem;color:var(--tv-text-muted)">Actividad interna</h3>
      <p class="field-hint" style="margin:0">Sin eventos registrados aún.</p>
    </section>`;
  }

  const rows = events
    .map((ev) => {
      const change = formatAuditChange(ev);
      return `<li class="tv-support-audit__item">
        <span class="field-hint">${escapeHtml(formatDate(ev.createdAt))}</span>
        <strong style="display:block;font-size:0.85rem;margin:0.15rem 0">${escapeHtml(auditActionLabel(ev.action))}</strong>
        <span class="field-hint">${escapeHtml(ev.actorName)} · ${escapeHtml(change)}</span>
      </li>`;
    })
    .join("");

  return `<section class="tv-support-audit" style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--tv-border)">
    <h3 style="font-size:0.9rem;margin:0 0 0.65rem;color:var(--tv-text-muted)">Actividad interna</h3>
    <ul class="tv-support-audit__list" style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.65rem">${rows}</ul>
  </section>`;
}

function renderReplyHistory(ticket: AdminSupportTicketListItem): string {
  const replies = ticket.replies ?? [];
  if (!replies.length) {
    return `<p class="field-hint" style="margin:0">Sin respuestas en el historial.</p>`;
  }
  return replies
    .map((r) => {
      const who =
        r.internal
          ? `${escapeHtml(r.authorName ?? "Interno")} (nota interna)`
          : r.author === "support"
            ? escapeHtml(resolveSupportReplyDisplayName(r.authorName))
            : "Cliente";
      const cls = r.internal ? "tv-support-admin-reply tv-support-admin-reply--internal" : "tv-support-admin-reply";
      return `<div class="${cls}">
        <p class="field-hint" style="margin:0 0 0.35rem"><strong>${who}</strong> · ${escapeHtml(formatDate(r.createdAt))}</p>
        <p style="margin:0;white-space:pre-wrap">${escapeHtml(r.message)}</p>
      </div>`;
    })
    .join("");
}

function renderDrawer(ticket: AdminSupportTicketListItem): string {
  const priorityAlert = isPriorityCase(ticket)
    ? `<div class="alert alert-warn" style="margin-bottom:1rem">
        <strong>Caso prioritario</strong><br />
        <span class="field-hint">Este ticket puede requerir revisión comercial o técnica especializada.</span>
      </div>`
    : "";

  const orderBlock = ticket.relatedOrderId
    ? `<p style="margin:0 0 0.75rem"><strong>Orden relacionada:</strong>
        <a href="/admin/orders/${escapeHtml(ticket.relatedOrderId)}"><code>${escapeHtml(shortId(ticket.relatedOrderId))}</code></a></p>`
    : "";

  const statusOpts = (["open", "in_review", "waiting", "resolved"] as const)
    .map(
      (s) =>
        `<option value="${s}"${ticket.status === s ? " selected" : ""}>${STATUS_LABELS[s]}</option>`,
    )
    .join("");

  const priorityOpts = (["low", "medium", "high", "urgent"] as const)
    .map(
      (p) =>
        `<option value="${p}"${ticket.priority === p ? " selected" : ""}>${PRIORITY_LABELS[p]}</option>`,
    )
    .join("");

  return `<div class="tv-support-admin-drawer" id="tv-admin-support-drawer" aria-hidden="false">
    <div class="tv-support-admin-drawer__backdrop" data-admin-support-close></div>
    <div class="tv-support-admin-drawer__panel">
      <header class="tv-support-admin-drawer__head">
        <div>
          <p class="field-hint" style="margin:0">${escapeHtml(ticket.code)}</p>
          <h2 style="margin:0.25rem 0 0;font-size:1.1rem">${escapeHtml(ticket.subject)}</h2>
          <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.5rem">
            ${statusBadge(ticket.status)} ${priorityBadge(ticket.priority)}
            <span class="badge badge-muted">${escapeHtml(ticket.category)}</span>
          </div>
        </div>
        <a href="/admin/support" class="btn btn-ghost btn-sm" aria-label="Cerrar">✕</a>
      </header>
      <div class="tv-support-admin-drawer__body">
        ${priorityAlert}
        <p style="margin:0 0 0.5rem"><strong>Empresa:</strong> ${escapeHtml(ticket.companyName ?? "—")}</p>
        <p class="field-hint" style="margin:0 0 0.75rem">Company ID: <code id="tv-admin-support-company-id">${escapeHtml(ticket.companyId)}</code>
          <button type="button" class="btn btn-ghost btn-sm" data-copy-target="tv-admin-support-company-id">Copiar ID</button>
        </p>
        ${ticket.userId ? `<p class="field-hint" style="margin:0 0 0.75rem">Usuario: <code>${escapeHtml(ticket.userId)}</code></p>` : ""}
        <p class="field-hint" style="margin:0 0 0.75rem">Creado: ${escapeHtml(formatDate(ticket.createdAt))} · Actualizado: ${escapeHtml(formatDate(ticket.updatedAt))}</p>
        ${orderBlock}
        <h3 style="font-size:0.95rem;margin:1rem 0 0.35rem">Mensaje del cliente</h3>
        <p style="margin:0 0 1rem;white-space:pre-wrap;line-height:1.5">${escapeHtml(ticket.message)}</p>
        <h3 style="font-size:0.95rem;margin:0 0 0.5rem">Historial</h3>
        <div style="margin-bottom:1rem">${renderReplyHistory(ticket)}</div>

        <form method="post" action="/admin/support/tickets/${escapeHtml(ticket.id)}/update" style="margin-bottom:1rem">
          <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
            <label class="tv-filter-field"><span class="tv-filter-field__label">Estado</span>
              <select name="status" class="tv-filter-input">${statusOpts}</select></label>
            <label class="tv-filter-field"><span class="tv-filter-field__label">Prioridad</span>
              <select name="priority" class="tv-filter-input">${priorityOpts}</select></label>
          </div>
          <button type="submit" class="btn btn-secondary btn-sm" style="margin-top:0.5rem">Guardar cambios</button>
        </form>

        <form method="post" action="/admin/support/tickets/${escapeHtml(ticket.id)}/reply" style="margin-bottom:1rem">
          <label class="tv-filter-field"><span class="tv-filter-field__label">Responder al cliente</span>
            <textarea name="message" class="tv-filter-input" rows="3" required placeholder="Escribe una respuesta para el cliente…"></textarea></label>
          <button type="submit" class="btn btn-primary btn-sm">Enviar respuesta</button>
        </form>

        <form method="post" action="/admin/support/tickets/${escapeHtml(ticket.id)}/internal-note" style="margin-bottom:1rem">
          <label class="tv-filter-field"><span class="tv-filter-field__label">Nota interna (solo Telvoice)</span>
            <textarea name="message" class="tv-filter-input" rows="2" required placeholder="Nota visible solo para el equipo interno…"></textarea></label>
          <button type="submit" class="btn btn-ghost btn-sm">Guardar nota interna</button>
        </form>

        <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-bottom:0.75rem">
          <form method="post" action="/admin/support/tickets/${escapeHtml(ticket.id)}/quick-action" style="display:inline"><input type="hidden" name="action" value="in_review" /><button type="submit" class="btn btn-ghost btn-sm">En revisión</button></form>
          <form method="post" action="/admin/support/tickets/${escapeHtml(ticket.id)}/quick-action" style="display:inline"><input type="hidden" name="action" value="waiting" /><button type="submit" class="btn btn-ghost btn-sm">Esperando cliente</button></form>
          <form method="post" action="/admin/support/tickets/${escapeHtml(ticket.id)}/quick-action" style="display:inline"><input type="hidden" name="action" value="resolved" /><button type="submit" class="btn btn-secondary btn-sm">Marcar resuelto</button></form>
          <form method="post" action="/admin/support/tickets/${escapeHtml(ticket.id)}/quick-action" style="display:inline"><input type="hidden" name="action" value="urgent" /><button type="submit" class="btn btn-ghost btn-sm">Subir a urgente</button></form>
          <button type="button" class="btn btn-ghost btn-sm" data-copy-text="${escapeHtml(ticket.code)}">Copiar código</button>
        </div>
        ${renderAuditActivity(ticket)}
      </div>
    </div>
  </div>
  <style>
    .tv-support-admin-drawer { position:fixed;inset:0;z-index:300;display:flex;justify-content:flex-end; }
    .tv-support-admin-drawer__backdrop { position:absolute;inset:0;background:rgba(15,23,42,0.45); }
    .tv-support-admin-drawer__panel { position:relative;width:min(520px,100%);max-height:100vh;overflow:hidden;display:flex;flex-direction:column;background:var(--tv-surface);box-shadow:var(--tv-shadow-lg); }
    .tv-support-admin-drawer__head { padding:1rem 1.25rem;border-bottom:1px solid var(--tv-border);display:flex;justify-content:space-between;gap:0.75rem; }
    .tv-support-admin-drawer__body { padding:1rem 1.25rem;overflow-y:auto;flex:1; }
    .tv-support-admin-reply { padding:0.65rem 0;border-bottom:1px solid var(--tv-border); }
    .tv-support-admin-reply--internal { background:var(--tv-bg);padding:0.65rem;border-radius:var(--tv-radius);margin-bottom:0.5rem;border:1px dashed var(--tv-border); }
    .tv-support-audit__item { padding:0.5rem 0.65rem;background:var(--tv-bg);border-radius:var(--tv-radius);border:1px solid var(--tv-border); }
  </style>
  <script>
  document.querySelectorAll("[data-copy-target]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var el = document.getElementById(btn.getAttribute("data-copy-target"));
      if (el) navigator.clipboard.writeText(el.textContent.trim());
    });
  });
  document.querySelectorAll("[data-copy-text]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      navigator.clipboard.writeText(btn.getAttribute("data-copy-text") || "");
    });
  });
  document.querySelector("[data-admin-support-close]")?.addEventListener("click", function() {
    window.location.href = "/admin/support";
  });
  </script>`;
}

export function renderAdminSupportPage(
  opts: AdminSupportPageOpts,
  ctx: AdminSupportPageContext,
): string {
  const loadErr = ctx.loadError
    ? `<div class="alert alert-error">${escapeHtml(ctx.loadError)}</div>`
    : "";

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Soporte clientes",
      subtitle:
        "Gestiona tickets de soporte, solicitudes técnicas, comerciales y casos de alto volumen creados por clientes Telvoice.",
    })}
    ${loadErr}
    ${ctx.module.available ? renderKpis(ctx.stats) : ""}
    ${renderFiltersForm(ctx.filters)}
    ${ctx.module.available ? renderTable(ctx.tickets) : renderPanel("Tickets", `<p class="field-hint" style="margin:0">Módulo no disponible.</p>`)}
    ${ctx.selectedTicket ? renderDrawer(ctx.selectedTicket) : ""}
    ${renderAdminUiScript()}`;

  return wrap(opts, "Soporte clientes", body);
}
