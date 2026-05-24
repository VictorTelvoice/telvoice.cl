import type { AdminSessionUser } from "../../../types/admin.js";
import type { CompanyRow } from "../../../types/tenant.js";
import type { PanelSmsMessageRow } from "../../../types/sms-panel.js";
import type {
  LiveTestControlPanelView,
  SmsProviderStatusView,
} from "../../../services/smsProviderStatusService.js";
import type { CompanyRatePlanView } from "../../../services/companyRatePlanService.js";
import type {
  SmsProviderRow,
  SmsRatePlanDetailEnriched,
  SmsRatePlanRow,
  SmsRouteWithProvider,
} from "../../../types/sms-routing.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { renderPageHeader } from "../page-kit.js";
import { renderSuperadminBanner, statusBadgeSa } from "../superadmin-kit.js";

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
        <td>
          <a href="/admin/providers/${escapeHtml(p.id)}" class="row-link">Detalle</a>
          <a href="/admin/providers/${escapeHtml(p.id)}/test" class="btn btn-ghost btn-sm">Probar</a>
        </td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="8">Sin proveedores. Aplica migración 014 y ejecuta <code>npm run seed:sms-routing</code> (opcional).</td></tr>`;

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
      <th>Proveedor</th><th>Conexión</th><th>Estado</th><th>Base URL</th><th>Sender</th><th>DLR</th><th>Unicode</th><th></th>
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
        <td>
          <form method="post" action="/admin/routes/${escapeHtml(r.id)}/status" style="display:inline">
            <input type="hidden" name="status" value="${r.status === "active" ? "inactive" : "active"}" />
            <button type="submit" class="btn btn-ghost btn-sm">${r.status === "active" ? "Desactivar" : "Activar"}</button>
          </form>
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
      <th>País</th><th>MCC</th><th>MNC</th><th>Operador</th><th>Proveedor</th><th>Tipo</th><th>Tráfico</th><th>Prio.</th><th>Costo</th><th>Estado</th><th>DLR</th><th></th>
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
        <td>${formatDate(p.created_at)}</td>
        <td><a href="/admin/rate-plans/${escapeHtml(p.id)}" class="row-link">Detalle</a></td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6">Sin rate plans.</td></tr>`;

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({ title: "Planes tarifarios", subtitle: "Rate plans comerciales — precio venta, costo y margen por ruta." })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Nombre</th><th>Código</th><th>Moneda</th><th>Estado</th><th>Creado</th><th></th>
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
          return `<tr>
        <td>${escapeHtml(d.mcc ?? "—")}</td>
        <td>${escapeHtml(d.mnc ?? "—")}</td>
        <td>${escapeHtml(d.country)}</td>
        <td>${escapeHtml(d.operator_name ?? "—")}</td>
        <td>${escapeHtml(d.traffic_type)}</td>
        <td>${escapeHtml(d.route?.name ?? "—")}</td>
        <td>${escapeHtml(d.provider?.name ?? d.provider?.code ?? "—")}</td>
        <td>${d.cost_price_per_sms}</td>
        <td>${d.sell_price_per_sms}</td>
        <td>${margin.toFixed(4)}</td>
        <td>${escapeHtml(d.currency)}</td>
        <td>${statusBadgeSa(d.status)}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="12">Sin tarifas. Agregue un detalle abajo.</td></tr>`;

  const routeOpts = opts.routes
    .filter((r) => r.status === "active")
    .map(
      (r) =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)} — ${escapeHtml(r.provider_name ?? "")} (${escapeHtml(r.country)})</option>`,
    )
    .join("");

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({
      title: escapeHtml(opts.ratePlan.name),
      subtitle: `Código ${escapeHtml(opts.ratePlan.code)}`,
      actions: `<a href="/admin/rate-plans" class="btn btn-ghost btn-sm">← Planes</a>`,
    })}
    <div class="table-wrap tv-panel"><table class="tv-table tv-table--compact"><thead><tr>
      <th>MCC</th><th>MNC</th><th>País</th><th>Operador</th><th>Tipo SMS</th><th>Ruta</th><th>Proveedor</th><th>Costo</th><th>Venta</th><th>Margen</th><th>Moneda</th><th>Estado</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Agregar tarifa</h2>
      <form method="post" action="/admin/rate-plans/${escapeHtml(opts.ratePlan.id)}/details" class="tv-panel__body tv-form-grid">
        <label>Ruta <select name="route_id" required class="tv-input-full">${routeOpts}</select></label>
        <label>País <input name="country" value="CL" class="tv-input-full" /></label>
        <label>Operador <input name="operator_name" class="tv-input-full" /></label>
        <label>Tipo tráfico <select name="traffic_type" class="tv-input-full"><option value="transactional">Transactional</option><option value="promotional">Promotional</option></select></label>
        <label>Precio venta/SMS <input name="sell_price_per_sms" type="number" step="0.0001" value="1" required class="tv-input-full" /></label>
        <label>Costo ref./SMS <input name="cost_price_per_sms" type="number" step="0.0001" value="0" class="tv-input-full" /></label>
        <label>Moneda <input name="currency" value="${escapeHtml(opts.ratePlan.currency)}" class="tv-input-full" /></label>
        <button type="submit" class="btn btn-primary">Agregar</button>
      </form>
    </section>`;
  return wrap(opts, "rate-plans", "Detalle rate plan", body);
}

export function renderSaClientsPage(opts: BaseOpts & {
  clients: { company: CompanyRow; ratePlan: CompanyRatePlanView | null }[];
  useReal: boolean;
}): string {
  const rows = opts.clients
    .map(({ company: c, ratePlan: rp }) => {
      const planCell = rp?.rate_plan_name
        ? `<span>${escapeHtml(rp.rate_plan_name)}</span><br><code class="tv-code-sm">${escapeHtml(rp.rate_plan_code ?? "")}</code>`
        : `<span class="badge badge-warn">Sin rate plan</span>`;
      const warn = !rp
        ? `<div class="field-hint" style="color:var(--warn)">Cliente sin rate plan para envío real.</div>`
        : "";
      return `<tr>
      <td><strong>${escapeHtml(c.name)}</strong>${warn}</td>
      <td>${escapeHtml(c.billing_email ?? c.name)}</td>
      <td>${escapeHtml(c.country ?? "CL")}</td>
      <td>${statusBadgeSa(c.status)}</td>
      <td>${planCell}</td>
      <td>
        <a href="/admin/wallets/${escapeHtml(c.id)}" class="row-link">Saldo / Rate plan</a>
      </td>
    </tr>`;
    })
    .join("");

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Clientes empresariales",
      subtitle: "Asigne un rate plan antes de habilitar envío real (live_test).",
    })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Empresa</th><th>Email</th><th>País</th><th>Estado</th><th>Rate Plan</th><th></th>
    </tr></thead><tbody>${rows || '<tr><td colspan="6">Sin empresas</td></tr>'}</tbody></table></div>`;
  return wrap(opts, "clients", "Clientes", body);
}

export function renderWalletRatePlanBlock(opts: {
  companyId: string;
  assignment: CompanyRatePlanView | null;
  ratePlans: SmsRatePlanRow[];
}): string {
  const current = opts.assignment
    ? `<p><strong>${escapeHtml(opts.assignment.rate_plan_name ?? "—")}</strong> · ${escapeHtml(opts.assignment.country)} · ${escapeHtml(opts.assignment.traffic_type)} · ${statusBadgeSa(opts.assignment.status)}<br><span class="field-hint">Asignado ${formatDate(opts.assignment.created_at)}</span></p>`
    : `<p class="badge badge-warn">Cliente sin rate plan asignado para envío real.</p>`;

  const planOpts = opts.ratePlans
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.code)})</option>`,
    )
    .join("");

  return `<section class="tv-panel">
    <h2 class="tv-panel__title">Rate Plan asignado</h2>
    <div class="tv-panel__body">
      ${current}
      <form method="post" action="/admin/wallets/${escapeHtml(opts.companyId)}/rate-plan" class="tv-form-grid" style="margin-top:1rem">
        <label>Cambiar rate plan
          <select name="rate_plan_id" required class="tv-input-full">${planOpts}</select>
        </label>
        <label>País <input name="country" value="CL" class="tv-input-full" /></label>
        <label>Tipo tráfico <select name="traffic_type" class="tv-input-full"><option value="transactional">Transactional</option><option value="promotional">Promotional</option></select></label>
        <button type="submit" class="btn btn-secondary">Asignar rate plan</button>
      </form>
    </div>
  </section>`;
}
