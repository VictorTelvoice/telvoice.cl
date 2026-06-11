import type { AdminSessionUser } from "../../../types/admin.js";
import type { SmsProviderStatusView } from "../../../services/smsProviderStatusService.js";
import type {
  PanelSmsMessageWithCompany,
  SmsCampaignWithCompany,
} from "../../../types/sms-panel.js";
import type { CampaignTrafficReadinessResult } from "../../../services/campaignReadinessService.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  MOCK_SA_API_KEYS,
  MOCK_SA_CAMPAIGNS,
  MOCK_SA_CLIENTS,
  MOCK_SA_DLR,
  MOCK_SA_PROVIDERS,
  MOCK_SA_ROUTES,
} from "../mock-data-superadmin.js";
import { renderKpiCard } from "../components.js";
import { renderBtn, renderFilterBar, renderPageHeader } from "../page-kit.js";
import { renderAdminPanelModeBadge, renderPanelMessageSourceBadge } from "../../app-ui/app-sms-ui.js";
import { renderSuperadminBanner, statusBadgeSa } from "../superadmin-kit.js";
import { interpretCampaignTpsMetadata } from "../../../utils/campaignTpsMetadata.js";

type PageOpts = {
  admin: AdminSessionUser;
  smsBalance?: string;
  campaigns?: SmsCampaignWithCompany[];
  messages?: PanelSmsMessageWithCompany[];
  providerStatus?: SmsProviderStatusView;
  trafficByCompany?: Map<string, CampaignTrafficReadinessResult>;
  search?: string;
  companyId?: string;
};

function formatMessagePreview(
  text: string | null | undefined,
  maxLen = 100,
): { preview: string; full: string; empty: boolean } {
  const full = (text ?? "").trim();
  if (!full) {
    return { preview: "Sin contenido", full: "", empty: true };
  }
  if (full.length <= maxLen) {
    return { preview: full, full, empty: false };
  }
  return { preview: `${full.slice(0, maxLen)}…`, full, empty: false };
}

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
      companyName: "telvoice · superadmin",
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

export function renderSaCampaignsPage(opts: PageOpts): string {
  const real = opts.campaigns ?? [];
  const trafficMap = opts.trafficByCompany;
  const rows = real.length
    ? real
        .map(
          (c) => {
            const tr = trafficMap?.get(c.company_id);
            const liveFlag = tr?.liveEnabled ? "Sí" : "No";
            const campFlag = tr?.campaignsEnabled ? "Sí" : "No";
            const tpsMeta = interpretCampaignTpsMetadata(
              (c.metadata ?? {}) as Record<string, unknown>,
            );
            const tpsEff =
              tpsMeta.effectiveTps ?? tr?.effectiveTps ?? null;
            const tpsParts: string[] = [];
            if (tpsEff != null) {
              tpsParts.push(String(tpsEff));
            }
            if (tpsMeta.schedulerBatchSize != null) {
              tpsParts.push(`batch ${tpsMeta.schedulerBatchSize}`);
            }
            const tps = tpsParts.length ? tpsParts.join(" · ") : "—";
            const tpsTitle = [
              tpsMeta.legacyTargetTpsWarning,
              tpsMeta.requestedLimitedWarning,
            ]
              .filter(Boolean)
              .join(" ");
            return `<tr>
      <td>${escapeHtml(c.company_name ?? "—")}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.sender_id ?? "—")}</td>
      <td>${c.real_sms_cost}</td>
      <td>${statusBadgeSa(c.status)}</td>
      <td>${statusBadgeSa(c.mode)}</td>
      <td>${campFlag}</td>
      <td>${liveFlag}</td>
      <td${tpsTitle ? ` title="${escapeHtml(tpsTitle)}"` : ""}>${escapeHtml(tps)}${tpsMeta.legacyTargetTpsWarning ? ' <span class="badge badge-warn" title="Metadata legacy">!</span>' : ""}</td>
      <td>${formatDate(c.created_at)}</td>
      <td><code class="tv-code-sm">${escapeHtml(c.id.slice(0, 8))}</code></td>
    </tr>`;
          },
        )
        .join("")
    : MOCK_SA_CAMPAIGNS.map(
        (c) => `<tr>
      <td>${escapeHtml(c.client)}</td><td>${escapeHtml(c.name)}</td><td>—</td>
      <td>${escapeHtml(String(c.sent))}</td><td>${statusBadgeSa(c.status)}</td><td>mock</td>
      <td>${escapeHtml(c.date)}</td><td>—</td>
    </tr>`,
      ).join("");
  const hint = real.length
    ? `<p class="field-hint">${real.length} campaña(s) desde Supabase (panel).</p>`
    : `<p class="field-hint tv-mock-tag">Sin campañas en BD · mostrando datos de ejemplo.</p>`;
  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({ title: "Campañas globales", subtitle: "Monitorea campañas de todos los clientes en la plataforma.", actions: renderBtn("Nueva campaña", { href: "/admin/campaigns/send", variant: "primary", icon: "upload_file" }) })}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Cliente</th><th>Campaña</th><th>Remitente</th><th>SMS consumidos</th><th>Estado</th><th>Modo</th><th>Campaigns</th><th>Live</th><th>TPS eff.</th><th>Fecha</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${hint}`;
  return wrap(opts, "campaigns", "Campañas", body);
}

export function renderSaMessagesPage(opts: PageOpts): string {
  const search = opts.search ?? "";
  const companyId = opts.companyId ?? "";
  const filters = renderFilterBar(
    `<form method="get" action="/admin/messages" class="tv-filters__form" style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:flex-end;width:100%">
      <label class="field-label" style="margin:0">Buscar
        <input class="tv-input" type="search" name="q" placeholder="Cliente, número, texto del mensaje…" value="${escapeHtml(search)}" style="min-width:14rem" />
      </label>
      <label class="field-label" style="margin:0">company_id
        <input class="tv-input" type="text" name="company_id" placeholder="UUID empresa" value="${escapeHtml(companyId)}" style="min-width:12rem;font-family:monospace;font-size:0.8rem" />
      </label>
      <button type="submit" class="btn btn-secondary btn-sm">Filtrar</button>
      ${search || companyId ? `<a href="/admin/messages" class="btn btn-ghost btn-sm">Restablecer</a>` : ""}
    </form>`,
  );
  const real = opts.messages ?? [];
  const rows = real.length
    ? real
        .map(
          (m) => {
            const msg = formatMessagePreview(m.message, 100);
            const msgClass = msg.empty
              ? "tv-messages-text tv-messages-text--empty"
              : "tv-messages-text";
            return `<tr>
      <td class="tv-cell-truncate" title="${escapeHtml(m.company_name ?? "")}">${escapeHtml(m.company_name ?? "—")}</td>
      <td><code class="tv-code-sm">${escapeHtml(m.recipient_number)}</code></td>
      <td class="${msgClass}" title="${escapeHtml(msg.full)}">${escapeHtml(msg.preview)}</td>
      <td>${escapeHtml(m.provider)}</td>
      <td>${renderAdminPanelModeBadge(m.mode, m.metadata)}</td>
      <td title="${escapeHtml(String((m.metadata as Record<string, unknown>)?.source ?? ""))}">${renderPanelMessageSourceBadge(m.metadata, m.mode)}</td>
      <td><code class="tv-code-sm" title="${escapeHtml(m.provider_message_id ?? "")}">${escapeHtml((m.provider_message_id ?? "—").slice(0, 14))}</code></td>
      <td>${statusBadgeSa(m.status)}</td>
      <td class="tv-cell-truncate" title="${escapeHtml(m.error_message ?? "")}">${escapeHtml(m.error_message ?? "—")}</td>
      <td>${formatDate(m.created_at)}</td>
      <td>${m.segments}</td>
    </tr>`;
          },
        )
        .join("")
    : `<tr><td colspan="11">Sin mensajes${search || companyId ? " para este filtro" : ""}.</td></tr>`;
  const hint = real.length
    ? `<p class="field-hint">${real.length} mensaje(s) panel desde Supabase (campo <code>message</code>).</p>`
    : `<p class="field-hint">Sin mensajes panel en BD para los filtros actuales.</p>`;
  const body = `
    ${renderSuperadminBanner("Monitor operacional global — no es la bandeja de un cliente.")}
    ${renderPageHeader({ title: "Mensajería global", subtitle: "Todos los mensajes enviados por todos los clientes (panel_sms_messages).", actions: `<a href="/admin/inbox" class="btn btn-ghost btn-sm">Bandeja operador (legacy)</a>` })}
    ${filters}
    <div class="table-wrap tv-panel"><table class="tv-table tv-table--messages"><thead><tr>
      <th>Cliente</th><th>Número</th><th>Mensaje</th><th>Proveedor</th><th>Modo</th><th>Origen</th><th>Provider Msg ID</th><th>Estado</th><th>Error</th><th>Fecha</th><th>Seg.</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${hint}`;
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
  const ps = opts.providerStatus;
  const apiCard = ps
    ? `<section class="tv-panel" style="margin-bottom:1rem">
      <h2 class="tv-panel__title">API real — aSMSC (panel live_test)</h2>
      <div class="tv-panel__body tv-form-grid">
        <div><dt style="font-weight:600">Estado credenciales</dt><dd>${ps.asmscConfigured ? statusBadgeSa("activa") : statusBadgeSa("no configurado")}</dd></div>
        <div><dt style="font-weight:600">Modo actual (SMS_PROVIDER_MODE)</dt><dd><code>${escapeHtml(ps.providerMode)}</code></dd></div>
        <div><dt style="font-weight:600">Proveedor (SMS_PROVIDER)</dt><dd><code>${escapeHtml(ps.providerName)}</code> → HTTP POST /SendSMS</dd></div>
        <div><dt style="font-weight:600">Live test enabled</dt><dd>${ps.liveTestEnabled ? "true" : "false"}</dd></div>
        <div><dt style="font-weight:600">Live test activo</dt><dd>${ps.liveTestActive ? statusBadgeSa("activa") : statusBadgeSa("inactivo")}</dd></div>
        <div><dt style="font-weight:600">Último envío live_test</dt><dd>${
          ps.lastLiveTestMessage
            ? `${formatDate(ps.lastLiveTestMessage.createdAt)} · ${escapeHtml(ps.lastLiveTestMessage.recipient)} · ${statusBadgeSa(ps.lastLiveTestMessage.status)} · <code>${escapeHtml(ps.lastLiveTestMessage.providerMessageId ?? "—")}</code>`
            : "—"
        }</dd></div>
        <p class="field-hint">DLR: <code>POST /api/webhooks/asmsc/dlr</code> (también alias <code>/api/webhooks/sms/dlr</code>). Sin credenciales en pantalla.</p>
        <a href="/admin/asmsc/diagnostics" class="btn btn-secondary btn-sm">Diagnóstico aSMSC</a>
      </div>
    </section>`
    : "";

  const rows = MOCK_SA_PROVIDERS.map(
    (p) => `<tr>
      <td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.type)}</td><td>${escapeHtml(p.route)}</td>
      <td>${statusBadgeSa(p.status)}</td><td>${escapeHtml(p.cost)}</td><td>${escapeHtml(p.delivery)}</td>
      <td><a href="/admin/asmsc/diagnostics" class="row-link">Config</a></td>
    </tr>`,
  ).join("");
  const body = `${renderSuperadminBanner()}${renderPageHeader({ title: "Proveedores SMS", subtitle: "Conectividad upstream y modo mock/live_test del panel." })}
    ${apiCard}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Proveedor</th><th>Conexión</th><th>Ruta</th><th>Estado</th><th>Costo ref.</th><th>Entrega ref.</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <p class="field-hint tv-mock-tag">Tabla inferior: datos de referencia mock. La API real del panel usa aSMSC según variables de entorno.</p>`;
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
