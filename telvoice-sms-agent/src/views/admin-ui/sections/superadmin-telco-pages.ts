import type { AdminSessionUser } from "../../../types/admin.js";
import type { AuditClassification } from "../../../types/adminDataAudit.js";
import type {
  ClientActionPermission,
  ClientActionPermissions,
} from "../../../types/adminClientActions.js";
import type {
  AdminClientAuditInfo,
  AdminClientListItem,
  AdminClientOperationalDetail,
  AdminClientScope,
  AdminClientStatusFilter,
  AdminClientsScopeSummary,
} from "../../../types/adminClientsList.js";
import type { CompanyRatePlanView } from "../../../services/companyRatePlanService.js";
import type { PanelSmsMessageRow } from "../../../types/sms-panel.js";
import type {
  LiveTestControlPanelView,
  SmsProviderStatusView,
} from "../../../services/smsProviderStatusService.js";
import type {
  SmsProviderRow,
  SmsRatePlanDetailEnriched,
  SmsRatePlanRow,
  SmsRouteWithProvider,
} from "../../../types/sms-routing.js";
import {
  companyRoutingPolicyFromAssignment,
  routingModeFromPlan,
} from "../../../services/smsRouteSelectionService.js";
import { escapeHtml, formatDate, formatDateShort } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderBtn,
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
} from "../page-kit.js";
import { renderSuperadminBanner, statusBadgeSa } from "../superadmin-kit.js";
import { isSuperadminRole } from "../../../types/roles.js";

type BaseOpts = {
  admin: AdminSessionUser;
  smsBalance?: string;
  flash?: string;
  error?: string;
};

function wrap(
  opts: BaseOpts,
  activeNav: string,
  title: string,
  body: string,
): string {
  const alerts = [
    opts.flash ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>` : "",
    opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : "",
  ].join("");
  return wrapAdminPage({
    admin: opts.admin,
    title,
    activeNav,
    body: alerts + body,
    topbar: {
      smsBalance: opts.smsBalance ?? "—",
      routesLabel: "Telco routing",
      routesOk: true,
      companyName: "telvoice · superadmin",
    },
  });
}

function sanitizeApiUrl(url: string | null): string {
  if (!url) return "—";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname !== "/" ? u.pathname : ""}`;
  } catch {
    return escapeHtml(url);
  }
}

function connTypeLabel(type: string): string {
  const m: Record<string, string> = {
    http_api: "HTTP API",
    smpp: "SMPP",
    mock: "Mock",
  };
  return m[type] ?? type;
}

export function renderSaProvidersPage(opts: BaseOpts & {
  providers: SmsProviderRow[];
  providerStatus?: SmsProviderStatusView;
  liveTestControl?: LiveTestControlPanelView;
  tablesReady: boolean;
}): string {
  const lt = opts.liveTestControl;
  const liveTestCard = lt
    ? `<section class="tv-panel" style="margin-bottom:1rem">
      <h2 class="tv-panel__title">Control live_test</h2>
      <div class="tv-panel__body tv-form-grid">
        <div><dt style="font-weight:600">SMS_PROVIDER_MODE</dt><dd><code>${escapeHtml(lt.providerMode)}</code></dd></div>
        <div><dt style="font-weight:600">SMS_LIVE_TEST_ENABLED</dt><dd><code>${lt.liveTestEnabled ? "true" : "false"}</code></dd></div>
        <div><dt style="font-weight:600">Live test activo</dt><dd>${lt.liveTestActive ? statusBadgeSa("activa") : statusBadgeSa("inactivo")}</dd></div>
        <div><dt style="font-weight:600">Empresas autorizadas</dt><dd>${lt.allowedCompaniesCount} · <code>${escapeHtml(lt.maskedCompanyIds.join(", ") || "—")}</code></dd></div>
        <div><dt style="font-weight:600">Números autorizados</dt><dd>${lt.allowedNumbersCount} · <code>${escapeHtml(lt.maskedNumbers.join(", ") || "—")}</code></dd></div>
        <div><dt style="font-weight:600">Límite diario</dt><dd>${lt.dailyLimit} SMS / empresa</dd></div>
        <div><dt style="font-weight:600">Intervalo mínimo</dt><dd>${lt.minSecondsBetweenSends} s</dd></div>
        <div><dt style="font-weight:600">Segmentos máx.</dt><dd>${lt.maxSegments}</dd></div>
        <div><dt style="font-weight:600">Live test cliente hoy</dt><dd>${lt.todayClientLiveTestMessages} mensaje(s) · ${lt.todayClientLiveTestSms} SMS <span class="field-hint">(solo <code>app_send_sms_live_test</code>)</span></dd></div>
        <div><dt style="font-weight:600">Pruebas técnicas Superadmin hoy</dt><dd>${lt.todaySuperadminLiveTestMessages} mensaje(s) · ${lt.todaySuperadminLiveTestSms} SMS</dd></div>
        <div><dt style="font-weight:600">Total live_test global hoy</dt><dd>${lt.todayGlobalLiveTestMessages} mensaje(s) · ${lt.todayGlobalLiveTestSms} SMS <span class="field-hint">(informativo)</span></dd></div>
      </div>
      ${
        lt.recentLiveTests.length
          ? `<div class="table-wrap" style="margin-top:1rem"><table class="tv-table tv-table--compact"><thead><tr>
        <th>Fecha</th><th>Empresa</th><th>Destino</th><th>Estado</th><th>Seg.</th><th>Origen</th><th>Provider ID</th>
      </tr></thead><tbody>${lt.recentLiveTests
        .map(
          (m) => `<tr>
        <td>${formatDate(m.createdAt)}</td>
        <td><code title="${escapeHtml(m.companyId)}">${escapeHtml(m.companyId.slice(0, 8))}…</code></td>
        <td><code>${escapeHtml(m.recipient)}</code></td>
        <td>${statusBadgeSa(m.status)}</td>
        <td>${m.segments}</td>
        <td><code class="tv-code-sm">${escapeHtml(m.source ?? "—")}</code></td>
        <td><code class="tv-code-sm">${escapeHtml((m.providerMessageId ?? "—").slice(0, 14))}</code></td>
      </tr>`,
        )
        .join("")}</tbody></table></div>`
          : `<p class="field-hint">Sin envíos live_test recientes.</p>`
      }
    </section>`
    : "";

  const apiCard = opts.providerStatus
    ? `<section class="tv-panel" style="margin-bottom:1rem">
      <h2 class="tv-panel__title">Estado API (env, sin credenciales)</h2>
      <div class="tv-panel__body tv-form-grid">
        <div><dt style="font-weight:600">Credenciales aSMSC</dt><dd>${opts.providerStatus.asmscConfigured ? statusBadgeSa("activa") : statusBadgeSa("no configurado")}</dd></div>
        <div><dt style="font-weight:600">SMS_PROVIDER_MODE</dt><dd><code>${escapeHtml(opts.providerStatus.providerMode)}</code></dd></div>
        <div><dt style="font-weight:600">Live test panel</dt><dd>${opts.providerStatus.liveTestActive ? statusBadgeSa("activa") : statusBadgeSa("inactivo")}</dd></div>
        <a href="/admin/asmsc/diagnostics" class="btn btn-secondary btn-sm">Diagnóstico aSMSC</a>
        <a href="/admin/sms/send-test" class="btn btn-ghost btn-sm">Envío legacy Superadmin</a>
      </div>
    </section>`
    : "";

  const rows = opts.providers.length
    ? opts.providers
        .map(
          (p) => `<tr>
        <td><strong>${escapeHtml(p.name)}</strong><br><code class="tv-code-sm">${escapeHtml(p.code)}</code></td>
        <td>${escapeHtml(connTypeLabel(p.type))}</td>
        <td>${statusBadgeSa(p.status)}</td>
        <td><code>${sanitizeApiUrl(p.api_base_url)}</code></td>
        <td>${escapeHtml(p.default_sender_id ?? "—")}</td>
        <td>${p.supports_dlr ? "Sí" : "No"}</td>
        <td>${p.supports_unicode ? "Sí" : "No"}</td>
        <td>${Number(p.max_tps ?? 1)} TPS</td>
        <td>
          <a href="/admin/providers/${escapeHtml(p.id)}" class="row-link">Detalle</a>
          <a href="/admin/providers/${escapeHtml(p.id)}/test" class="btn btn-ghost btn-sm">Probar</a>
        </td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="9">Sin proveedores. Aplica migración 014 y ejecuta <code>npm run seed:sms-routing</code> (opcional).</td></tr>`;

  const createForm = `<section class="tv-panel" style="margin-top:1rem">
    <h2 class="tv-panel__title">Nuevo proveedor</h2>
    <form method="post" action="/admin/providers" class="tv-panel__body tv-form-grid">
      <label>Nombre <input name="name" required class="tv-input-full" placeholder="Almuqeet / aSMSC" /></label>
      <label>Código <input name="code" required class="tv-input-full" placeholder="asmsc" /></label>
      <label>Tipo
        <select name="type" class="tv-input-full">
          <option value="http_api">HTTP API</option>
          <option value="smpp">SMPP</option>
          <option value="mock">Mock</option>
        </select>
      </label>
      <label>Base URL (opcional) <input name="api_base_url" class="tv-input-full" placeholder="https://..." /></label>
      <label>Sender ID default <input name="default_sender_id" class="tv-input-full" /></label>
      <button type="submit" class="btn btn-primary">Crear proveedor</button>
    </form>
    <p class="field-hint">Credenciales solo en <code>.env</code> (ASMSC_*). Nunca en base de datos.</p>
  </section>`;

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({ title: "Proveedores SMS", subtitle: "Catálogo telco upstream — control comercial sin credenciales en BD." })}
    ${liveTestCard}
    ${apiCard}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Proveedor</th><th>Conexión</th><th>Estado</th><th>Base URL</th><th>Sender</th><th>DLR</th><th>Unicode</th><th>Vendor TPS</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${createForm}`;
  return wrap(opts, "providers", "Proveedores", body);
}

export function renderSaProviderDetailPage(opts: BaseOpts & {
  provider: SmsProviderRow;
  routes: { id: string; name: string; country: string; status: string }[];
  recentMessages: PanelSmsMessageRow[];
}): string {
  const routeRows = opts.routes.length
    ? opts.routes
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.country)}</td><td>${statusBadgeSa(r.status)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3">Sin rutas asociadas.</td></tr>`;

  const msgRows = opts.recentMessages.length
    ? opts.recentMessages
        .map(
          (m) => `<tr>
        <td>${formatDate(m.created_at)}</td>
        <td>${escapeHtml(m.recipient_number)}</td>
        <td>${statusBadgeSa(m.status)}</td>
        <td><code>${escapeHtml(m.provider_message_id ?? "—")}</code></td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4">Sin mensajes recientes con este proveedor.</td></tr>`;

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({
      title: escapeHtml(opts.provider.name),
      subtitle: `Código ${escapeHtml(opts.provider.code)} · ${connTypeLabel(opts.provider.type)}`,
      actions: `<a href="/admin/providers" class="btn btn-ghost btn-sm">← Proveedores</a>
        <a href="/admin/providers/${escapeHtml(opts.provider.id)}/test" class="btn btn-primary btn-sm">Prueba controlada</a>`,
    })}
    <div class="tv-dash-grid tv-dash-grid--2">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Configuración (no sensible)</h2>
        <dl class="tv-dl">
          <dt>Estado</dt><dd>${statusBadgeSa(opts.provider.status)}</dd>
          <dt>Base URL</dt><dd><code>${sanitizeApiUrl(opts.provider.api_base_url)}</code></dd>
          <dt>Auth</dt><dd><code>${escapeHtml(opts.provider.auth_type)}</code> (variables de entorno)</dd>
          <dt>Sender default</dt><dd>${escapeHtml(opts.provider.default_sender_id ?? "—")}</dd>
          <dt>DLR / Unicode / Flash</dt><dd>${opts.provider.supports_dlr ? "DLR" : "—"} · ${opts.provider.supports_unicode ? "Unicode" : "—"} · ${opts.provider.supports_flash ? "Flash" : "—"}</dd>
          <dt>Prioridad</dt><dd>${opts.provider.priority}</dd>
        </dl>
        <form method="post" action="/admin/providers/${escapeHtml(opts.provider.id)}/traffic" class="tv-form-grid" style="margin-top:1rem">
          <h3 style="grid-column:1/-1;margin:0;font-size:0.95rem">Capacidad vendor (TPS proveedor)</h3>
          <label>Vendor max TPS <input name="max_tps" type="number" step="0.1" min="1" value="${Number(opts.provider.max_tps ?? 1)}" class="tv-input-full" /></label>
          <label>Concurrencia máx. <input name="max_concurrent_requests" type="number" min="1" value="${Number(opts.provider.max_concurrent_requests ?? 1)}" class="tv-input-full" /></label>
          <label>Límite diario <input name="daily_limit" type="number" min="0" value="${opts.provider.daily_limit ?? ""}" class="tv-input-full" placeholder="Opcional" /></label>
          <label>Límite mensual <input name="monthly_limit" type="number" min="0" value="${opts.provider.monthly_limit ?? ""}" class="tv-input-full" placeholder="Opcional" /></label>
          <label>Failure threshold % <input name="failure_threshold_percent" type="number" step="0.1" value="${Number(opts.provider.failure_threshold_percent ?? 20)}" class="tv-input-full" /></label>
          <label class="tv-checkbox"><input type="checkbox" name="auto_pause_on_failure" value="1" ${opts.provider.auto_pause_on_failure ? "checked" : ""} /> Auto pause on failure</label>
          <button type="submit" class="btn btn-secondary">Guardar límites vendor</button>
        </form>
        <div class="tv-quick-actions" style="margin-top:0.75rem">
          <form method="post" action="/admin/providers/${escapeHtml(opts.provider.id)}/pause" style="display:inline"><button type="submit" class="btn btn-ghost btn-sm">Pausar proveedor</button></form>
        </div>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Rutas asociadas</h2>
        <table class="tv-table tv-table--compact"><thead><tr><th>Nombre</th><th>País</th><th>Estado</th></tr></thead><tbody>${routeRows}</tbody></table>
        <p style="margin-top:0.75rem"><a href="/admin/routes" class="btn btn-secondary btn-sm">Route Manager</a></p>
      </section>
    </div>
    <section class="tv-panel">
      <h2 class="tv-panel__title">Últimos mensajes (referencia)</h2>
      <table class="tv-table tv-table--compact"><thead><tr><th>Fecha</th><th>Destino</th><th>Estado</th><th>Provider msg id</th></tr></thead><tbody>${msgRows}</tbody></table>
    </section>`;
  return wrap(opts, "providers", "Detalle proveedor", body);
}

export function renderSaProviderTestPage(opts: BaseOpts & {
  provider: SmsProviderRow;
  routes: { id: string; name: string; country: string }[];
  testResult?: { messageId: string; providerMessageId: string };
  error?: string;
}): string {
  const routeOpts = opts.routes
    .map(
      (r) =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)} (${escapeHtml(r.country)})</option>`,
    )
    .join("");

  const resultBlock = opts.testResult
    ? `<div class="alert alert-success">Envío aceptado. Mensaje: <code>${escapeHtml(opts.testResult.messageId)}</code> · Provider ID: <code>${escapeHtml(opts.testResult.providerMessageId || "—")}</code></div>`
    : "";

  const errBlock = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : "";

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Prueba controlada",
      subtitle: `${escapeHtml(opts.provider.name)} — máx. 1 destinatario, sin débito wallet cliente`,
      actions: `<a href="/admin/providers/${escapeHtml(opts.provider.id)}" class="btn btn-ghost btn-sm">← Detalle</a>`,
    })}
    ${resultBlock}${errBlock}
    <section class="tv-panel">
      <form method="post" action="/admin/providers/${escapeHtml(opts.provider.id)}/test" class="tv-panel__body tv-form-grid">
        <label>Ruta <select name="route_id" required class="tv-input-full">${routeOpts || '<option value="">Sin rutas activas</option>'}</select></label>
        <label>Destino (+56…) <input name="to" required class="tv-input-full" placeholder="+56912345678" /></label>
        <label>Sender ID <input name="sender_id" class="tv-input-full" value="${escapeHtml(opts.provider.default_sender_id ?? "TELVOICE")}" /></label>
        <label>Mensaje <textarea name="message" required class="tv-input-full" rows="3">Prueba Telvoice Superadmin</textarea></label>
        <label class="tv-checkbox"><input type="checkbox" name="confirm" value="1" required /> Entiendo que este envío puede salir por una ruta real.</label>
        <button type="submit" class="btn btn-primary" ${opts.routes.length ? "" : "disabled"}>Enviar 1 SMS real</button>
      </form>
      <p class="field-hint">metadata.source = superadmin_provider_test · company demo · no descuenta wallet.</p>
    </section>`;
  return wrap(opts, "providers", "Prueba proveedor", body);
}

export function renderSaRoutesPage(opts: BaseOpts & {
  routes: SmsRouteWithProvider[];
  providers: SmsProviderRow[];
  tablesReady: boolean;
}): string {
  const rows = opts.routes.length
    ? opts.routes
        .map(
          (r) => `<tr>
        <td>${escapeHtml(r.country)}</td>
        <td>${escapeHtml(r.mcc ?? "—")}</td>
        <td>${escapeHtml(r.mnc ?? "—")}</td>
        <td>${escapeHtml(r.operator_name ?? "—")}</td>
        <td>${escapeHtml(r.provider_name ?? r.provider_code ?? "—")}</td>
        <td>${escapeHtml(r.route_type)}</td>
        <td>${escapeHtml(r.traffic_type)}</td>
        <td>${r.priority}</td>
        <td>${r.cost_per_sms} ${escapeHtml(r.currency)}</td>
        <td>${statusBadgeSa(r.status)}</td>
        <td>${r.dlr_enabled ? "Sí" : "No"}</td>
        <td>${Number(r.max_tps ?? 1)}</td>
        <td>
          <form method="post" action="/admin/routes/${escapeHtml(r.id)}/traffic" class="tv-form-inline" style="display:flex;gap:0.25rem;align-items:center;flex-wrap:wrap;margin-bottom:0.25rem">
            <label style="font-size:0.75rem">TPS <input name="max_tps" type="number" step="0.1" min="1" value="${Number(r.max_tps ?? 1)}" style="width:3.5rem" /></label>
            <label style="font-size:0.75rem">Conc. <input name="max_concurrent_requests" type="number" min="1" value="${Number(r.max_concurrent_requests ?? 1)}" style="width:3rem" /></label>
            <button type="submit" class="btn btn-ghost btn-sm">TPS</button>
          </form>
          <form method="post" action="/admin/routes/${escapeHtml(r.id)}/status" style="display:inline">
            <input type="hidden" name="status" value="${r.status === "active" ? "inactive" : "active"}" />
            <button type="submit" class="btn btn-ghost btn-sm">${r.status === "active" ? "Desactivar" : "Activar"}</button>
          </form>
          ${r.status === "paused" ? `<form method="post" action="/admin/routes/${escapeHtml(r.id)}/resume" style="display:inline"><button type="submit" class="btn btn-ghost btn-sm">Reanudar</button></form>` : `<form method="post" action="/admin/routes/${escapeHtml(r.id)}/pause" style="display:inline"><button type="submit" class="btn btn-ghost btn-sm">Pausar</button></form>`}
        </td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="12">Sin rutas. Cree una ruta o ejecute el seed.</td></tr>`;

  const provOpts = opts.providers
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.code)})</option>`,
    )
    .join("");

  const createForm = `<section class="tv-panel" style="margin-top:1rem">
    <h2 class="tv-panel__title">Nueva ruta</h2>
    <form method="post" action="/admin/routes" class="tv-panel__body tv-form-grid">
      <label>Proveedor <select name="provider_id" required class="tv-input-full">${provOpts}</select></label>
      <label>Nombre <input name="name" required class="tv-input-full" /></label>
      <label>País <input name="country" value="CL" class="tv-input-full" /></label>
      <label>Operador <input name="operator_name" class="tv-input-full" placeholder="Movistar / Default" /></label>
      <label>Tipo ruta
        <select name="route_type" class="tv-input-full">
          <option value="hq">HQ</option>
          <option value="direct">Direct</option>
          <option value="economy">Economy</option>
          <option value="transactional">Transactional</option>
          <option value="promotional">Promotional</option>
        </select>
      </label>
      <label>Tráfico
        <select name="traffic_type" class="tv-input-full">
          <option value="transactional">Transactional</option>
          <option value="promotional">Promotional</option>
          <option value="otp">OTP</option>
        </select>
      </label>
      <label>Costo/SMS <input name="cost_per_sms" type="number" step="0.0001" value="0" class="tv-input-full" /></label>
      <label>Moneda costo <input name="currency" value="USD" class="tv-input-full" /></label>
      <label class="tv-checkbox"><input type="checkbox" name="is_default" value="1" /> Ruta default CL</label>
      <button type="submit" class="btn btn-primary">Crear ruta</button>
    </form>
  </section>`;

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({ title: "Route Manager", subtitle: "Rutas por país, operador, proveedor, costo y prioridad." })}
    <div class="table-wrap tv-panel"><table class="tv-table tv-table--compact"><thead><tr>
      <th>País</th><th>MCC</th><th>MNC</th><th>Operador</th><th>Proveedor</th><th>Tipo</th><th>Tráfico</th><th>Prio.</th><th>Costo</th><th>Estado</th><th>DLR</th><th>Max TPS</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${createForm}`;
  return wrap(opts, "routes", "Rutas SMS", body);
}

export function renderSaRatePlansPage(opts: BaseOpts & {
  ratePlans: SmsRatePlanRow[];
}): string {
  const rows = opts.ratePlans.length
    ? opts.ratePlans
        .map(
          (p) => `<tr>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td><code>${escapeHtml(p.code)}</code></td>
        <td>${escapeHtml(p.currency)}</td>
        <td>${statusBadgeSa(p.status)}</td>
        <td>${Number(p.default_tps ?? 1)} TPS</td>
        <td>${formatDate(p.created_at)}</td>
        <td><a href="/admin/rate-plans/${escapeHtml(p.id)}" class="row-link">Detalle</a></td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6">Sin rate plans.</td></tr>`;

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({ title: "Planes tarifarios", subtitle: "Rate plans comerciales — precio venta, costo y margen por ruta." })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Nombre</th><th>Código</th><th>Moneda</th><th>Estado</th><th>Default TPS</th><th>Creado</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Nuevo rate plan</h2>
      <form method="post" action="/admin/rate-plans" class="tv-panel__body tv-form-grid">
        <label>Nombre <input name="name" required class="tv-input-full" placeholder="TELVOICE CL Retail" /></label>
        <label>Código <input name="code" required class="tv-input-full" placeholder="TELVOICE_CL_RETAIL" /></label>
        <label>Moneda <input name="currency" value="CLP" class="tv-input-full" /></label>
        <label>Descripción <input name="description" class="tv-input-full" /></label>
        <button type="submit" class="btn btn-primary">Crear plan</button>
      </form>
    </section>`;
  return wrap(opts, "rate-plans", "Rate Plans", body);
}

export function renderSaRatePlanDetailPage(opts: BaseOpts & {
  ratePlan: SmsRatePlanRow;
  details: SmsRatePlanDetailEnriched[];
  routes: SmsRouteWithProvider[];
}): string {
  const rows = opts.details.length
    ? opts.details
        .map((d) => {
          const margin =
            d.margin != null
              ? Number(d.margin)
              : Number(d.sell_price_per_sms) - Number(d.cost_price_per_sms);
          const weight = Number(d.metadata?.weight ?? 100);
          const routeSelected = (rid: string) =>
            d.route_id === rid ? " selected" : "";
          const routeOptions = opts.routes
            .map(
              (r) =>
                `<option value="${escapeHtml(r.id)}"${routeSelected(r.id)}>${escapeHtml(r.name)} — ${escapeHtml(r.provider_name ?? "")}</option>`,
            )
            .join("");
          return `<tr>
        <td>${escapeHtml(d.mcc ?? "—")}</td>
        <td>${escapeHtml(d.mnc ?? "—")}</td>
        <td>${escapeHtml(d.country)}</td>
        <td>${escapeHtml(d.operator_name ?? "—")}</td>
        <td>${escapeHtml(d.traffic_type)}</td>
        <td>${escapeHtml(d.route?.name ?? "—")}</td>
        <td>${escapeHtml(d.provider?.name ?? d.provider?.code ?? "—")}</td>
        <td>${weight}</td>
        <td>${d.cost_price_per_sms}</td>
        <td>${d.sell_price_per_sms}</td>
        <td>${margin.toFixed(4)}</td>
        <td>${escapeHtml(d.currency)}</td>
        <td>${statusBadgeSa(d.status)}</td>
        <td style="min-width:12rem">
          <details>
            <summary class="btn btn-ghost btn-sm" style="cursor:pointer">Editar</summary>
            <form method="post" action="/admin/rate-plans/${escapeHtml(opts.ratePlan.id)}/details/${escapeHtml(d.id)}" class="tv-form-grid" style="margin-top:0.5rem;padding:0.5rem;background:var(--surface-2,#f8fafc)">
              <label>Ruta <select name="route_id" class="tv-input-full">${routeOptions}</select></label>
              <label>País <input name="country" value="${escapeHtml(d.country)}" class="tv-input-full" /></label>
              <label>Tipo <select name="traffic_type" class="tv-input-full">
                <option value="transactional"${d.traffic_type === "transactional" ? " selected" : ""}>Transactional</option>
                <option value="promotional"${d.traffic_type === "promotional" ? " selected" : ""}>Promotional</option>
              </select></label>
              <label>Peso <input name="route_weight" type="number" min="1" value="${weight}" class="tv-input-full" /></label>
              <label>Venta <input name="sell_price_per_sms" type="number" step="0.0001" value="${d.sell_price_per_sms}" class="tv-input-full" /></label>
              <label>Costo <input name="cost_price_per_sms" type="number" step="0.0001" value="${d.cost_price_per_sms}" class="tv-input-full" /></label>
              <label>Moneda <input name="currency" value="${escapeHtml(d.currency)}" class="tv-input-full" /></label>
              <label>Estado <select name="status" class="tv-input-full">
                <option value="active"${d.status === "active" ? " selected" : ""}>active</option>
                <option value="inactive"${d.status === "inactive" ? " selected" : ""}>inactive</option>
              </select></label>
              <button type="submit" class="btn btn-primary btn-sm">Guardar</button>
            </form>
          </details>
          ${d.status === "active" ? `<form method="post" action="/admin/rate-plans/${escapeHtml(opts.ratePlan.id)}/details/${escapeHtml(d.id)}/deactivate" style="margin-top:0.25rem"><button type="submit" class="btn btn-ghost btn-sm">Desactivar</button></form>` : ""}
        </td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="14">Sin tarifas. Agregue un detalle abajo.</td></tr>`;

  const routeOpts = opts.routes
    .filter((r) => r.status === "active")
    .map(
      (r) =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)} — ${escapeHtml(r.provider_name ?? "")} (${escapeHtml(r.country)})</option>`,
    )
    .join("");

  const routingMode = routingModeFromPlan(opts.ratePlan);
  const modeOpts = (value: string, label: string) =>
    `<option value="${value}"${routingMode === value ? " selected" : ""}>${label}</option>`;

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({
      title: escapeHtml(opts.ratePlan.name),
      subtitle: `Código ${escapeHtml(opts.ratePlan.code)} · modo ${escapeHtml(routingMode)}`,
      actions: `<a href="/admin/rate-plans" class="btn btn-ghost btn-sm">← Planes</a>`,
    })}
    <form method="post" action="/admin/rate-plans/${escapeHtml(opts.ratePlan.id)}/traffic" class="tv-panel tv-form-grid" style="margin-bottom:1rem;padding:1rem">
      <h2 class="tv-panel__title" style="grid-column:1/-1">Política routing del plan</h2>
      <label>Modo distribución
        <select name="routing_mode" class="tv-input-full">
          ${modeOpts("single", "Single — una ruta (default o prioridad)")}
          ${modeOpts("weighted", "Weighted — reparto aleatorio por peso")}
          ${modeOpts("round_robin", "Round robin — reparto secuencial por peso")}
        </select>
      </label>
      <label>Default TPS <input name="default_tps" type="number" step="0.1" min="1" value="${Number(opts.ratePlan.default_tps ?? 1)}" class="tv-input-full" /></label>
      <label>Límite diario <input name="daily_limit" type="number" value="${opts.ratePlan.daily_limit ?? ""}" class="tv-input-full" placeholder="Opcional" /></label>
      <label>Límite mensual <input name="monthly_limit" type="number" value="${opts.ratePlan.monthly_limit ?? ""}" class="tv-input-full" placeholder="Opcional" /></label>
      <button type="submit" class="btn btn-secondary">Guardar política</button>
      <p class="field-hint" style="grid-column:1/-1">Para repartir entre 3 proveedores CL, use weighted/round_robin y agregue 3 detalles con pesos (ej. 34/33/33).</p>
    </form>
    <div class="table-wrap tv-panel"><table class="tv-table tv-table--compact"><thead><tr>
      <th>MCC</th><th>MNC</th><th>País</th><th>Operador</th><th>Tipo SMS</th><th>Ruta</th><th>Proveedor</th><th>Peso</th><th>Costo</th><th>Venta</th><th>Margen</th><th>Moneda</th><th>Estado</th><th>Acciones</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Agregar tarifa</h2>
      <form method="post" action="/admin/rate-plans/${escapeHtml(opts.ratePlan.id)}/details" class="tv-panel__body tv-form-grid">
        <label>Ruta <select name="route_id" required class="tv-input-full">${routeOpts}</select></label>
        <label>País <input name="country" value="CL" class="tv-input-full" /></label>
        <label>Operador <input name="operator_name" class="tv-input-full" /></label>
        <label>Tipo tráfico <select name="traffic_type" class="tv-input-full"><option value="transactional">Transactional</option><option value="promotional">Promotional</option></select></label>
        <label>Peso reparto <input name="route_weight" type="number" min="1" value="100" class="tv-input-full" /></label>
        <label>Precio venta/SMS <input name="sell_price_per_sms" type="number" step="0.0001" value="1" required class="tv-input-full" /></label>
        <label>Costo ref./SMS <input name="cost_price_per_sms" type="number" step="0.0001" value="0" class="tv-input-full" /></label>
        <label>Moneda <input name="currency" value="${escapeHtml(opts.ratePlan.currency)}" class="tv-input-full" /></label>
        <button type="submit" class="btn btn-primary">Agregar</button>
      </form>
    </section>`;
  return wrap(opts, "rate-plans", "Detalle rate plan", body);
}

const CLIENT_SCOPE_LABELS: Record<AdminClientScope, string> = {
  real: "Producción real",
  internal: "Interno Telvoice",
  qa: "QA/Test",
  review: "Revisión requerida",
  all: "Todos",
};

function auditClassificationBadge(audit: AdminClientAuditInfo): string {
  const variantMap: Record<AuditClassification, string> = {
    PROD_REAL: "success",
    PROD_INTERNAL: "ok",
    QA_TEST: "warn",
    DEMO_SEED: "warn",
    ORPHAN: "err",
    REVIEW_REQUIRED: "warn",
  };
  const variant = variantMap[audit.classification] ?? "muted";
  const parts = [
    `<span class="badge badge-${variant}">${escapeHtml(audit.classification)}</span>`,
  ];
  if (audit.protected) {
    parts.push(`<span class="badge badge-success">protected</span>`);
  }
  if (audit.reason) {
    parts.push(
      `<span class="field-hint" title="${escapeHtml(audit.reason)}">${escapeHtml(audit.reason.slice(0, 48))}${audit.reason.length > 48 ? "…" : ""}</span>`,
    );
  }
  return parts.join(" ");
}

function renderClientsScopeOptions(scope: AdminClientScope): string {
  return (Object.keys(CLIENT_SCOPE_LABELS) as AdminClientScope[])
    .map(
      (key) =>
        `<option value="${key}"${key === scope ? " selected" : ""}>${escapeHtml(CLIENT_SCOPE_LABELS[key])}</option>`,
    )
    .join("");
}

const CLIENT_STATUS_LABELS: Record<AdminClientStatusFilter, string> = {
  "": "Todos los estados",
  active: "Activo",
  suspended: "Suspendido",
  no_balance: "Sin saldo",
  has_balance: "Con saldo",
  no_rate_plan: "Sin rate plan",
  activity_today: "Con actividad hoy",
  no_activity: "Sin actividad",
  protected: "Protegidos",
};

function abbreviateCompanyId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function renderApiAccessStatusBadge(item: AdminClientListItem): string {
  const flags = item.operational.operationalFlags;
  if (flags.apiPending) {
    return `<span class="badge badge-warn tv-api-access-badge" data-state="pending">API pendiente</span>`;
  }
  if (flags.apiActive && flags.hasApprovedProductionKey) {
    return `<span class="badge badge-ok tv-api-access-badge" data-state="active">API activa</span>`;
  }
  if (flags.apiActive && !flags.hasProductionApiKey) {
    return `<span class="badge badge-warn tv-api-access-badge" data-state="no-key">API sin key</span>`;
  }
  if (flags.apiActive) {
    return `<span class="badge badge-warn tv-api-access-badge" data-state="approval">API activa · key pendiente</span>`;
  }
  return `<span class="badge badge-muted tv-api-access-badge" data-state="inactive">API inactiva</span>`;
}

function renderApiAccessSwitch(item: AdminClientListItem, canToggle: boolean): string {
  const flags = item.operational.operationalFlags;
  const companyId = item.company.id;
  const checked = flags.apiActive ? " checked" : "";
  const disabled = canToggle ? "" : " disabled";
  return `<div class="tv-api-access-row" data-company-id="${escapeHtml(companyId)}">
    <label class="tv-api-switch" title="API productiva">
      <input type="checkbox" class="tv-api-switch__input"${checked}${disabled} aria-label="API productiva" />
      <span class="tv-api-switch__slider" aria-hidden="true"></span>
      <span class="tv-api-switch__label">API productiva</span>
    </label>
    ${renderApiAccessStatusBadge(item)}
    <span class="tv-api-access-feedback field-hint" aria-live="polite"></span>
  </div>`;
}

function renderOperationalStatusBadges(item: AdminClientListItem, canToggleApi: boolean): string {
  const flags = item.operational.operationalFlags;
  const parts: string[] = [];
  if (item.company.status === "active") {
    parts.push(`<span class="badge badge-success">ACTIVO</span>`);
  } else if (item.company.status === "suspended") {
    parts.push(`<span class="badge badge-warn">SUSPENDIDO</span>`);
  } else {
    parts.push(statusBadgeSa(item.company.status));
  }
  if (flags.isProtected) {
    parts.push(`<span class="badge badge-success">PROTEGIDO</span>`);
  }
  if (flags.hasPaidPendingCredit) {
    parts.push(`<span class="badge badge-err">POR ACREDITAR</span>`);
  }
  if (!flags.hasBalance) parts.push(`<span class="badge badge-warn">SIN SALDO</span>`);
  if (!flags.hasRatePlan) parts.push(`<span class="badge badge-warn">SIN PLAN</span>`);
  if (flags.needsReview) parts.push(`<span class="badge badge-warn">REVIEW</span>`);
  return `<div class="tv-clients-status-cell">
    <div class="tv-clients-status-badges">${parts.join("")}</div>
    ${renderApiAccessSwitch(item, canToggleApi)}
  </div>`;
}

function renderClientTableCell(item: AdminClientListItem): string {
  const c = item.company;
  const email = c.billing_email ?? c.name;
  return `<div class="tv-clients-cell tv-clients-cell--client">
    <strong class="tv-clients-name">${escapeHtml(c.name)}</strong>
    <span class="tv-clients-secondary tv-cell-truncate" title="${escapeHtml(email)}">${escapeHtml(email)}</span>
    <span class="tv-clients-muted">${escapeHtml(c.country ?? "CL")}</span>
    <div class="tv-clients-badges">${clientScopeBadges(item.audit)}</div>
    <code class="tv-code-sm tv-clients-id" title="${escapeHtml(c.id)}">${escapeHtml(abbreviateCompanyId(c.id))}</code>
  </div>`;
}

function renderBalanceTableCell(item: AdminClientListItem): string {
  const w = item.operational.wallet;
  const walletBadge = w.hasWallet
    ? `<span class="badge badge-${w.status === "active" ? "success" : "warn"}">${escapeHtml((w.status ?? "—").toUpperCase())}</span>`
    : `<span class="badge badge-warn">SIN WALLET</span>`;
  return `<div class="tv-clients-cell tv-clients-cell--balance">
    <div class="tv-clients-metric">${w.availableSms.toLocaleString("es-CL")} <span class="tv-clients-metric-unit">SMS</span></div>
    <span class="tv-clients-secondary">Comprado ${w.totalPurchasedSms.toLocaleString("es-CL")} · Usado ${w.consumedSms.toLocaleString("es-CL")} · Res ${w.reservedSms.toLocaleString("es-CL")}</span>
    <span class="tv-clients-muted">Wallet ${walletBadge}</span>
  </div>`;
}

function renderUsageTableCell(item: AdminClientListItem): string {
  const u = item.operational.usage;
  const failed =
    u.failedLast24h > 0
      ? `<span class="tv-clients-warn">Fallidos 24h: ${u.failedLast24h}</span>`
      : `<span class="tv-clients-muted">Fallidos 24h: 0</span>`;
  return `<div class="tv-clients-cell tv-clients-cell--usage">
    <span class="tv-clients-secondary">Hoy <strong>${u.smsToday.toLocaleString("es-CL")}</strong> · Mes <strong>${u.smsThisMonth.toLocaleString("es-CL")}</strong></span>
    <span class="tv-clients-muted">Último: ${escapeHtml(formatRelativeTime(u.lastSmsAt))}</span>
    ${failed}
  </div>`;
}

function renderPurchaseTableCell(item: AdminClientListItem): string {
  const p = item.operational.purchases;
  if (!p.lastPurchaseAt && p.ordersCount === 0) {
    return `<div class="tv-clients-cell"><span class="tv-clients-muted">Sin compras</span><br><span class="tv-clients-muted">Sin factura</span></div>`;
  }
  const lastPurchase = p.lastPurchaseAt
    ? formatDateShort(p.lastPurchaseAt)
    : "Sin datos";
  const invoice = p.lastInvoiceNumber
    ? `<code class="tv-code-sm tv-cell-truncate" title="${escapeHtml(p.lastInvoiceNumber)}">${escapeHtml(p.lastInvoiceNumber)}</code>`
    : `<span class="tv-clients-muted">Sin factura</span>`;
  const pending =
    p.paidPendingCreditCount > 0
      ? `<span class="badge badge-err">${p.paidPendingCreditCount} por acreditar</span>`
      : "";
  return `<div class="tv-clients-cell tv-clients-cell--purchase">
    <span class="tv-clients-secondary">Última: ${escapeHtml(lastPurchase)}</span>
    <span class="tv-clients-muted">Factura: ${invoice}</span>
    <span class="tv-clients-muted">Pagadas ${p.paidOrdersCount}/${p.ordersCount}</span>
    ${pending}
  </div>`;
}

function renderRatePlanTableCell(item: AdminClientListItem): string {
  const op = item.operational;
  const id = item.company.id;
  if (op.ratePlanName) {
    return `<div class="tv-clients-cell tv-clients-cell--plan">
      <strong class="tv-clients-plan-name">${escapeHtml(op.ratePlanName)}</strong>
      <code class="tv-code-sm">${escapeHtml(op.ratePlanCode ?? "")}</code>
      <a href="/admin/wallets/${escapeHtml(id)}" class="row-link tv-clients-link">Cambiar</a>
    </div>`;
  }
  return `<div class="tv-clients-cell tv-clients-cell--plan">
    <span class="badge badge-warn">Sin rate plan</span>
    <a href="/admin/wallets/${escapeHtml(id)}" class="row-link tv-clients-link">Asignar</a>
  </div>`;
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "Sin datos";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "ahora";
  if (diffMins < 60) return `hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `hace ${diffDays} d`;
  return formatDateShort(value);
}

function clientScopeBadges(audit: AdminClientAuditInfo): string {
  const parts: string[] = [];
  const variantMap: Record<AuditClassification, string> = {
    PROD_REAL: "success",
    PROD_INTERNAL: "ok",
    QA_TEST: "warn",
    DEMO_SEED: "warn",
    ORPHAN: "err",
    REVIEW_REQUIRED: "warn",
  };
  const variant = variantMap[audit.classification] ?? "muted";
  parts.push(
    `<span class="badge badge-${variant}">${escapeHtml(audit.classification)}</span>`,
  );
  if (audit.protected) {
    parts.push(`<span class="badge badge-success">protected</span>`);
  }
  return parts.join(" ");
}

function renderClientsStatusOptions(status: AdminClientStatusFilter): string {
  return (Object.keys(CLIENT_STATUS_LABELS) as AdminClientStatusFilter[])
    .map(
      (key) =>
        `<option value="${escapeHtml(key)}"${key === status ? " selected" : ""}>${escapeHtml(CLIENT_STATUS_LABELS[key])}</option>`,
    )
    .join("");
}

function buildClientsFilterQuery(
  scope: AdminClientScope,
  search: string,
  status: AdminClientStatusFilter,
  page?: number,
): string {
  const params = new URLSearchParams();
  if (scope !== "real") params.set("scope", scope);
  if (search) params.set("q", search);
  if (status) params.set("status", status);
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function actionBlockedHint(perm: ClientActionPermission): string {
  if (perm.allowed) return "";
  return `<span class="field-hint" title="${escapeHtml(perm.reason ?? "")}"> (${escapeHtml(perm.reason ?? "bloqueado")})</span>`;
}

function renderDryRunCheckbox(): string {
  return `<label class="tv-checkbox" style="display:block;margin:0.35rem 0"><input type="checkbox" name="dry_run" value="1" /> Dry-run (simular)</label>`;
}

function renderProtectedOverrideCheckbox(perm: ClientActionPermission): string {
  if (!perm.needsProtectedOverride) return "";
  return `<label class="tv-checkbox" style="display:block;margin:0.35rem 0"><input type="checkbox" name="protected_override" value="1" required /> Confirmo override en cliente protected</label>`;
}

function renderClientSafeActionsPanel(
  companyId: string,
  detail: AdminClientOperationalDetail,
  perms: ClientActionPermissions,
): string {
  const c = detail.company;
  const archived = Boolean(detail.audit.archivedAt);
  const archivedNote = archived
    ? `<div class="alert alert-warn">Cuenta archivada el ${escapeHtml(formatDateShort(detail.audit.archivedAt!))}. Acciones limitadas.</div>`
    : "";

  const profileFields = perms.updateProfile.allowed
    ? `<form method="post" action="/admin/clients/${escapeHtml(companyId)}/actions/update-profile" class="tv-panel" style="padding:0.75rem;margin-bottom:0.75rem">
        <h3 class="tv-panel__title" style="font-size:1rem">Editar datos de cuenta</h3>
        <p class="field-hint">Estado actual: ${statusBadgeSa(c.status)} · ${escapeHtml(c.country)}</p>
        ${c.status !== "suspended" ? "" : `<p class="field-hint">Envío suspendido — usa Reactivar envío para revertir.</p>`}
        <label class="field-label">Nombre empresa</label>
        <input class="input" name="name" value="${escapeHtml(c.name)}" ${detail.audit.protected ? "readonly title=\"Protected: no editable\"" : ""} style="width:100%;margin-bottom:0.5rem" />
        <label class="field-label">Email facturación</label>
        <input class="input" name="billing_email" value="${escapeHtml(c.billing_email ?? "")}" ${detail.audit.protected ? "readonly" : ""} style="width:100%;margin-bottom:0.5rem" />
        <label class="field-label">País</label>
        <input class="input" name="country" value="${escapeHtml(c.country)}" maxlength="2" style="width:6rem;margin-bottom:0.5rem" />
        <label class="field-label">Contacto</label>
        <input class="input" name="contact_name" value="${escapeHtml(c.contact_name ?? "")}" style="width:100%;margin-bottom:0.5rem" />
        <label class="field-label">Teléfono</label>
        <input class="input" name="contact_phone" value="${escapeHtml(c.contact_phone ?? "")}" style="width:100%;margin-bottom:0.5rem" />
        ${detail.audit.protected ? `<p class="field-hint">Protected: solo contacto y país editables.</p>` : ""}
        <label class="tv-checkbox" style="display:block;margin:0.35rem 0"><input type="checkbox" name="confirm_edit" value="1" required /> Confirmo editar datos de esta cuenta</label>
        ${renderDryRunCheckbox()}
        ${renderBtn("Guardar datos", { type: "submit", variant: "secondary", size: "sm" })}
      </form>`
    : `<p class="field-hint">Editar datos: ${escapeHtml(perms.updateProfile.reason ?? "no permitido")}</p>`;

  const suspendForm = perms.suspendSending.allowed
    ? `<form method="post" action="/admin/clients/${escapeHtml(companyId)}/actions/suspend-sending" class="tv-panel" style="padding:0.75rem;margin-bottom:0.75rem">
        <h3 class="tv-panel__title" style="font-size:1rem">Suspender envío SMS</h3>
        <p class="field-hint">Marca la cuenta como suspendida. No modifica saldo ni órdenes.</p>
        <label class="field-label">Confirmación literal</label>
        <input class="input" name="confirmation" placeholder="SUSPENDER ENVIO ${escapeHtml(companyId)}" required autocomplete="off" style="width:100%;margin-bottom:0.5rem" />
        ${renderProtectedOverrideCheckbox(perms.suspendSending)}
        ${renderDryRunCheckbox()}
        ${renderBtn("Suspender envío", { type: "submit", variant: "secondary", size: "sm" })}
      </form>`
    : `<p class="field-hint">Suspender envío${actionBlockedHint(perms.suspendSending)}</p>`;

  const reactivateForm = perms.reactivateSending.allowed
    ? `<form method="post" action="/admin/clients/${escapeHtml(companyId)}/actions/reactivate-sending" class="tv-panel" style="padding:0.75rem;margin-bottom:0.75rem">
        <h3 class="tv-panel__title" style="font-size:1rem">Reactivar envío SMS</h3>
        <label class="field-label">Confirmación literal</label>
        <input class="input" name="confirmation" placeholder="REACTIVAR ENVIO ${escapeHtml(companyId)}" required autocomplete="off" style="width:100%;margin-bottom:0.5rem" />
        ${renderProtectedOverrideCheckbox(perms.reactivateSending)}
        ${renderDryRunCheckbox()}
        ${renderBtn("Reactivar envío", { type: "submit", variant: "primary", size: "sm" })}
      </form>`
    : `<p class="field-hint">Reactivar envío${actionBlockedHint(perms.reactivateSending)}</p>`;

  const welcomeForm = perms.resendWelcome.allowed
    ? `<form method="post" action="/admin/clients/${escapeHtml(companyId)}/actions/resend-welcome" class="tv-panel" style="padding:0.75rem;margin-bottom:0.75rem">
        <h3 class="tv-panel__title" style="font-size:1rem">Reenviar bienvenida</h3>
        <p class="field-hint">Orden acreditada requerida. Registra email_log.</p>
        <label class="field-label">Confirmación literal</label>
        <input class="input" name="confirmation" placeholder="REENVIAR BIENVENIDA ${escapeHtml(companyId)}" required autocomplete="off" style="width:100%;margin-bottom:0.5rem" />
        <label class="tv-checkbox" style="display:block;margin:0.35rem 0"><input type="checkbox" name="test_mode" value="1" /> Modo test (QA)</label>
        ${renderDryRunCheckbox()}
        ${renderBtn("Reenviar bienvenida", { type: "submit", variant: "secondary", size: "sm" })}
      </form>`
    : `<p class="field-hint">Reenviar bienvenida${actionBlockedHint(perms.resendWelcome)}</p>`;

  const invoiceOptions = detail.recentInvoices
    .map(
      (inv) =>
        `<option value="${escapeHtml(inv.id)}">${escapeHtml(inv.invoiceNumber)} — ${escapeHtml(inv.status)} — ${inv.totalAmount.toLocaleString("es-CL")}</option>`,
    )
    .join("");

  const receiptForm = perms.resendReceipt.allowed
    ? `<form method="post" action="/admin/clients/${escapeHtml(companyId)}/actions/resend-receipt" class="tv-panel" style="padding:0.75rem;margin-bottom:0.75rem">
        <h3 class="tv-panel__title" style="font-size:1rem">Reenviar comprobante</h3>
        <p class="field-hint">Selecciona factura existente. Reenvío (<code>is_resend=true</code>). No genera comprobante nuevo. Modo email: mock o Resend según <code>BILLING_EMAIL_MODE</code>.</p>
        <label class="field-label">Comprobante / factura</label>
        <select name="invoice_id" class="input" required style="width:100%;margin-bottom:0.5rem">
          <option value="">— Seleccionar —</option>
          ${invoiceOptions}
        </select>
        ${detail.recentInvoices.length === 0 ? `<p class="field-hint">Sin facturas en esta cuenta.</p>` : ""}
        <label class="field-label">Confirmación literal</label>
        <input class="input" name="confirmation" placeholder="REENVIAR COMPROBANTE &lt;número factura&gt;" required autocomplete="off" style="width:100%;margin-bottom:0.5rem" />
        <p class="field-hint">Usa el número de la factura seleccionada (columna «Número» abajo).</p>
        ${renderDryRunCheckbox()}
        ${renderBtn("Reenviar comprobante", { type: "submit", variant: "secondary", size: "sm", disabled: detail.recentInvoices.length === 0 })}
      </form>`
    : `<p class="field-hint">Reenviar comprobante${actionBlockedHint(perms.resendReceipt)}</p>`;

  const archiveForm = perms.archiveQa.allowed
    ? `<form method="post" action="/admin/clients/${escapeHtml(companyId)}/actions/archive-qa" class="tv-panel" style="padding:0.75rem;margin-bottom:0.75rem">
        <h3 class="tv-panel__title" style="font-size:1rem">Archivar cuenta QA/Test</h3>
        <p class="field-hint">No borra datos. Oculta la cuenta de listados operativos.</p>
        <label class="field-label">Confirmación literal</label>
        <input class="input" name="confirmation" placeholder="ARCHIVAR QA ${escapeHtml(companyId)}" required autocomplete="off" style="width:100%;margin-bottom:0.5rem" />
        ${renderDryRunCheckbox()}
        ${renderBtn("Archivar QA", { type: "submit", variant: "ghost", size: "sm" })}
      </form>`
    : `<p class="field-hint">Archivar QA${actionBlockedHint(perms.archiveQa)}</p>`;

  const actionLogRows = (detail.recentAdminActions ?? [])
    .map(
      (log) => `<tr>
        <td>${escapeHtml(formatDateShort(log.created_at))}</td>
        <td><code class="tv-code-sm">${escapeHtml(log.action_type)}</code></td>
        <td>${escapeHtml(log.actor_email ?? "—")}</td>
        <td class="field-hint" style="max-width:14rem;overflow:hidden;text-overflow:ellipsis">${escapeHtml(JSON.stringify(log.metadata ?? {}).slice(0, 80))}</td>
      </tr>`,
    )
    .join("");

  const actionLogPanel = `<section class="tv-panel" style="margin-top:1rem"><h2 class="tv-panel__title">Historial acciones admin</h2>
    <div class="tv-panel__body table-wrap">
      <table class="tv-table"><thead><tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Meta</th></tr></thead>
      <tbody>${actionLogRows || "<tr><td colspan=\"4\">Sin acciones registradas</td></tr>"}</tbody></table>
    </div></section>`;

  return `${archivedNote}
    <div class="tv-form-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem">
      ${profileFields}
      ${suspendForm}
      ${reactivateForm}
      ${welcomeForm}
      ${receiptForm}
      ${archiveForm}
    </div>
    ${actionLogPanel}
    <p class="field-hint" style="margin-top:0.75rem">Eliminar PROD_REAL, ajustar saldo y crédito manual no están disponibles en esta fase.</p>`;
}

function renderClientActionsMenu(
  item: AdminClientListItem,
  isQaScope: boolean,
): string {
  const id = item.company.id;
  const detailHref = `/admin/clients/${id}#acciones-seguras`;
  const menuItems = [
    `<a href="/admin/clients/${escapeHtml(id)}" class="tv-client-actions__item">Ver detalle</a>`,
    `<a href="/admin/wallets/${escapeHtml(id)}" class="tv-client-actions__item">Saldo / Rate plan</a>`,
    `<a href="/admin/orders?company_id=${escapeHtml(id)}" class="tv-client-actions__item">Órdenes</a>`,
    `<a href="/admin/invoices?company_id=${escapeHtml(id)}" class="tv-client-actions__item">Facturas</a>`,
    `<a href="/admin/messages?company_id=${escapeHtml(id)}" class="tv-client-actions__item">Envíos</a>`,
    `<a href="${detailHref}" class="tv-client-actions__item">Editar / Suspender</a>`,
    `<a href="${detailHref}" class="tv-client-actions__item">Reenviar correos</a>`,
  ];
  if (isQaScope && !item.audit.protected && item.audit.classification !== "PROD_REAL") {
    menuItems.push(
      `<a href="${detailHref}" class="tv-client-actions__item">Archivar QA</a>`,
    );
  }
  return `<details class="tv-client-actions">
    <summary class="btn btn-secondary btn-sm tv-client-actions__trigger">Acciones</summary>
    <div class="tv-client-actions__menu">${menuItems.join("")}</div>
  </details>`;
}

function segmentChip(
  label: string,
  count: number,
  href: string,
  active: boolean,
): string {
  const cls = active
    ? "tv-segment-chip tv-segment-chip--active"
    : "tv-segment-chip";
  return `<a href="${escapeHtml(href)}" class="${cls}">
    <span class="tv-segment-chip__label">${escapeHtml(label)}</span>
    <span class="tv-segment-chip__count">${count}</span>
  </a>`;
}

function renderClientsSegmentBar(
  summary: AdminClientsScopeSummary,
  scope: AdminClientScope,
  statusFilter: AdminClientStatusFilter,
  search: string,
): string {
  const s = summary.segments;
  const chips = [
    segmentChip(
      "Producción real",
      s.productionReal,
      `/admin/clients${buildClientsFilterQuery("real", search, "")}`,
      scope === "real" && !statusFilter,
    ),
    segmentChip(
      "QA/Test",
      s.qaTest,
      `/admin/clients${buildClientsFilterQuery("qa", search, "")}`,
      scope === "qa" && !statusFilter,
    ),
    segmentChip(
      "Revisión requerida",
      s.reviewRequired,
      `/admin/clients${buildClientsFilterQuery("review", search, "")}`,
      scope === "review" && !statusFilter,
    ),
    segmentChip(
      "Sin saldo",
      s.noBalance,
      `/admin/clients${buildClientsFilterQuery(scope, search, "no_balance")}`,
      statusFilter === "no_balance",
    ),
    segmentChip(
      "Con saldo",
      s.hasBalance,
      `/admin/clients${buildClientsFilterQuery(scope, search, "has_balance")}`,
      statusFilter === "has_balance",
    ),
    segmentChip(
      "Sin rate plan",
      s.noRatePlan,
      `/admin/clients${buildClientsFilterQuery(scope, search, "no_rate_plan")}`,
      statusFilter === "no_rate_plan",
    ),
    segmentChip(
      "Actividad hoy",
      s.activityToday,
      `/admin/clients${buildClientsFilterQuery(scope, search, "activity_today")}`,
      statusFilter === "activity_today",
    ),
    segmentChip(
      "Sin actividad",
      s.noActivity,
      `/admin/clients${buildClientsFilterQuery(scope, search, "no_activity")}`,
      statusFilter === "no_activity",
    ),
    segmentChip(
      "Protegidos",
      s.protected,
      `/admin/clients${buildClientsFilterQuery(scope, search, "protected")}`,
      statusFilter === "protected",
    ),
  ];
  return `<div class="tv-clients-segments">
    ${chips.join("")}
    <span class="tv-clients-segments__meta">${summary.visible} resultado(s) · ${summary.totalCompanies} empresas en base</span>
  </div>`;
}

function renderClientsPageScript(): string {
  return `<script>
(function () {
  var openMenu = null;

  function resetClientActionsMenu(details) {
    var menu = details.querySelector(".tv-client-actions__menu");
    if (!menu) return;
    menu.style.position = "";
    menu.style.top = "";
    menu.style.right = "";
    menu.style.left = "";
    menu.style.bottom = "";
    menu.classList.remove("tv-client-actions__menu--fixed");
  }

  function positionClientActionsMenu(details) {
    var menu = details.querySelector(".tv-client-actions__menu");
    var trigger = details.querySelector(".tv-client-actions__trigger");
    if (!menu || !trigger) return;
    var rect = trigger.getBoundingClientRect();
    menu.classList.add("tv-client-actions__menu--fixed");
    menu.style.position = "fixed";
    menu.style.left = "auto";
    menu.style.right = Math.max(8, window.innerWidth - rect.right) + "px";
    var spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 220 && rect.top > spaceBelow) {
      menu.style.top = "auto";
      menu.style.bottom = Math.max(8, window.innerHeight - rect.top + 4) + "px";
    } else {
      menu.style.bottom = "auto";
      menu.style.top = Math.min(window.innerHeight - 8, rect.bottom + 4) + "px";
    }
  }

  document.querySelectorAll(".tv-client-actions").forEach(function (details) {
    details.addEventListener("toggle", function () {
      if (!details.open) {
        resetClientActionsMenu(details);
        if (openMenu === details) openMenu = null;
        return;
      }
      if (openMenu && openMenu !== details) {
        openMenu.open = false;
        resetClientActionsMenu(openMenu);
      }
      openMenu = details;
      positionClientActionsMenu(details);
    });
  });

  window.addEventListener("resize", function () {
    if (openMenu && openMenu.open) positionClientActionsMenu(openMenu);
  });

  document.addEventListener("click", function (e) {
    if (!openMenu) return;
    if (e.target.closest(".tv-client-actions")) return;
    resetClientActionsMenu(openMenu);
    openMenu.open = false;
    openMenu = null;
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openMenu) {
      resetClientActionsMenu(openMenu);
      openMenu.open = false;
      openMenu = null;
    }
  });

  document.querySelectorAll(".tv-client-actions__item").forEach(function (link) {
    link.addEventListener("click", function () {
      if (openMenu) {
        resetClientActionsMenu(openMenu);
        openMenu.open = false;
        openMenu = null;
      }
    });
  });

  function badgeHtml(state) {
    if (state === "active") return '<span class="badge badge-ok tv-api-access-badge" data-state="active">API activa</span>';
    if (state === "no-key") return '<span class="badge badge-warn tv-api-access-badge" data-state="no-key">API sin key</span>';
    if (state === "approval") return '<span class="badge badge-warn tv-api-access-badge" data-state="approval">API activa · key pendiente</span>';
    if (state === "pending") return '<span class="badge badge-warn tv-api-access-badge" data-state="pending">API pendiente</span>';
    return '<span class="badge badge-muted tv-api-access-badge" data-state="inactive">API inactiva</span>';
  }

  function resolveBadgeState(result) {
    if (!result.api_enabled) return "inactive";
    if (!result.has_production_key) return "no-key";
    if (!result.can_send_api_sms && result.can_use_production_api) return "approval";
    if (result.can_send_api_sms) return "active";
    return "approval";
  }

  document.querySelectorAll(".tv-api-access-row").forEach(function (row) {
    var input = row.querySelector(".tv-api-switch__input");
    if (!input || input.disabled) return;
    var companyId = row.getAttribute("data-company-id");
    var feedback = row.querySelector(".tv-api-access-feedback");
    var badge = row.querySelector(".tv-api-access-badge");
    var busy = false;

    input.addEventListener("change", function () {
      if (busy) return;
      var enabled = input.checked;
      if (!enabled) {
        var ok = window.confirm(
          "Desactivar API productiva impedirá nuevos envíos por API para este cliente. No afecta saldo ni historial."
        );
        if (!ok) {
          input.checked = true;
          return;
        }
      }

      busy = true;
      input.disabled = true;
      if (feedback) feedback.textContent = "Procesando…";

      fetch("/admin/clients/" + encodeURIComponent(companyId) + "/api-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ enabled: enabled }),
      })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (res) {
          var body = res.body || {};
          if (!res.ok || !body.success) {
            input.checked = !enabled;
            if (feedback) feedback.textContent = body.message || "Error al actualizar API.";
            return;
          }
          input.checked = Boolean(body.api_enabled);
          if (badge) {
            var next = document.createElement("span");
            next.innerHTML = badgeHtml(resolveBadgeState(body));
            badge.replaceWith(next.firstChild);
            badge = row.querySelector(".tv-api-access-badge");
          }
          if (feedback) feedback.textContent = body.message || "";
        })
        .catch(function () {
          input.checked = !enabled;
          if (feedback) feedback.textContent = "Error de red al actualizar API.";
        })
        .finally(function () {
          busy = false;
          input.disabled = false;
        });
    });
  });
})();
</script>`;
}

export function renderSaClientsPage(opts: BaseOpts & {
  clients: AdminClientListItem[];
  summary: AdminClientsScopeSummary;
  scope: AdminClientScope;
  search: string;
  statusFilter: AdminClientStatusFilter;
  searchHint?: string | null;
  page: number;
  totalFiltered: number;
  pageSize: number;
}): string {
  const canToggleApi = isSuperadminRole(opts.admin.role);
  const rows = opts.clients
    .map(
      (item) => `<tr class="tv-clients-row">
      <td>${renderClientTableCell(item)}</td>
      <td>${renderBalanceTableCell(item)}</td>
      <td>${renderUsageTableCell(item)}</td>
      <td>${renderPurchaseTableCell(item)}</td>
      <td>${renderRatePlanTableCell(item)}</td>
      <td>${renderOperationalStatusBadges(item, canToggleApi)}</td>
      <td class="tv-clients-actions-cell">${renderClientActionsMenu(item, opts.scope === "qa")}</td>
    </tr>`,
    )
    .join("");

  const totalPages = Math.max(1, Math.ceil(opts.totalFiltered / opts.pageSize));
  const pagination =
    totalPages > 1
      ? `<div class="tv-pagination" style="margin-top:1rem;display:flex;gap:0.5rem;align-items:center">
        <span class="field-hint">Página ${opts.page} de ${totalPages} (${opts.totalFiltered} clientes)</span>
        ${opts.page > 1 ? `<a href="/admin/clients${buildClientsFilterQuery(opts.scope, opts.search, opts.statusFilter, opts.page - 1)}" class="btn btn-ghost btn-sm">← Anterior</a>` : ""}
        ${opts.page < totalPages ? `<a href="/admin/clients${buildClientsFilterQuery(opts.scope, opts.search, opts.statusFilter, opts.page + 1)}" class="btn btn-ghost btn-sm">Siguiente →</a>` : ""}
      </div>`
      : "";

  const scopeNote =
    opts.scope === "real"
      ? `<p class="field-hint" style="margin:0 0 1rem">Vista operativa: solo clientes <strong>PROD_REAL</strong> o <strong>protected</strong>. Las cuentas QA/demo siguen en la base — cambia el ambiente para verlas.</p>`
      : "";

  const searchHintBlock = opts.searchHint
    ? `<div class="alert alert-info" style="margin-bottom:1rem">${escapeHtml(opts.searchHint)} <a href="/admin/clients?scope=qa&amp;q=${encodeURIComponent(opts.search)}">Ver en QA/Test →</a></div>`
    : "";

  const filters = renderFilterBar(`<form method="get" action="/admin/clients" class="tv-filters__form">
      ${renderFilterField(
        "Ambiente",
        `<select name="scope" class="tv-input">${renderClientsScopeOptions(opts.scope)}</select>`,
      )}
      ${renderFilterField(
        "Estado",
        `<select name="status" class="tv-input">${renderClientsStatusOptions(opts.statusFilter)}</select>`,
      )}
      ${renderFilterField(
        "Buscar",
        `<input type="search" name="q" class="tv-input" placeholder="Empresa, email, RUT, company_id…" value="${escapeHtml(opts.search)}" />`,
      )}
      <button type="submit" class="btn btn-secondary">Filtrar</button>
      ${opts.search || opts.scope !== "real" || opts.statusFilter ? `<a href="/admin/clients" class="btn btn-ghost">Restablecer</a>` : ""}
    </form>`);

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Clientes empresariales",
      subtitle: `Vista operativa por cuenta · Ambiente: ${CLIENT_SCOPE_LABELS[opts.scope]}. Métricas globales en el dashboard.`,
    })}
    ${renderClientsSegmentBar(opts.summary, opts.scope, opts.statusFilter, opts.search)}
    ${scopeNote}
    ${filters}
    ${searchHintBlock}
    <div class="table-wrap tv-panel tv-clients-table-wrap"><table class="tv-table tv-table--clients"><thead><tr>
      <th>Cliente</th><th>Saldo</th><th>Uso</th><th>Compra reciente</th><th>Rate plan</th><th>Estado</th><th>Acciones</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="7">Sin empresas en este ambiente</td></tr>`}</tbody></table></div>
    ${pagination}
    ${renderClientsPageScript()}`;
  return wrap(opts, "clients", "Clientes", body);
}

export function renderSaClientDetailPage(opts: BaseOpts & {
  detail: AdminClientOperationalDetail;
}): string {
  const { company: c, audit, operational: op, detail } = {
    company: opts.detail.company,
    audit: opts.detail.audit,
    operational: opts.detail.operational,
    detail: opts.detail,
  };
  const email = c.billing_email ?? c.name;

  const ordersRows = detail.recentOrders
    .map(
      (o) => `<tr>
        <td><a href="/admin/orders/${escapeHtml(o.id)}" class="row-link">${escapeHtml(formatDateShort(o.createdAt))}</a></td>
        <td>${escapeHtml(o.paymentStatus)}</td>
        <td>${escapeHtml(o.creditStatus)}</td>
        <td>${o.smsQuantity.toLocaleString("es-CL")}</td>
        <td>${escapeHtml(o.amount)}</td>
      </tr>`,
    )
    .join("");

  const invoiceRows = detail.recentInvoices
    .map(
      (i) => `<tr>
        <td><code class="tv-code-sm">${escapeHtml(i.invoiceNumber)}</code></td>
        <td>${escapeHtml(i.status)}</td>
        <td>${escapeHtml(i.paymentStatus)}</td>
        <td>${i.totalAmount.toLocaleString("es-CL")}</td>
        <td>${escapeHtml(formatDateShort(i.issuedAt))}</td>
      </tr>`,
    )
    .join("");

  const messageRows = detail.recentMessages
    .map(
      (m) => {
        const text = (m.messageBody ?? "").trim();
        const preview =
          text.length > 60 ? `${text.slice(0, 60)}…` : text || "Sin contenido";
        return `<tr>
        <td>${escapeHtml(formatDateShort(m.sentAt ?? m.createdAt))}</td>
        <td>${escapeHtml(m.recipientNumber)}</td>
        <td class="tv-messages-text" title="${escapeHtml(text)}">${escapeHtml(preview)}</td>
        <td>${escapeHtml(m.status)}</td>
        <td>${escapeHtml(m.mode)}</td>
      </tr>`;
      },
    )
    .join("");

  const emailRows = detail.recentEmails
    .map(
      (e) => `<tr>
        <td>${escapeHtml(e.kind)}</td>
        <td>${escapeHtml(e.toEmail)}</td>
        <td>${escapeHtml(e.status)}</td>
        <td>${escapeHtml(formatDateShort(e.sentAt))}</td>
      </tr>`,
    )
    .join("");

  const apiRows = detail.apiKeys
    .map(
      (k) => `<tr>
        <td>${escapeHtml(k.label)}</td>
        <td>${escapeHtml(k.environment)}</td>
        <td>${escapeHtml(k.status)}</td>
        <td>${escapeHtml(formatRelativeTime(k.lastUsedAt))}</td>
      </tr>`,
    )
    .join("");

  const walletTxRows = detail.recentWalletTransactions
    .map(
      (t) => `<tr>
        <td>${escapeHtml(formatDateShort(t.createdAt))}</td>
        <td>${escapeHtml(t.type)}</td>
        <td>${t.smsAmount.toLocaleString("es-CL")}</td>
        <td>${t.balanceAfter.toLocaleString("es-CL")}</td>
        <td>${escapeHtml(t.description ?? "—")}</td>
      </tr>`,
    )
    .join("");

  const pendingRows = detail.pendingOrders
    .map(
      (o) => `<tr>
        <td><a href="/admin/orders/${escapeHtml(o.id)}" class="row-link">${escapeHtml(formatDateShort(o.createdAt))}</a></td>
        <td>${escapeHtml(o.paymentStatus)}</td>
        <td>${escapeHtml(o.creditStatus)}</td>
        <td>${o.smsQuantity.toLocaleString("es-CL")}</td>
      </tr>`,
    )
    .join("");

  const failedRows = detail.recentFailedMessages
    .map(
      (m) => `<tr>
        <td>${escapeHtml(formatDateShort(m.sentAt ?? m.createdAt))}</td>
        <td>${escapeHtml(m.recipientNumber)}</td>
        <td>${escapeHtml(m.status)}</td>
      </tr>`,
    )
    .join("");

  const webhookBlock = detail.webhook
    ? `<p><strong>Webhook DLR:</strong> ${detail.webhook.url ? escapeHtml(detail.webhook.url) : "Sin URL"}</p>
       <p><strong>Estado:</strong> ${escapeHtml(detail.webhook.status ?? "—")}</p>`
    : `<p class="field-hint">Sin configuración webhook en client_api_settings.</p>`;

  const quickLinks = `<div class="tv-actions-inline" style="flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem">
      ${renderBtn("Saldo / Rate plan", { href: `/admin/wallets/${c.id}`, variant: "secondary" })}
      ${renderBtn("Órdenes", { href: `/admin/orders?company_id=${c.id}`, variant: "ghost" })}
      ${renderBtn("Facturas", { href: `/admin/invoices?company_id=${c.id}`, variant: "ghost" })}
      ${renderBtn("Mensajes", { href: `/admin/messages?company_id=${c.id}`, variant: "ghost" })}
      ${renderBtn("API", { href: `/admin/api?company_id=${c.id}`, variant: "ghost" })}
    </div>`;
  const defaultBlocked: ClientActionPermissions = {
    updateProfile: { allowed: false, reason: "Cargando permisos…" },
    suspendSending: { allowed: false },
    reactivateSending: { allowed: false },
    resendWelcome: { allowed: false },
    resendReceipt: { allowed: false },
    archiveQa: { allowed: false },
  };
  const safeActions = `${quickLinks}${renderClientSafeActionsPanel(c.id, detail, detail.actionPermissions ?? defaultBlocked)}`;

  const clientStats = `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem">
    <span class="tv-stat-chip tv-stat-chip--primary"><span class="tv-stat-chip__label">Saldo</span><span class="tv-stat-chip__value">${op.wallet.availableSms.toLocaleString("es-CL")}</span></span>
    <span class="tv-stat-chip"><span class="tv-stat-chip__label">Hoy</span><span class="tv-stat-chip__value">${op.usage.smsToday.toLocaleString("es-CL")}</span></span>
    <span class="tv-stat-chip"><span class="tv-stat-chip__label">Mes</span><span class="tv-stat-chip__value">${op.usage.smsThisMonth.toLocaleString("es-CL")}</span></span>
    <span class="tv-stat-chip"><span class="tv-stat-chip__label">Fallidos mes</span><span class="tv-stat-chip__value">${detail.usageStats.failedMonth}</span></span>
    <span class="tv-stat-chip"><span class="tv-stat-chip__label">Entrega mes</span><span class="tv-stat-chip__value">${detail.usageStats.deliveryRate ?? "Sin datos"}</span></span>
  </div>`;

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({
      title: escapeHtml(c.name),
      subtitleHtml: `${escapeHtml(email)} · ${escapeHtml(c.country ?? "CL")} · ${clientScopeBadges(audit)}`,
      actions: `${renderBtn("← Clientes", { href: "/admin/clients", variant: "ghost" })} ${renderBtn("Saldo / Rate plan", { href: `/admin/wallets/${c.id}`, variant: "secondary" })}`,
    })}
    ${clientStats}
    <div class="tv-form-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem">
      <section class="tv-panel"><h2 class="tv-panel__title">Empresa</h2><div class="tv-panel__body">
        <p><strong>RUT:</strong> ${escapeHtml(c.rut ?? "—")}</p>
        <p><strong>Contacto:</strong> ${escapeHtml(c.contact_name ?? "—")}</p>
        <p><strong>Teléfono:</strong> ${escapeHtml(c.contact_phone ?? "—")}</p>
        <p><strong>Estado:</strong> ${statusBadgeSa(c.status)}</p>
        <p><strong>Alta:</strong> ${escapeHtml(formatDate(c.created_at))}</p>
        <p><strong>ID:</strong> <code class="tv-code-sm">${escapeHtml(c.id)}</code></p>
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">Wallet</h2><div class="tv-panel__body">
        <p><strong>Disponible:</strong> ${op.wallet.availableSms.toLocaleString("es-CL")} SMS</p>
        <p><strong>Comprado:</strong> ${op.wallet.totalPurchasedSms.toLocaleString("es-CL")}</p>
        <p><strong>Consumido:</strong> ${op.wallet.consumedSms.toLocaleString("es-CL")}</p>
        <p><strong>Reservado:</strong> ${op.wallet.reservedSms.toLocaleString("es-CL")}</p>
        <p><strong>Estado wallet:</strong> ${op.wallet.hasWallet ? escapeHtml(op.wallet.status ?? "—") : "Sin wallet"}</p>
        ${walletTxRows ? `<div class="table-wrap" style="margin-top:0.75rem"><table class="tv-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>SMS</th><th>Saldo</th><th>Desc.</th></tr></thead><tbody>${walletTxRows}</tbody></table></div>` : "<p class=\"field-hint\">Sin transacciones wallet.</p>"}
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">Uso SMS</h2><div class="tv-panel__body">
        <p><strong>Hoy:</strong> ${op.usage.smsToday.toLocaleString("es-CL")}</p>
        <p><strong>Mes:</strong> ${op.usage.smsThisMonth.toLocaleString("es-CL")}</p>
        <p><strong>Fallidos 24h:</strong> ${op.usage.failedLast24h}</p>
        <p><strong>Último envío:</strong> ${escapeHtml(formatRelativeTime(op.usage.lastSmsAt))}</p>
        <p><strong>Entregados mes:</strong> ${detail.usageStats.deliveredMonth} · <strong>Fallidos mes:</strong> ${detail.usageStats.failedMonth}</p>
        ${failedRows ? `<div class="table-wrap" style="margin-top:0.5rem"><table class="tv-table"><thead><tr><th>Fecha</th><th>Destino</th><th>Estado</th></tr></thead><tbody>${failedRows}</tbody></table></div>` : ""}
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">Rate plan</h2><div class="tv-panel__body">
        <p><strong>Plan:</strong> ${op.ratePlanName ? escapeHtml(op.ratePlanName) : "Sin rate plan"}</p>
        <p><strong>Código:</strong> ${op.ratePlanCode ? `<code class="tv-code-sm">${escapeHtml(op.ratePlanCode)}</code>` : "—"}</p>
        <p><strong>Asignado:</strong> ${escapeHtml(formatDateShort(op.ratePlanAssignedAt))}</p>
        <p><strong>Live:</strong> ${detail.ratePlanLiveEnabled == null ? "—" : detail.ratePlanLiveEnabled ? "sí" : "no"}</p>
        <p><strong>Campañas:</strong> ${detail.ratePlanCampaignsEnabled == null ? "—" : detail.ratePlanCampaignsEnabled ? "sí" : "no"}</p>
        <p><strong>API:</strong> ${detail.ratePlanApiEnabled == null ? "—" : detail.ratePlanApiEnabled ? "sí" : "no"}</p>
        <a href="/admin/wallets/${escapeHtml(c.id)}" class="row-link">Cambiar rate plan →</a>
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">API / integración</h2><div class="tv-panel__body">
        ${webhookBlock}
        <p style="margin-top:0.5rem"><strong>API keys:</strong> ${detail.apiKeys.length}</p>
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">Auditoría</h2><div class="tv-panel__body">
        <p>${auditClassificationBadge(audit)}</p>
        <p><strong>Clasificación:</strong> ${escapeHtml(audit.classification)}</p>
        <p><strong>Protected:</strong> ${audit.protected ? "sí" : "no"}</p>
        <p><strong>Razón:</strong> ${escapeHtml(audit.reason ?? "—")}</p>
        <p><strong>Correos transaccionales:</strong> ${op.usage.transactionalEmailsSent}</p>
        <p><strong>Campañas:</strong> ${op.usage.campaignsCount}</p>
      </div></section>
    </div>
    <section class="tv-panel" style="margin-top:1rem"><h2 class="tv-panel__title">Acciones seguras</h2><div class="tv-panel__body" id="acciones-seguras">${safeActions}</div></section>
    <div class="tv-form-grid" style="grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem">
      <section class="tv-panel"><h2 class="tv-panel__title">Órdenes recientes</h2><div class="tv-panel__body table-wrap">
        <table class="tv-table"><thead><tr><th>Fecha</th><th>Pago</th><th>Crédito</th><th>SMS</th><th>Monto</th></tr></thead>
        <tbody>${ordersRows || "<tr><td colspan=\"5\">Sin órdenes</td></tr>"}</tbody></table>
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">Facturas / comprobantes</h2><div class="tv-panel__body table-wrap">
        <table class="tv-table"><thead><tr><th>Número</th><th>Estado</th><th>Pago</th><th>Total</th><th>Emitida</th></tr></thead>
        <tbody>${invoiceRows || "<tr><td colspan=\"5\">Sin facturas</td></tr>"}</tbody></table>
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">Compras por acreditar</h2><div class="tv-panel__body table-wrap">
        <table class="tv-table"><thead><tr><th>Fecha</th><th>Pago</th><th>Crédito</th><th>SMS</th></tr></thead>
        <tbody>${pendingRows || "<tr><td colspan=\"4\">Sin compras pendientes de acreditar</td></tr>"}</tbody></table>
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">Últimos SMS</h2><div class="tv-panel__body table-wrap">
        <table class="tv-table"><thead><tr><th>Fecha</th><th>Destino</th><th>Mensaje</th><th>Estado</th><th>Modo</th></tr></thead>
        <tbody>${messageRows || "<tr><td colspan=\"5\">Sin envíos</td></tr>"}</tbody></table>
      </div></section>
      <section class="tv-panel"><h2 class="tv-panel__title">Correos transaccionales</h2><div class="tv-panel__body table-wrap">
        <table class="tv-table"><thead><tr><th>Tipo</th><th>Destino</th><th>Estado</th><th>Enviado</th></tr></thead>
        <tbody>${emailRows || "<tr><td colspan=\"4\">Sin correos</td></tr>"}</tbody></table>
      </div></section>
    </div>
    <section class="tv-panel" style="margin-top:1rem"><h2 class="tv-panel__title">API keys</h2><div class="tv-panel__body table-wrap">
      <table class="tv-table"><thead><tr><th>Etiqueta</th><th>Ambiente</th><th>Estado</th><th>Último uso</th></tr></thead>
      <tbody>${apiRows || "<tr><td colspan=\"4\">Sin API keys</td></tr>"}</tbody></table>
    </div></section>`;

  return wrap(opts, "clients", c.name, body);
}

export function renderWalletRatePlanBlock(opts: {
  companyId: string;
  assignment: CompanyRatePlanView | null;
  assignments?: CompanyRatePlanView[];
  ratePlans: SmsRatePlanRow[];
  providers?: SmsProviderRow[];
}): string {
  const a = opts.assignment;
  const all = opts.assignments?.length ? opts.assignments : a ? [a] : [];
  const policy = companyRoutingPolicyFromAssignment(a);
  const providerPolicyHint =
    policy.allowedProviderIds.length > 0 || policy.blockedProviderIds.length > 0
      ? `<br><span class="field-hint">Proveedores permitidos: ${policy.allowedProviderIds.length || "todos"} · bloqueados: ${policy.blockedProviderIds.length}</span>`
      : "";

  const trafficLines =
    all.length > 0
      ? all
          .map(
            (row) =>
              `<span class="field-hint"><strong>${escapeHtml(row.traffic_type)}:</strong> Live ${row.live_enabled ? "sí" : "no"} · Campañas ${row.campaigns_enabled ? "sí" : "no"} · API ${row.api_enabled ? "sí" : "no"}</span>`,
          )
          .join("<br>")
      : "";

  const mergedLive = all.some((row) => row.live_enabled);
  const mergedCampaigns = all.some((row) => row.campaigns_enabled);
  const mergedApi = all.some((row) => row.api_enabled);

  const current = a
    ? `<p><strong>${escapeHtml(a.rate_plan_name ?? "—")}</strong> · ${escapeHtml(a.country)} · ${statusBadgeSa(a.status)}<br>
      ${trafficLines}
      <span class="field-hint">Efectivo para la app (cualquier tipo): Live ${mergedLive ? "sí" : "no"} · Campañas ${mergedCampaigns ? "sí" : "no"} · API ${mergedApi ? "sí" : "no"}</span>${providerPolicyHint}<br>
      <span class="field-hint">Cliente max TPS: ${Number(a.max_tps ?? 1)} · Asignado ${formatDate(a.created_at)}</span></p>`
    : `<p class="badge badge-warn">Cliente sin rate plan asignado para envío real.</p>`;

  const planOpts = opts.ratePlans
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.code)})</option>`,
    )
    .join("");

  const providerChecks = (opts.providers ?? [])
    .filter((p) => p.status === "active" || p.status === "testing")
    .map((p) => {
      const allowedChecked = policy.allowedProviderIds.includes(p.id)
        ? " checked"
        : "";
      const blockedChecked = policy.blockedProviderIds.includes(p.id)
        ? " checked"
        : "";
      return `<div class="tv-form-grid" style="grid-template-columns:1fr auto auto;align-items:center;gap:0.5rem;margin:0.25rem 0">
        <span>${escapeHtml(p.name)} <code class="tv-code-sm">${escapeHtml(p.code)}</code></span>
        <label class="tv-checkbox" title="Solo estos proveedores (vacío = todos del plan)"><input type="checkbox" name="allowed_provider_ids" value="${escapeHtml(p.id)}"${allowedChecked} /> Permitir</label>
        <label class="tv-checkbox" title="Nunca usar este proveedor"><input type="checkbox" name="blocked_provider_ids" value="${escapeHtml(p.id)}"${blockedChecked} /> Bloquear</label>
      </div>`;
    })
    .join("");

  const providerSection =
    a && providerChecks
      ? `<div style="grid-column:1/-1;margin-top:0.5rem">
        <h4 style="margin:0 0 0.5rem;font-size:0.9rem">Proveedores por cliente (opcional)</h4>
        <p class="field-hint">Deje «Permitir» vacío para usar todos los del rate plan. «Bloquear» excluye un vendor aunque esté en el plan balanceado.</p>
        ${providerChecks}
      </div>`
      : "";

  return `<section class="tv-panel">
    <h2 class="tv-panel__title">Rate Plan asignado</h2>
    <div class="tv-panel__body">
      ${current}
      <form method="post" action="/admin/wallets/${escapeHtml(opts.companyId)}/rate-plan" class="tv-form-grid" style="margin-top:1rem">
        <label>Cambiar rate plan
          <select name="rate_plan_id" required class="tv-input-full">${planOpts}</select>
        </label>
        <label>País <input name="country" value="CL" class="tv-input-full" /></label>
        <label>Tipo tráfico
          <select name="traffic_type" class="tv-input-full">
            <option value="both" selected>Ambos (transactional + promotional)</option>
            <option value="transactional">Solo transactional</option>
            <option value="promotional">Solo promotional</option>
          </select>
        </label>
        <button type="submit" class="btn btn-secondary">Asignar rate plan</button>
      </form>
      ${
        a
          ? `<form method="post" action="/admin/wallets/${escapeHtml(opts.companyId)}/traffic" class="tv-form-grid" style="margin-top:1.5rem;border-top:1px solid var(--border);padding-top:1rem">
        <h3 style="grid-column:1/-1;margin:0;font-size:0.95rem">Límites comerciales cliente (máx. 20 TPS)</h3>
        <label>Cliente max TPS <input name="max_tps" type="number" step="0.1" min="1" max="20" value="${Number(a.max_tps ?? 1)}" class="tv-input-full" required /></label>
        <label>Límite diario <input name="daily_limit" type="number" value="${a.daily_limit ?? ""}" class="tv-input-full" placeholder="Opcional" /></label>
        <label>Límite mensual <input name="monthly_limit" type="number" value="${a.monthly_limit ?? ""}" class="tv-input-full" placeholder="Opcional" /></label>
        <label class="tv-checkbox"><input type="checkbox" name="live_enabled" value="1" ${a.live_enabled ? "checked" : ""} /> live_enabled</label>
        <label class="tv-checkbox"><input type="checkbox" name="campaigns_enabled" value="1" ${a.campaigns_enabled ? "checked" : ""} /> campaigns_enabled</label>
        <label class="tv-checkbox"><input type="checkbox" name="api_enabled" value="1" ${a.api_enabled ? "checked" : ""} /> api_enabled</label>
        ${providerSection}
        <input type="hidden" name="apply_all_traffic_types" value="1" />
        <button type="submit" class="btn btn-primary">Guardar límites cliente</button>
        <p class="field-hint" style="grid-column:1/-1">Los límites y checkboxes se aplican a <strong>transactional</strong> y <strong>promotional</strong> (las campañas usan promotional).</p>
        <p class="field-hint" style="grid-column:1/-1">El TPS máximo permitido por cuenta cliente es 20.</p>
      </form>`
          : ""
      }
    </div>
  </section>`;
}
