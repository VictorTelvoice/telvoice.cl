import type { AdminSessionUser } from "../../../types/admin.js";
import type { TrafficControlDashboard } from "../../../services/smsTrafficMetricsService.js";
import type { SmsQueueRuntimeConfig } from "../../../services/smsQueueRuntimeConfigService.js";
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

/** Panel compacto reutilizable (wallet, dashboard, etc.). */
export function renderSchedulerRuntimeCompactPanel(
  rt: SmsQueueRuntimeConfig,
): string {
  const healthBadge =
    rt.health === "ok"
      ? `<span class="badge badge-ok">Scheduler OK</span>`
      : rt.health === "slow"
        ? `<span class="badge badge-warn">Scheduler lento</span>`
        : rt.health === "critical"
          ? `<span class="badge badge-err">Scheduler crítico</span>`
          : `<span class="badge badge-muted">Scheduler manual</span>`;

  const warn =
    rt.warnings.length > 0
      ? `<p class="field-hint" style="margin:0.5rem 0 0;color:var(--err,#b91c1c)">${escapeHtml(rt.warnings[0] ?? "")}</p>`
      : "";

  return `<section class="tv-panel" style="margin-top:0.75rem;border-left:4px solid var(--primary,#2563eb)">
    <h2 class="tv-panel__title">Despacho de campañas (servidor)</h2>
    <div class="tv-panel__body">
      <p style="margin:0">${healthBadge} · intervalo <strong>${rt.scheduler.intervalSeconds}s</strong> · batch <strong>${rt.scheduler.batchSize}</strong> · pacing <strong>${rt.campaignQueue.queueMinPaceSeconds}s</strong>/destinatario</p>
      <p class="field-hint" style="margin:0.35rem 0 0">Referencia Test13: intervalo <strong>1s</strong>, batch <strong>20</strong>. Si ves <strong>60s</strong>, las masivas tardan ~1 SMS/min.</p>
      ${warn}
      <p style="margin:0.75rem 0 0">
        <a href="/admin/traffic-control" class="btn btn-primary btn-sm">Abrir Tráfico / TPS (detalle completo)</a>
        <a href="/admin/traffic-control/scheduler-config.json" class="btn btn-ghost btn-sm" target="_blank" rel="noopener">JSON</a>
      </p>
    </div>
  </section>`;
}

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
  const rt = d.queueRuntime;
  const healthBadge =
    rt.health === "ok"
      ? `<span class="badge badge-ok">OK</span>`
      : rt.health === "slow"
        ? `<span class="badge badge-warn">Lento</span>`
        : rt.health === "critical"
          ? `<span class="badge badge-err">Crítico</span>`
          : `<span class="badge badge-muted">Manual</span>`;
  const schedulerLabel = sch.enabled
    ? `Activo — cada ${sch.intervalSeconds}s, batch ${sch.batchSize}`
    : "Inactivo (solo tick manual)";

  const warningsBlock = rt.warnings.length
    ? `<ul class="tv-readiness-list tv-readiness-list--warn" style="margin:0.75rem 0 0">${rt.warnings
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join("")}</ul>`
    : `<p class="field-hint" style="margin:0.75rem 0 0">Config alineada con referencia Test13.</p>`;

  const snapshotRows = rt.recentCampaignSnapshots.length
    ? rt.recentCampaignSnapshots
        .map(
          (c) => `<tr>
        <td>${escapeHtml(c.name)}</td>
        <td><code>${escapeHtml(c.source ?? "—")}</code></td>
        <td>${escapeHtml(c.sendMode ?? "—")}</td>
        <td>${c.schedulerIntervalSeconds ?? "—"}</td>
        <td>${c.schedulerBatchSize ?? "—"}</td>
        <td>${c.effectiveTps ?? "—"}</td>
        <td>${escapeHtml(c.createdAt ? new Date(c.createdAt).toLocaleString("es-CL") : "—")}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="7">Sin campañas recientes.</td></tr>`;

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
      <h2 class="tv-panel__title">Scheduler de cola (config efectiva del proceso)</h2>
      <p style="margin:0"><strong>${escapeHtml(schedulerLabel)}</strong> ${healthBadge}</p>
      <p class="field-hint" style="margin:0.35rem 0 0">${escapeHtml(rt.estimatedThroughput.description)}</p>
      ${warningsBlock}
      <dl class="tv-detail-dl" style="margin-top:1rem">
        <div><dt>Estado salud</dt><dd>${healthBadge}</dd></div>
        <div><dt>Referencia Test13</dt><dd>intervalo <strong>${rt.referenceTest13.intervalSeconds}s</strong>, batch <strong>${rt.referenceTest13.batchSize}</strong>, pacing <strong>${rt.referenceTest13.queueMinPaceSeconds}s</strong> entre destinatarios</dd></div>
        <div><dt>Variables scheduler</dt><dd><code>${rt.scheduler.env.enabled}</code>=${rt.scheduler.enabled ? "true" : "false"} · <code>${rt.scheduler.env.intervalSeconds}</code>=<strong>${rt.scheduler.intervalSeconds}</strong> · <code>${rt.scheduler.env.batchSize}</code>=<strong>${rt.scheduler.batchSize}</strong></dd></div>
        <div><dt>Cola campañas</dt><dd><code>${rt.campaignQueue.env.trafficType}</code>=${escapeHtml(rt.campaignQueue.trafficType)} · <code>${rt.campaignQueue.env.queueMinPaceSeconds}</code>=${rt.campaignQueue.queueMinPaceSeconds}s (~${rt.campaignQueue.queueMinPaceMs}ms entre ítems encolados)</dd></div>
        <div><dt>Guards despacho</dt><dd>1 aSMSC/tick · lock in-process · stagger en encolado · reintentos IP con backoff</dd></div>
      </dl>
      <p class="field-hint">${escapeHtml(rt.referenceTest13.note)}</p>
      <p style="margin-top:0.75rem">
        <a class="btn btn-ghost btn-sm" href="/admin/traffic-control/scheduler-config.json" target="_blank" rel="noopener">Ver JSON (API diagnóstico)</a>
      </p>
    </section>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Snapshot scheduler en campañas recientes</h2>
      <p class="field-hint" style="margin:0 0 0.5rem">Valor guardado al crear la campaña (confirma qué tenía el VPS en ese momento). Test23 con <code>60</code> explica la lentitud.</p>
      <table class="tv-table tv-table--compact"><thead><tr>
        <th>Campaña</th><th>Source</th><th>Modo</th><th>Interval (snap)</th><th>Batch (snap)</th><th>TPS efect.</th><th>Creada</th>
      </tr></thead><tbody>${snapshotRows}</tbody></table>
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
