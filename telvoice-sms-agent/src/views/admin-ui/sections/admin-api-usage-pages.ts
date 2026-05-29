import type { AdminSessionUser } from "../../../types/admin.js";
import type {
  AdminApiKeyListItem,
  AdminApiRequestDetail,
  AdminApiRequestListItem,
  AdminApiUsageFilters,
  AdminApiUsageModuleState,
  AdminApiUsageStats,
  AdminSmsApiMessageDetail,
  AdminSmsApiMessageListItem,
} from "../../../types/admin-api-usage.js";
import type { AdminRateLimitOverrideListItem } from "../../../types/api-rate-limit-overrides.js";
import type { ClientApiKeyEnvironment } from "../../../types/client-api-keys.js";
import type { CompanyRow } from "../../../types/tenant.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";

export type AdminApiUsagePageOpts = {
  admin: AdminSessionUser;
  smsBalance?: string;
  flash?: string;
  error?: string;
};

export type AdminApiUsagePageContext = {
  module: AdminApiUsageModuleState;
  filters: AdminApiUsageFilters;
  companies: CompanyRow[];
  stats: AdminApiUsageStats;
  requests: AdminApiRequestListItem[];
  keys: AdminApiKeyListItem[];
  messages: AdminSmsApiMessageListItem[];
  overrides: AdminRateLimitOverrideListItem[];
  companyApiKeys: Array<{
    id: string;
    name: string;
    keyMasked: string;
    environment: ClientApiKeyEnvironment;
  }>;
  overrideCompanyId?: string;
  selectedRequest: AdminApiRequestDetail | null;
  selectedMessage: AdminSmsApiMessageDetail | null;
  loadError?: string;
  preserveQuery: AdminApiUsageFilters;
};

function pickQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = query[key];
  return typeof v === "string" ? v.trim() : "";
}

export function parseAdminApiUsageFilters(
  query: Record<string, string | string[] | undefined>,
): AdminApiUsageFilters {
  const statusRaw = pickQuery(query, "status_code");
  const statusCode = statusRaw && /^\d+$/.test(statusRaw) ? Number(statusRaw) : undefined;

  const successRaw = pickQuery(query, "success");
  let success: boolean | "all" = "all";
  if (successRaw === "true") success = true;
  if (successRaw === "false") success = false;

  const envRaw = pickQuery(query, "environment");
  const environment =
    envRaw === "sandbox" || envRaw === "production" ? envRaw : "all";

  const dateRaw = pickQuery(query, "date_range");
  const dateRanges = ["all", "today", "7d", "30d"] as const;
  const dateRange = dateRanges.includes(dateRaw as (typeof dateRanges)[number])
    ? (dateRaw as AdminApiUsageFilters["dateRange"])
    : "all";

  const methodRaw = pickQuery(query, "method");
  const methods = ["all", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;
  const method = methods.includes(methodRaw as (typeof methods)[number])
    ? (methodRaw as AdminApiUsageFilters["method"])
    : "all";

  return {
    search: pickQuery(query, "q") || undefined,
    companyId: pickQuery(query, "company_id") || undefined,
    endpoint: pickQuery(query, "endpoint") || undefined,
    method,
    statusCode,
    errorCode: pickQuery(query, "error_code") || undefined,
    environment,
    dateRange,
    success,
  };
}

function filtersToQuery(filters: AdminApiUsageFilters, extra?: Record<string, string>): string {
  const q = new URLSearchParams();
  if (filters.search) q.set("q", filters.search);
  if (filters.companyId) q.set("company_id", filters.companyId);
  if (filters.endpoint) q.set("endpoint", filters.endpoint);
  if (filters.method && filters.method !== "all") q.set("method", filters.method);
  if (filters.statusCode) q.set("status_code", String(filters.statusCode));
  if (filters.errorCode) q.set("error_code", filters.errorCode);
  if (filters.environment && filters.environment !== "all") {
    q.set("environment", filters.environment);
  }
  if (filters.dateRange && filters.dateRange !== "all") {
    q.set("date_range", filters.dateRange);
  }
  if (filters.success === true) q.set("success", "true");
  if (filters.success === false) q.set("success", "false");
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
    }
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function resultBadge(success: boolean, statusCode: number): string {
  if (success) {
    return `<span class="badge badge-ok">Éxito</span>`;
  }
  return `<span class="badge badge-warn">Error ${statusCode}</span>`;
}

function keyStatusBadge(status: string): string {
  const map: Record<string, string> = {
    active: "badge-ok",
    paused: "badge-warn",
    revoked: "badge-muted",
    expired: "badge-muted",
  };
  return `<span class="badge ${map[status] ?? "badge-muted"}">${escapeHtml(status)}</span>`;
}

function productionApprovalBadge(k: AdminApiKeyListItem): string {
  if (k.environment !== "production") {
    return `<span class="field-hint">No aplica</span>`;
  }
  if (k.productionApproved) {
    return `<span class="badge badge-ok">Aprobada</span>`;
  }
  if (k.status === "revoked") {
    return `<span class="badge badge-muted">No aplica (revocada)</span>`;
  }
  return `<span class="badge badge-warn">Pendiente</span>`;
}

function renderKpis(stats: AdminApiUsageStats): string {
  return `<div class="tv-kpi-grid tv-kpi-grid--client" style="margin-bottom:1.25rem">
    ${renderKpiCard({ label: "Requests 24h", value: String(stats.requestsLast24h), icon: "monitoring", variant: "primary" })}
    ${renderKpiCard({ label: "Errores 24h", value: String(stats.errorsLast24h), icon: "error", variant: stats.errorsLast24h > 0 ? "warn" : "default" })}
    ${renderKpiCard({ label: "API Keys activas", value: String(stats.activeApiKeys), icon: "vpn_key", variant: "success" })}
    ${renderKpiCard({ label: "Mensajes sandbox", value: String(stats.sandboxMessages), icon: "sms", variant: "default" })}
    ${renderKpiCard({ label: "Empresas con actividad", value: String(stats.companiesWithActivity), icon: "business", variant: "default" })}
  </div>`;
}

function renderFilters(filters: AdminApiUsageFilters, companies: CompanyRow[]): string {
  const companyOpts = [
    `<option value="">Todas</option>`,
    ...companies.map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${filters.companyId === c.id ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
    ),
  ].join("");

  const methodOpts = ["all", "GET", "POST", "PUT", "PATCH", "DELETE"]
    .map(
      (m) =>
        `<option value="${m}"${filters.method === m ? " selected" : ""}>${m === "all" ? "Todos" : m}</option>`,
    )
    .join("");

  const envOpts = [
    ["all", "Todos"],
    ["sandbox", "Sandbox"],
    ["production", "Producción"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}"${filters.environment === v ? " selected" : ""}>${l}</option>`,
    )
    .join("");

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

  const successOpts = [
    ["all", "Todos"],
    ["true", "Éxito"],
    ["false", "Error"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}"${(filters.success === true && v === "true") || (filters.success === false && v === "false") || (filters.success === "all" && v === "all") ? " selected" : ""}>${l}</option>`,
    )
    .join("");

  return renderPanel(
    "Filtros",
    `<form method="get" action="/admin/api-usage" class="tv-filters-form">
      ${renderFilterBar(`
        ${renderFilterField("Buscar", `<input type="search" name="q" class="tv-filter-input" placeholder="request_id, empresa, key, endpoint…" value="${escapeHtml(filters.search ?? "")}" />`)}
        ${renderFilterField("Empresa", `<select name="company_id" class="tv-filter-input">${companyOpts}</select>`)}
        ${renderFilterField("Endpoint", `<input type="text" name="endpoint" class="tv-filter-input" placeholder="/api/v1/…" value="${escapeHtml(filters.endpoint ?? "")}" />`)}
        ${renderFilterField("Método", `<select name="method" class="tv-filter-input">${methodOpts}</select>`)}
        ${renderFilterField("HTTP", `<input type="number" name="status_code" class="tv-filter-input" min="100" max="599" placeholder="200" value="${filters.statusCode ?? ""}" />`)}
        ${renderFilterField("Error code", `<input type="text" name="error_code" class="tv-filter-input" value="${escapeHtml(filters.errorCode ?? "")}" />`)}
        ${renderFilterField("Ambiente", `<select name="environment" class="tv-filter-input">${envOpts}</select>`)}
        ${renderFilterField("Resultado", `<select name="success" class="tv-filter-input">${successOpts}</select>`)}
        ${renderFilterField("Fecha", `<select name="date_range" class="tv-filter-input">${dateOpts}</select>`)}
        <div class="tv-filter-field tv-filter-field--actions" style="align-self:end">
          <button type="submit" class="btn btn-primary btn-sm">Filtrar</button>
          <a href="/admin/api-usage" class="btn btn-ghost btn-sm">Limpiar</a>
        </div>
      `)}
    </form>`,
  );
}

function renderRequestsTable(
  requests: AdminApiRequestListItem[],
  filters: AdminApiUsageFilters,
): string {
  if (!requests.length) {
    return renderPanel(
      "Requests recientes",
      `<div style="text-align:center;padding:2rem 1rem">
        <span class="material-symbols-outlined" style="font-size:2.5rem;color:var(--tv-primary);opacity:0.7" aria-hidden="true">api</span>
        <h2 style="margin:1rem 0 0.5rem;font-size:1.1rem">Aún no hay actividad API</h2>
        <p class="field-hint" style="max-width:480px;margin:0 auto">Cuando los clientes utilicen sus API Keys para consultar saldo, enviar mensajes sandbox o consultar mensajes, la actividad aparecerá aquí.</p>
      </div>`,
    );
  }

  const rows = requests
    .map((r) => {
      const href = `/admin/api-usage${filtersToQuery(filters, { request: r.requestId })}`;
      const company = r.companyName
        ? escapeHtml(r.companyName)
        : `<code>${escapeHtml(shortId(r.companyId ?? ""))}</code>`;
      const keyLabel = r.apiKeyMasked ?? r.apiKeyName ?? "—";
      return `<tr>
        <td>${escapeHtml(formatDate(r.createdAt))}</td>
        <td>${company}</td>
        <td><code>${escapeHtml(r.endpoint)}</code></td>
        <td>${escapeHtml(r.method)}</td>
        <td>${r.statusCode}</td>
        <td>${resultBadge(r.success, r.statusCode)}</td>
        <td>${escapeHtml(r.errorCode ?? "—")}</td>
        <td><code>${escapeHtml(keyLabel)}</code></td>
        <td><code class="field-hint">${escapeHtml(r.requestId)}</code></td>
        <td>${r.durationMs != null ? `${r.durationMs} ms` : "—"}</td>
        <td><a href="${href}" class="btn btn-ghost btn-sm">Ver detalle</a></td>
      </tr>`;
    })
    .join("");

  return renderPanel(
    "Requests recientes",
    `<div class="table-wrap" style="overflow-x:auto">
      <table class="tv-table">
        <thead><tr>
          <th>Fecha</th><th>Empresa</th><th>Endpoint</th><th>Método</th><th>HTTP</th>
          <th>Resultado</th><th>Error</th><th>API Key</th><th>Request ID</th><th>Duración</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="field-hint" style="margin:0.75rem 0 0">${requests.length} request(s)</p>`,
  );
}

function renderKeysTable(keys: AdminApiKeyListItem[], filters: AdminApiUsageFilters): string {
  if (!keys.length) {
    return renderPanel("API Keys por empresa", `<p class="field-hint" style="margin:0">Sin API Keys registradas.</p>`);
  }

  const rows = keys
    .map((k) => {
      const company = k.companyName
        ? escapeHtml(k.companyName)
        : `<code>${escapeHtml(shortId(k.companyId))}</code>`;
      const scopes = k.scopes.map((s) => `<code>${escapeHtml(s)}</code>`).join(" ");
      const isRevoked = k.status === "revoked";
      const qs = filtersToQuery(filters);
      const pauseForm = !isRevoked && k.status !== "paused"
        ? `<form method="post" action="/admin/api-usage/keys/${escapeHtml(k.id)}/pause${qs}" style="display:inline" onsubmit="return confirm('¿Pausar esta API Key?');">
             <button type="submit" class="btn btn-ghost btn-sm">Pausar</button>
           </form>`
        : "";
      const activateForm = !isRevoked && k.status === "paused"
        ? `<form method="post" action="/admin/api-usage/keys/${escapeHtml(k.id)}/activate${qs}" style="display:inline">
             <button type="submit" class="btn btn-ghost btn-sm">Activar</button>
           </form>`
        : "";
      const revokeForm = !isRevoked
        ? `<form method="post" action="/admin/api-usage/keys/${escapeHtml(k.id)}/revoke${qs}" style="display:inline" onsubmit="return confirm('¿Revocar esta API Key? No se puede deshacer.');">
             <button type="submit" class="btn btn-ghost btn-sm">Revocar</button>
           </form>`
        : "";
      const isProduction = k.environment === "production";
      const canApproveProd =
        isProduction && !k.productionApproved && k.status === "active";
      const canRevokeApproval = isProduction && k.productionApproved;
      const prodConfirm =
        "Esta acción no habilita envío real todavía. Solo deja la API Key preparada para una futura activación productiva.";
      const approveForm = canApproveProd
        ? `<details style="display:inline-block;vertical-align:top">
             <summary class="btn btn-ghost btn-sm" style="list-style:none;cursor:pointer">Aprobar production</summary>
             <form method="post" action="/admin/api-usage/keys/${escapeHtml(k.id)}/approve-production${qs}" style="padding:0.5rem;min-width:220px" onsubmit="return confirm(${JSON.stringify(prodConfirm)});">
               <textarea name="notes" class="tv-input-full" rows="2" placeholder="Notas de aprobación (opcional)"></textarea>
               <button type="submit" class="btn btn-primary btn-sm" style="margin-top:0.35rem">Confirmar aprobación</button>
             </form>
           </details>`
        : "";
      const revokeApprovalForm = canRevokeApproval
        ? `<details style="display:inline-block;vertical-align:top">
             <summary class="btn btn-ghost btn-sm" style="list-style:none;cursor:pointer">Revocar aprobación</summary>
             <form method="post" action="/admin/api-usage/keys/${escapeHtml(k.id)}/revoke-production-approval${qs}" style="padding:0.5rem;min-width:220px" onsubmit="return confirm('¿Revocar aprobación production de esta API Key?');">
               <textarea name="reason" class="tv-input-full" rows="2" placeholder="Motivo de revocación"></textarea>
               <button type="submit" class="btn btn-primary btn-sm" style="margin-top:0.35rem">Confirmar revocación</button>
             </form>
           </details>`
        : "";
      return `<tr>
        <td>${company}</td>
        <td><strong>${escapeHtml(k.name)}</strong></td>
        <td><code>${escapeHtml(k.keyMasked)}</code></td>
        <td>${escapeHtml(k.environment)}</td>
        <td>${keyStatusBadge(k.status)}</td>
        <td>${productionApprovalBadge(k)}</td>
        <td>${scopes || "—"}</td>
        <td>${k.lastUsedAt ? escapeHtml(formatDate(k.lastUsedAt)) : "—"}</td>
        <td>${escapeHtml(formatDate(k.createdAt))}</td>
        <td style="white-space:nowrap">${approveForm}${revokeApprovalForm}${pauseForm}${activateForm}${revokeForm}</td>
      </tr>`;
    })
    .join("");

  return renderPanel(
    "API Keys por empresa",
    `<p class="field-hint" style="margin:0 0 1rem">Aprobar production no habilita envío SMS real; solo prepara la key para una futura activación.</p>
    <div class="table-wrap" style="overflow-x:auto">
      <table class="tv-table">
        <thead><tr>
          <th>Empresa</th><th>Nombre</th><th>Key</th><th>Ambiente</th><th>Estado</th>
          <th>Aprobación production</th><th>Scopes</th><th>Último uso</th><th>Creada</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`,
  );
}

function overrideStatusBadge(status: string): string {
  const map: Record<string, string> = {
    active: "badge-ok",
    paused: "badge-warn",
    disabled: "badge-muted",
  };
  return `<span class="badge ${map[status] ?? "badge-muted"}">${escapeHtml(status)}</span>`;
}

function renderRateLimitOverridesSection(
  ctx: AdminApiUsagePageContext,
  filters: AdminApiUsageFilters,
): string {
  if (!ctx.module.overridesAvailable) {
    return renderPanel(
      "Overrides de rate limit",
      `<p class="field-hint" style="margin:0">Migración 037 pendiente. Ejecute <code>npm run migrate:037</code>.</p>`,
    );
  }

  const qs = filtersToQuery(filters);
  const companyOpts = [
    `<option value="">Seleccionar empresa…</option>`,
    ...ctx.companies.map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${ctx.overrideCompanyId === c.id ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
    ),
  ].join("");

  const keyOpts = [
    `<option value="">Toda la empresa (sin key específica)</option>`,
    ...ctx.companyApiKeys.map(
      (k) =>
        `<option value="${escapeHtml(k.id)}">${escapeHtml(k.name)} (${escapeHtml(k.keyMasked)})</option>`,
    ),
  ].join("");

  const rows = ctx.overrides.length
    ? ctx.overrides
        .map((o) => {
          const company = o.companyName
            ? escapeHtml(o.companyName)
            : `<code>${escapeHtml(shortId(o.companyId))}</code>`;
          const keyLabel = o.apiKeyMasked
            ? `<code>${escapeHtml(o.apiKeyMasked)}</code>${o.apiKeyName ? ` <span class="field-hint">${escapeHtml(o.apiKeyName)}</span>` : ""}`
            : `<span class="field-hint">Empresa</span>`;
          const disableForm =
            o.status !== "disabled"
              ? `<form method="post" action="/admin/api-usage/rate-limits/${escapeHtml(o.id)}/disable${qs}" style="display:inline" onsubmit="return confirm('¿Desactivar este override?');">
                   <button type="submit" class="btn btn-ghost btn-sm">Desactivar</button>
                 </form>`
              : "";
          return `<tr>
            <td>${company}</td>
            <td>${keyLabel}</td>
            <td>${escapeHtml(o.environment)}</td>
            <td>${o.limitPerMinute ?? "—"}</td>
            <td>${o.limitPerDay ?? "—"}</td>
            <td>${overrideStatusBadge(o.status)}</td>
            <td>${escapeHtml(o.reason ?? "—")}</td>
            <td>${escapeHtml(formatDate(o.updatedAt))}</td>
            <td style="white-space:nowrap">
              <details style="display:inline">
                <summary class="btn btn-ghost btn-sm" style="cursor:pointer;list-style:none">Editar</summary>
                <form method="post" action="/admin/api-usage/rate-limits/${escapeHtml(o.id)}${qs}" style="margin-top:0.5rem;padding:0.75rem;background:var(--tv-bg);border-radius:6px;min-width:220px">
                  <label class="field-hint">Límite/min</label>
                  <input type="number" name="limit_per_minute" class="tv-filter-input" min="1" value="${o.limitPerMinute ?? ""}" />
                  <label class="field-hint" style="margin-top:0.35rem;display:block">Límite/día</label>
                  <input type="number" name="limit_per_day" class="tv-filter-input" min="1" value="${o.limitPerDay ?? ""}" />
                  <label class="field-hint" style="margin-top:0.35rem;display:block">Motivo</label>
                  <input type="text" name="reason" class="tv-filter-input" value="${escapeHtml(o.reason ?? "")}" />
                  <button type="submit" class="btn btn-primary btn-sm" style="margin-top:0.5rem">Guardar</button>
                </form>
              </details>
              ${disableForm}
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="9" class="field-hint" style="text-align:center;padding:1.5rem">Sin overrides activos. Use el formulario para crear uno.</td></tr>`;

  return renderPanel(
    "Overrides de rate limit",
    `<p class="field-hint" style="margin:0 0 1rem">Define límites personalizados para empresas o API Keys específicas.</p>
    <details style="margin-bottom:1rem">
      <summary class="btn btn-primary btn-sm" style="cursor:pointer;list-style:none;display:inline-block">Crear override</summary>
      <form method="post" action="/admin/api-usage/rate-limits${qs}" style="margin-top:0.75rem;padding:1rem;background:var(--tv-bg);border-radius:8px;max-width:520px">
        <div style="display:grid;gap:0.65rem">
          <div>
            <label class="field-hint">Empresa *</label>
            <select name="company_id" id="tv-rl-company" class="tv-filter-input" required onchange="location.href='/admin/api-usage${filtersToQuery(filters)}&override_company='+encodeURIComponent(this.value)">${companyOpts}</select>
          </div>
          <div>
            <label class="field-hint">API Key (opcional)</label>
            <select name="api_key_id" class="tv-filter-input">${keyOpts}</select>
          </div>
          <div>
            <label class="field-hint">Ambiente *</label>
            <select name="environment" id="tv-rl-env" class="tv-filter-input" required onchange="document.getElementById('tv-rl-prod-warn').style.display=this.value==='production'?'block':'none'">
              <option value="sandbox">Sandbox</option>
              <option value="production">Producción</option>
            </select>
            <p id="tv-rl-prod-warn" class="field-hint" style="display:none;margin:0.35rem 0 0;color:var(--tv-warn)">Los límites production no habilitan envío real; solo preparan la política futura.</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem">
            <div>
              <label class="field-hint">Límite por minuto</label>
              <input type="number" name="limit_per_minute" class="tv-filter-input" min="1" placeholder="30" />
            </div>
            <div>
              <label class="field-hint">Límite por día</label>
              <input type="number" name="limit_per_day" class="tv-filter-input" min="1" placeholder="500" />
            </div>
          </div>
          <div>
            <label class="field-hint">Motivo</label>
            <input type="text" name="reason" class="tv-filter-input" placeholder="Cliente alto volumen temporal…" />
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Crear override</button>
        </div>
      </form>
    </details>
    <div class="table-wrap" style="overflow-x:auto">
      <table class="tv-table">
        <thead><tr>
          <th>Empresa</th><th>API Key</th><th>Ambiente</th><th>Límite/min</th><th>Límite/día</th>
          <th>Estado</th><th>Motivo</th><th>Actualizado</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`,
  );
}

function renderMessagesTable(
  messages: AdminSmsApiMessageListItem[],
  filters: AdminApiUsageFilters,
): string {
  if (!messages.length) {
    return renderPanel(
      "Mensajes sandbox",
      `<p class="field-hint" style="margin:0">Sin mensajes sandbox registrados.</p>`,
    );
  }

  const rows = messages
    .map((m) => {
      const href = `/admin/api-usage${filtersToQuery(filters, { message: m.id })}`;
      const company = m.companyName
        ? escapeHtml(m.companyName)
        : `<code>${escapeHtml(shortId(m.companyId))}</code>`;
      return `<tr>
        <td>${escapeHtml(formatDate(m.createdAt))}</td>
        <td>${company}</td>
        <td><code>${escapeHtml(m.recipient)}</code></td>
        <td>${escapeHtml(m.sender ?? "—")}</td>
        <td title="${escapeHtml(m.messagePreview)}">${escapeHtml(m.messagePreview)}</td>
        <td>${m.segments}</td>
        <td><span class="badge badge-muted">${escapeHtml(m.status)}</span></td>
        <td>${escapeHtml(m.environment)}</td>
        <td>${escapeHtml(m.externalReference ?? "—")}</td>
        <td>${m.costSms}</td>
        <td><code class="field-hint">${escapeHtml(shortId(m.id))}</code></td>
        <td><a href="${href}" class="btn btn-ghost btn-sm">Ver detalle</a></td>
      </tr>`;
    })
    .join("");

  return renderPanel(
    "Mensajes sandbox",
    `<div class="table-wrap" style="overflow-x:auto">
      <table class="tv-table">
        <thead><tr>
          <th>Fecha</th><th>Empresa</th><th>To</th><th>Sender</th><th>Mensaje</th><th>Seg.</th>
          <th>Estado</th><th>Ambiente</th><th>Ref. externa</th><th>Cost SMS</th><th>ID</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`,
  );
}

function renderRequestDetail(
  detail: AdminApiRequestDetail,
  filters: AdminApiUsageFilters,
): string {
  const closeHref = `/admin/api-usage${filtersToQuery(filters)}`;
  const metaRows = Object.entries(detail.metadata)
    .map(
      ([k, v]) =>
        `<tr><th>${escapeHtml(k)}</th><td><code>${escapeHtml(JSON.stringify(v))}</code></td></tr>`,
    )
    .join("");

  return `<aside class="tv-panel" style="margin-top:1rem;border-left:4px solid var(--tv-primary)">
    <div style="display:flex;justify-content:space-between;align-items:start;gap:0.75rem;margin-bottom:0.75rem">
      <h2 class="tv-panel__title" style="margin:0">Detalle request</h2>
      <a href="${closeHref}" class="btn btn-ghost btn-sm">Cerrar</a>
    </div>
    <dl class="tv-dl-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem 1rem;font-size:0.88rem">
      <div><dt class="field-hint">request_id</dt><dd><code>${escapeHtml(detail.requestId)}</code></dd></div>
      <div><dt class="field-hint">Empresa</dt><dd>${escapeHtml(detail.companyName ?? "—")}</dd></div>
      <div><dt class="field-hint">company_id</dt><dd><code>${escapeHtml(detail.companyId ?? "—")}</code></dd></div>
      <div><dt class="field-hint">api_key_id</dt><dd><code>${escapeHtml(detail.apiKeyId ?? "—")}</code></dd></div>
      <div><dt class="field-hint">API Key</dt><dd><code>${escapeHtml(detail.apiKeyMasked ?? detail.apiKeyName ?? "—")}</code></dd></div>
      <div><dt class="field-hint">Endpoint</dt><dd><code>${escapeHtml(detail.endpoint)}</code></dd></div>
      <div><dt class="field-hint">Método</dt><dd>${escapeHtml(detail.method)}</dd></div>
      <div><dt class="field-hint">HTTP</dt><dd>${detail.statusCode}</dd></div>
      <div><dt class="field-hint">Éxito</dt><dd>${detail.success ? "Sí" : "No"}</dd></div>
      <div><dt class="field-hint">error_code</dt><dd>${escapeHtml(detail.errorCode ?? "—")}</dd></div>
      <div><dt class="field-hint">error_message</dt><dd>${escapeHtml(detail.errorMessage ?? "—")}</dd></div>
      <div><dt class="field-hint">environment</dt><dd>${escapeHtml(detail.environment ?? "—")}</dd></div>
      <div><dt class="field-hint">duration_ms</dt><dd>${detail.durationMs ?? "—"}</dd></div>
      <div><dt class="field-hint">created_at</dt><dd>${escapeHtml(formatDate(detail.createdAt))}</dd></div>
    </dl>
    ${metaRows ? `<h3 style="font-size:0.85rem;margin:1rem 0 0.35rem">Metadata</h3><table class="tv-table tv-table--compact"><tbody>${metaRows}</tbody></table>` : ""}
  </aside>`;
}

function renderMessageDetail(
  detail: AdminSmsApiMessageDetail,
  filters: AdminApiUsageFilters,
): string {
  const closeHref = `/admin/api-usage${filtersToQuery(filters)}`;
  return `<aside class="tv-panel" style="margin-top:1rem;border-left:4px solid var(--tv-primary)">
    <div style="display:flex;justify-content:space-between;align-items:start;gap:0.75rem;margin-bottom:0.75rem">
      <h2 class="tv-panel__title" style="margin:0">Detalle mensaje sandbox</h2>
      <a href="${closeHref}" class="btn btn-ghost btn-sm">Cerrar</a>
    </div>
    <dl class="tv-dl-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem 1rem;font-size:0.88rem">
      <div><dt class="field-hint">message id</dt><dd><code>${escapeHtml(detail.id)}</code></dd></div>
      <div><dt class="field-hint">Empresa</dt><dd>${escapeHtml(detail.companyName ?? "—")}</dd></div>
      <div><dt class="field-hint">recipient</dt><dd><code>${escapeHtml(detail.recipient)}</code></dd></div>
      <div><dt class="field-hint">sender</dt><dd>${escapeHtml(detail.sender ?? "—")}</dd></div>
      <div><dt class="field-hint">country</dt><dd>${escapeHtml(detail.country ?? "—")}</dd></div>
      <div><dt class="field-hint">segments</dt><dd>${detail.segments}</dd></div>
      <div><dt class="field-hint">status</dt><dd>${escapeHtml(detail.status)}</dd></div>
      <div><dt class="field-hint">environment</dt><dd>${escapeHtml(detail.environment)}</dd></div>
      <div><dt class="field-hint">cost_sms</dt><dd>${detail.costSms}</dd></div>
      <div><dt class="field-hint">external_reference</dt><dd>${escapeHtml(detail.externalReference ?? "—")}</dd></div>
      <div><dt class="field-hint">idempotency_key</dt><dd><code>${escapeHtml(detail.idempotencyKey ?? "—")}</code></dd></div>
      <div><dt class="field-hint">provider_message_id</dt><dd>${escapeHtml(detail.providerMessageId ?? "null")}</dd></div>
      <div><dt class="field-hint">dlr_status</dt><dd>${escapeHtml(detail.dlrStatus ?? "null")}</dd></div>
      <div><dt class="field-hint">created_at</dt><dd>${escapeHtml(formatDate(detail.createdAt))}</dd></div>
      <div><dt class="field-hint">updated_at</dt><dd>${escapeHtml(formatDate(detail.updatedAt))}</dd></div>
    </dl>
    <h3 style="font-size:0.85rem;margin:1rem 0 0.35rem">Mensaje</h3>
    <pre style="white-space:pre-wrap;background:var(--tv-bg);padding:0.75rem;border-radius:6px;font-size:0.85rem">${escapeHtml(detail.message)}</pre>
  </aside>`;
}

export function renderAdminApiUsagePage(
  opts: AdminApiUsagePageOpts,
  ctx: AdminApiUsagePageContext,
): string {
  const flashOk = opts.flash
    ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>`
    : "";
  const flashErr = opts.error
    ? `<div class="alert alert-danger">${escapeHtml(opts.error)}</div>`
    : "";
  const loadErr = ctx.loadError
    ? `<div class="alert alert-warn">${escapeHtml(ctx.loadError)}</div>`
    : "";

  const body = `
    ${flashOk}
    ${flashErr}
    ${loadErr}
    ${renderPageHeader({
      title: "Uso de API",
      subtitle:
        "Monitorea API Keys, solicitudes, errores y mensajes sandbox generados por clientes Telvoice.",
    })}
    ${renderKpis(ctx.stats)}
    ${renderFilters(ctx.filters, ctx.companies)}
    ${renderRateLimitOverridesSection(ctx, ctx.filters)}
    ${renderRequestsTable(ctx.requests, ctx.filters)}
    ${ctx.selectedRequest ? renderRequestDetail(ctx.selectedRequest, ctx.filters) : ""}
    ${renderKeysTable(ctx.keys, ctx.filters)}
    ${renderMessagesTable(ctx.messages, ctx.filters)}
    ${ctx.selectedMessage ? renderMessageDetail(ctx.selectedMessage, ctx.filters) : ""}
    <p class="field-hint" style="margin-top:1.5rem">Sandbox: no envía SMS real ni descuenta saldo. No se muestran secretos ni payloads completos de autenticación.</p>`;

  return wrapAdminPage({
    admin: opts.admin,
    title: "Uso de API",
    body,
    activeNav: "api-usage",
    topbar: opts.smsBalance ? { smsBalance: opts.smsBalance } : undefined,
  });
}
