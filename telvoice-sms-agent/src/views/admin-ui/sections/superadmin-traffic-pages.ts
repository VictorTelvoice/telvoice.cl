import type { AdminSessionUser } from "../../../types/admin.js";
import type { TrafficControlDashboard } from "../../../services/smsTrafficMetricsService.js";
import { escapeHtml } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { renderPageHeader } from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

type BaseOpts = {
  admin: AdminSessionUser;
  smsBalance?: string;
  flash?: string;
  error?: string;
};

function wrap(opts: BaseOpts, body: string): string {
  const alerts = [
    opts.flash ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>` : "",
    opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : "",
  ].join("");
  return wrapAdminPage({
    admin: opts.admin,
    title: "Control de tráfico",
    activeNav: "traffic-control",
    body: alerts + body,
    topbar: {
      smsBalance: opts.smsBalance ?? "—",
      routesLabel: "Traffic control",
      routesOk: true,
      companyName: "telvoice · superadmin",
    },
  });
}

export function renderSaTrafficControlPage(
  opts: BaseOpts & { dashboard: TrafficControlDashboard },
): string {
  const d = opts.dashboard;
  const q = d.queueCounts;
  const sch = d.queueScheduler;
  const schedulerLabel = sch.enabled
    ? `Activo — cada ${sch.intervalSeconds}s, batch ${sch.batchSize}`
    : "Inactivo (solo tick manual)";

  const clientRows = d.clientPolicies.length
    ? d.clientPolicies
        .map(
          (c) => `<tr>
        <td>${escapeHtml(c.companyName)}</td>
        <td>${c.clientTps} TPS</td>
        <td><strong>${c.effectiveTps}</strong> TPS</td>
        <td>${c.liveEnabled ? "Sí" : "No"}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4">Sin asignaciones activas.</td></tr>`;

  const providerRows = d.providerUsage.length
    ? d.providerUsage
        .map(
          (p) => `<tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.count} (5 min)</td>
        <td>${p.maxTps} TPS máx.</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="3">Sin consumo reciente.</td></tr>`;

  const body = `${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Control de tráfico SMS",
      subtitle:
        "TPS, cola y capacidad — worker manual o scheduler automático según SMS_QUEUE_SCHEDULER_ENABLED.",
      actions: `<form method="post" action="/admin/traffic-control/queue/process-tick" style="display:inline">
        <input type="hidden" name="limit" value="5" />
        <button type="submit" class="btn btn-secondary btn-sm">Procesar tick cola (manual)</button>
      </form>`,
    })}
    <p class="field-hint">Hard cap cliente: <strong>${d.maxClientTpsCap} TPS</strong> · Plataforma: <strong>${d.platformMaxTps} TPS</strong> · Limitador en memoria por proceso (ver docs en código).</p>
    <section class="tv-panel" style="margin-top:0.75rem">
      <h2 class="tv-panel__title">Scheduler de cola</h2>
      <p><strong>${escapeHtml(schedulerLabel)}</strong></p>
      <p class="field-hint">Para QA live controlada: <code>SMS_QUEUE_SCHEDULER_ENABLED=false</code> en el VPS (solo tick manual). No modificar .env de producción sin revisión operativa.</p>
    </section>
    <div class="tv-kpi-grid">
      <article class="tv-kpi"><span class="tv-kpi__label">Cola queued</span><span class="tv-kpi__value">${q.queued ?? 0}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Processing</span><span class="tv-kpi__value">${q.processing ?? 0}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Enviados (5 min)</span><span class="tv-kpi__value">${d.sentLast5Min}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Fallidos (5 min)</span><span class="tv-kpi__value">${d.failedLast5Min}</span></article>
    </div>
    <div class="tv-dash-grid tv-dash-grid--2" style="margin-top:1rem">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Rutas pausadas</h2>
        <ul>${d.pausedRoutes.length ? d.pausedRoutes.map((r) => `<li>${escapeHtml(r.name)} (${escapeHtml(r.country)}) · <form method="post" action="/admin/routes/${escapeHtml(r.id)}/resume" style="display:inline"><button class="btn btn-ghost btn-sm">Reanudar</button></form></li>`).join("") : "<li>Ninguna</li>"}</ul>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Proveedores pausados</h2>
        <ul>${d.suspendedProviders.length ? d.suspendedProviders.map((p) => `<li>${escapeHtml(p.name)} · <form method="post" action="/admin/providers/${escapeHtml(p.id)}/resume" style="display:inline"><button class="btn btn-ghost btn-sm">Reanudar</button></form></li>`).join("") : "<li>Ninguno</li>"}</ul>
      </section>
    </div>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Effective TPS por cliente</h2>
      <table class="tv-table tv-table--compact"><thead><tr>
        <th>Cliente</th><th>Cliente TPS</th><th>Effective TPS</th><th>Live</th>
      </tr></thead><tbody>${clientRows}</tbody></table>
    </section>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Consumo por proveedor (5 min)</h2>
      <table class="tv-table tv-table--compact"><thead><tr>
        <th>Proveedor</th><th>Mensajes</th><th>Vendor TPS</th>
      </tr></thead><tbody>${providerRows}</tbody></table>
    </section>`;

  return wrap(opts, body);
}
