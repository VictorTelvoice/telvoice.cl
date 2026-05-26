import type { CampaignDetailView } from "../../services/campaignDetailService.js";
import type { CampaignLiveReadinessResult } from "../../services/campaignReadinessService.js";
import { LIVE_CAMPAIGN_CONFIRM_TEXT } from "../../services/campaignLiveLaunchService.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import { renderOrderTimeline } from "./app-order-ui.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  renderCampaignClientStatusBadge,
  renderCampaignModeLabel,
  renderPanelMessageStatusBadge,
  renderSmsModeBadge,
} from "./app-sms-ui.js";

function renderReadinessStateBadge(
  label: CampaignLiveReadinessResult["readinessLabel"],
): string {
  if (label === "ready") {
    return `<span class="badge badge-ok">Listo</span>`;
  }
  if (label === "not_enabled") {
    return `<span class="badge badge-muted">No habilitado</span>`;
  }
  return `<span class="badge badge-warn">Bloqueado</span>`;
}

function renderLiveReadinessBlock(
  readiness: CampaignLiveReadinessResult,
): string {
  const blockedList = readiness.blockedReasons.length
    ? `<ul class="tv-readiness-list">${readiness.blockedReasons
        .map((r) => `<li>${escapeHtml(r)}</li>`)
        .join("")}</ul>`
    : `<p class="field-hint" style="margin:0">Sin bloqueos operativos detectados.</p>`;

  const warningsBlock = readiness.warnings.length
    ? `<div style="margin-top:0.75rem">
        <p class="field-hint" style="margin:0 0 0.35rem"><strong>Advertencias</strong></p>
        <ul class="tv-readiness-list tv-readiness-list--warn">${readiness.warnings
          .map((w) => `<li>${escapeHtml(w)}</li>`)
          .join("")}</ul>
      </div>`
    : "";

  const permLive = readiness.liveEnabled
    ? `<span class="badge badge-ok">Sí</span>`
    : `<span class="badge badge-muted">No</span>`;
  const permCampaigns = readiness.campaignsEnabled
    ? `<span class="badge badge-ok">Sí</span>`
    : `<span class="badge badge-muted">No</span>`;

  return `<section class="tv-panel tv-dash-block" style="margin-top:1rem">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Preparación para envío real</h2>
      <p class="tv-section-head__sub">Gate operativo — validación de ruta, TPS, saldo y permisos</p>
    </header>
    <div class="tv-panel__body">
      <dl class="tv-detail-dl">
        <div><dt>Estado</dt><dd>${renderReadinessStateBadge(readiness.readinessLabel)}</dd></div>
        <div><dt>Saldo requerido</dt><dd>${fmtSms(readiness.requiredSms)} SMS</dd></div>
        <div><dt>Saldo disponible</dt><dd>${fmtSms(readiness.availableSms)} SMS (${escapeHtml(readiness.balanceStatus)})</dd></div>
        <div><dt>TPS asignado</dt><dd>${readiness.clientMaxTps ?? "—"} (efectivo: ${readiness.effectiveTps ?? "—"})</dd></div>
        <div><dt>Ruta</dt><dd>${escapeHtml(readiness.routeLabel)} <span class="badge badge-muted">${escapeHtml(readiness.routeStatus)}</span></dd></div>
        <div><dt>Proveedor</dt><dd>${escapeHtml(readiness.providerLabel)} <span class="badge badge-muted">${escapeHtml(readiness.providerStatus)}</span></dd></div>
        <div><dt>Rate plan</dt><dd>${escapeHtml(readiness.ratePlanLabel)}</dd></div>
        <div><dt>Permiso campañas reales</dt><dd>${permCampaigns}</dd></div>
        <div><dt>Permiso live_enabled</dt><dd>${permLive}</dd></div>
      </dl>
      <div style="margin-top:1rem">
        <p class="field-hint" style="margin:0 0 0.35rem"><strong>Motivos de bloqueo</strong></p>
        ${blockedList}
        ${warningsBlock}
      </div>
    </div>
  </section>`;
}

function renderLiveLaunchBlock(
  detail: CampaignDetailView,
  readiness: CampaignLiveReadinessResult,
  campaignId: string,
): string {
  const launch = detail.liveLaunch;
  const canLaunch =
    launch?.canLaunch === true &&
    readiness.canGoLive &&
    detail.campaign.status === "draft" &&
    (launch.liveMessageCount ?? 0) === 0;

  const blockReasons = [
    ...(launch?.launchBlockReasons ?? []),
    ...readiness.blockedReasons.filter(
      (r) => !(launch?.launchBlockReasons ?? []).includes(r),
    ),
  ];
  const blockList = blockReasons.length
    ? `<ul class="tv-readiness-list">${blockReasons
        .map((r) => `<li>${escapeHtml(r)}</li>`)
        .join("")}</ul>`
    : "";

  const balanceAfter =
    readiness.availableSms - readiness.requiredSms;

  const form = canLaunch
    ? `<form method="post" action="/app/campaigns/${escapeHtml(campaignId)}/launch-live" class="tv-form-grid" style="margin-top:1rem">
        <label class="tv-checkbox-row">
          <input type="checkbox" name="consent_confirmed" value="1" required />
          Confirmo que tengo autorización para contactar a esta audiencia y entiendo que esta campaña enviará SMS reales.
        </label>
        <label>
          <span class="field-hint">Escribe <strong>${LIVE_CAMPAIGN_CONFIRM_TEXT}</strong> para confirmar</span>
          <input type="text" name="confirm_text" class="tv-input-full" autocomplete="off" required placeholder="${LIVE_CAMPAIGN_CONFIRM_TEXT}" />
        </label>
        <div class="tv-quick-actions">
          <button type="submit" class="btn btn-primary">Enviar campaña real</button>
        </div>
      </form>`
    : `<div class="tv-quick-actions" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" disabled>Enviar campaña real</button>
        ${blockList}
      </div>`;

  return `<section class="tv-panel tv-dash-block" style="margin-top:1rem;border-color:var(--tv-warn-border, #f59e0b)">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Enviar campaña real</h2>
      <p class="tv-section-head__sub tv-text-warn">Esta acción enviará SMS reales y descontará saldo según mensajes aceptados por el proveedor.</p>
    </header>
    <div class="tv-panel__body">
      <dl class="tv-detail-dl">
        <div><dt>Destinatarios válidos</dt><dd>${detail.audience.validCount}</dd></div>
        <div><dt>SMS estimados</dt><dd>${fmtSms(readiness.requiredSms)}</dd></div>
        <div><dt>Saldo disponible</dt><dd>${fmtSms(readiness.availableSms)}</dd></div>
        <div><dt>Saldo posterior est.</dt><dd>${fmtSms(Math.max(0, balanceAfter))}</dd></div>
        <div><dt>TPS efectivo</dt><dd>${readiness.effectiveTps ?? "—"}</dd></div>
      </dl>
      ${form}
      <p class="field-hint" style="margin:1rem 0 0">Los mensajes entrarán a cola; Telvoice los procesará respetando TPS. No se llama al proveedor desde esta pantalla.</p>
    </div>
  </section>`;
}

function renderQueueStatusBlock(detail: CampaignDetailView): string {
  const q = detail.queueByStatus ?? {};
  const m = detail.liveLaunch?.messageByStatus ?? {};
  const rows = [
    ["Cola queued", q.queued ?? 0],
    ["Cola processing", q.processing ?? 0],
    ["Cola sent", q.sent ?? 0],
    ["Cola failed", q.failed ?? 0],
    ["Mensajes queued", m.queued ?? 0],
    ["Mensajes sent", m.sent ?? 0],
    ["Mensajes delivered", m.delivered ?? 0],
    ["Mensajes failed", m.failed ?? 0],
    ["Mensajes pending DLR", m.pending ?? 0],
  ]
    .map(
      ([label, val]) =>
        `<div><dt>${escapeHtml(String(label))}</dt><dd>${val}</dd></div>`,
    )
    .join("");

  return `<section class="tv-panel" style="margin-top:1rem">
    <h2 class="tv-panel__title">Estado de cola y envío</h2>
    <dl class="tv-detail-dl tv-panel__body">${rows}</dl>
  </section>`;
}

function renderCampaignMessageModeBadge(
  detail: CampaignDetailView,
  mode: string | null | undefined,
): string {
  if (detail.viewKind === "production") {
    return `<span class="badge badge-ok">PRODUCCIÓN</span>`;
  }
  return renderSmsModeBadge(mode);
}

function renderCampaignMessagesTable(
  detail: CampaignDetailView,
): string {
  const rows = detail.messages;
  const isProduction = detail.viewKind === "production";
  if (!rows.length) {
    const emptyHint = isProduction
      ? "Aún no hay mensajes registrados para esta campaña."
      : `Aún no hay mensajes. Usa «Simular campaña» para generar la simulación mock.`;
    return `<p class="field-hint" style="margin:0">${emptyHint}</p>`;
  }
  const refCol = isProduction ? "Ref. proveedor" : "Ref. mock";
  const body = rows
    .map(
      (m) => `<tr>
      <td><code>${escapeHtml(m.recipient_number)}</code></td>
      <td>${renderPanelMessageStatusBadge(m.status, isProduction ? "live" : m.mode)}</td>
      <td>${renderCampaignMessageModeBadge(detail, m.mode)}</td>
      <td>${escapeHtml(m.provider ?? "—")}</td>
      <td>${m.segments}</td>
      <td>${m.cost_sms}</td>
      <td><code class="tv-code-sm" title="${escapeHtml(m.provider_message_id ?? "")}">${escapeHtml((m.provider_message_id ?? "—").slice(0, 14))}</code></td>
      <td>${formatDate(m.created_at)}</td>
    </tr>`,
    )
    .join("");
  return `<div class="table-wrap">
    <table class="tv-table tv-table--dash">
      <thead><tr>
        <th>Destinatario</th><th>Estado</th><th>Modo</th><th>Proveedor</th>
        <th>Seg.</th><th>Costo SMS</th><th>${refCol}</th><th>Creado</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

export function renderAppCampaignNotFoundPage(ctx: AppPageContext): string {
  const body = `
    ${renderPageHeader({
      title: "Campaña no encontrada",
      subtitle: "No existe o no pertenece a tu empresa.",
      actions: renderBtn("Volver a campañas", { href: "/app/campaigns", variant: "primary" }),
    })}
    <section class="tv-panel">
      <div class="tv-panel__body">
        <p>Verifica el enlace o crea una nueva campaña desde Contactos.</p>
        <div class="tv-quick-actions" style="margin-top:1rem">
          ${renderBtn("Nueva campaña", { href: "/app/campaigns/new", variant: "secondary" })}
          ${renderBtn("Contactos", { href: "/app/contacts", variant: "ghost" })}
        </div>
      </div>
    </section>`;
  return wrapAppPage(ctx, "campaigns", "Campaña no encontrada", body);
}

export function renderAppCampaignDetailPage(
  ctx: AppPageContext,
  detail: CampaignDetailView,
  liveReadiness: CampaignLiveReadinessResult,
): string {
  const c = detail.campaign;
  const meta = c.metadata ?? {};
  const isProduction = detail.viewKind === "production";
  const executedAt = isProduction
    ? c.sent_at ||
      (typeof meta.queue_finalized_at === "string"
        ? meta.queue_finalized_at
        : null)
    : (typeof meta.mock_executed_at === "string" && meta.mock_executed_at) ||
      c.sent_at;
  const showLiveReadiness = !isProduction && c.status === "draft";
  const showLiveLaunch =
    !isProduction && c.status === "draft" && !(detail.liveLaunch?.launched);
  const showQueueStatus =
    isProduction || detail.liveLaunch?.launched || (detail.queueByStatus?.queued ?? 0) > 0;

  const simulateBtn = detail.canSimulate
    ? `<form method="post" action="/app/campaigns/${escapeHtml(c.id)}/execute-mock" style="display:inline">
        <button type="submit" class="btn btn-primary btn-sm">Simular campaña</button>
      </form>`
    : "";

  const kpis = `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
    ${renderKpiCard({ label: "Destinatarios est.", value: String(detail.kpis.estimatedRecipients), icon: "group", variant: "primary" })}
    ${renderKpiCard({ label: "Mensajes generados", value: String(detail.kpis.messagesGenerated), icon: "sms", variant: "default" })}
    ${renderKpiCard({ label: "SMS consumidos", value: fmtSms(detail.kpis.smsConsumed), icon: "calculate", variant: "primary" })}
    ${renderKpiCard({ label: "Delivered", value: String(detail.kpis.deliveredCount), icon: "check_circle", variant: "success" })}
    ${renderKpiCard({ label: "Saldo descontado", value: fmtSms(detail.kpis.walletDebited), icon: "account_balance_wallet", variant: "default" })}
    ${renderKpiCard({ label: "Modo", value: detail.kpis.simulationMode, icon: isProduction ? "send" : "science", variant: isProduction ? "success" : "default" })}
  </div>`;

  const audienceOmitted = [
    detail.audience.invalidCount > 0
      ? `inválidos/omitidos: ${detail.audience.invalidCount}`
      : null,
    detail.audience.duplicatesOmitted > 0
      ? `deduplicados: ${detail.audience.duplicatesOmitted}`
      : null,
    detail.audience.blockedCount > 0
      ? `bloqueados: ${detail.audience.blockedCount}`
      : null,
    detail.audience.optOutCount > 0
      ? `opt-out: ${detail.audience.optOutCount}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const walletBlock = detail.walletDebit
    ? `<dl class="tv-detail-dl">
        <div><dt>Tipo</dt><dd><code>${escapeHtml(detail.walletDebit.type)}</code></dd></div>
        <div><dt>Referencia</dt><dd><code>${escapeHtml(detail.walletDebit.reference_type ?? "—")}</code> / <code class="tv-code-sm">${escapeHtml(String(detail.walletDebit.reference_id ?? "—").slice(0, 8))}…</code></dd></div>
        <div><dt>SMS descontados</dt><dd>${fmtSms(detail.walletDebit.sms_amount)}</dd></div>
        <div><dt>Saldo antes</dt><dd>${fmtSms(detail.walletDebit.balance_before)}</dd></div>
        <div><dt>Saldo después</dt><dd>${fmtSms(detail.walletDebit.balance_after)}</dd></div>
        <div><dt>Fecha</dt><dd>${formatDate(detail.walletDebit.created_at)}</dd></div>
        <div><dt>Origen</dt><dd>${escapeHtml(String(detail.walletDebit.metadata?.source ?? "—"))}</dd></div>
      </dl>`
    : isProduction && (detail.walletDebitedFromMessages ?? 0) > 0
      ? `<dl class="tv-detail-dl">
        <div><dt>Costo estimado</dt><dd>${fmtSms(c.estimated_sms_cost)} SMS</dd></div>
        <div><dt>Consumo real (mensajes)</dt><dd>${fmtSms(detail.walletDebitedFromMessages ?? 0)} SMS</dd></div>
        <div><dt>Referencia</dt><dd><code>sms_message</code> por mensaje aceptado</dd></div>
      </dl>`
      : `<p class="field-hint" style="margin:0">${isProduction ? "El consumo se debitará por cada mensaje aceptado por el proveedor (cola)." : "Sin débito wallet aún. Al simular la campaña se registrará un único movimiento <code>sms_debit</code> con referencia <code>sms_campaign</code>."}</p>`;

  const timelineSteps = detail.timeline.map((s) => ({
    title: s.title,
    detail: s.at ? `${s.detail} (${formatDate(s.at)})` : s.detail,
    state: s.state,
  }));

  const pageSubtitle = isProduction
    ? `Envío real · ${renderCampaignClientStatusBadge(c)} ${renderCampaignModeLabel(c)}`
    : `Campaña mock · ${renderCampaignClientStatusBadge(c)} ${renderCampaignModeLabel(c)}`;

  const messagesSection = isProduction
    ? `<section class="tv-panel tv-dash-block" style="margin-top:1rem">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Mensajes enviados</h2>
        <p class="tv-section-head__sub">Registro en panel — operador y DLR según proveedor</p>
      </header>
      <div class="tv-panel__body">${renderCampaignMessagesTable(detail)}</div>
    </section>`
    : `<section class="tv-panel tv-dash-block" style="margin-top:1rem">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Mensajes simulados</h2>
        <p class="tv-section-head__sub">Solo mock — sin operador ni aSMSC</p>
      </header>
      <div class="tv-panel__body">${renderCampaignMessagesTable(detail)}</div>
    </section>`;

  const body = `
    ${renderPageHeader({
      title: escapeHtml(c.name),
      subtitleHtml: pageSubtitle,
      actions: [
        simulateBtn,
        renderBtn("Ver reportes", { href: "/app/reports", variant: "secondary" }),
        renderBtn("Ver wallet", { href: "/app/wallet", variant: "secondary" }),
        renderBtn("Campañas", { href: "/app/campaigns", variant: "ghost" }),
      ]
        .filter(Boolean)
        .join(" "),
    })}
  <div class="tv-client-dashboard tv-dlr-report">
    ${kpis}
    <div class="tv-dash-grid tv-dash-grid--2" style="margin-top:1rem">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Resumen</h2>
        <dl class="tv-detail-dl tv-panel__body">
          <div><dt>Estado</dt><dd>${renderCampaignClientStatusBadge(c)}</dd></div>
          <div><dt>Modo</dt><dd>${renderCampaignModeLabel(c)}</dd></div>
          <div><dt>Creada</dt><dd>${formatDate(c.created_at)}</dd></div>
          <div><dt>${isProduction ? "Enviada" : "Simulación"}</dt><dd>${executedAt ? formatDate(executedAt) : "—"}</dd></div>
          <div><dt>Costo estimado</dt><dd>${fmtSms(c.estimated_sms_cost)} SMS</dd></div>
          <div><dt>${isProduction ? "Costo real" : "Costo real (mock)"}</dt><dd>${fmtSms(c.real_sms_cost)} SMS</dd></div>
        </dl>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Timeline</h2>
        <div class="tv-panel__body">${renderOrderTimeline(timelineSteps)}</div>
      </section>
    </div>
    <div class="tv-dash-grid tv-dash-grid--2" style="margin-top:1rem">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Audiencia</h2>
        <dl class="tv-detail-dl tv-panel__body">
          <div><dt>Tipo</dt><dd>${escapeHtml(detail.audience.typeLabel)}</dd></div>
          <div><dt>Origen</dt><dd>${escapeHtml(detail.audience.sourceLabel)}</dd></div>
          <div><dt>Válidos</dt><dd>${detail.audience.validCount}</dd></div>
          <div><dt>Estimados</dt><dd>${detail.audience.estimatedRecipients}</dd></div>
          ${audienceOmitted ? `<div><dt>Omitidos</dt><dd>${escapeHtml(audienceOmitted)}</dd></div>` : ""}
        </dl>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Mensaje</h2>
        <dl class="tv-detail-dl tv-panel__body">
          <div><dt>Remitente</dt><dd>${escapeHtml(detail.messageInfo.senderId)}</dd></div>
          <div><dt>Encoding</dt><dd>${escapeHtml(detail.messageInfo.encoding)}</dd></div>
          <div><dt>Segmentos</dt><dd>${detail.messageInfo.segmentsPerMessage}</dd></div>
          <div><dt>Caracteres</dt><dd>${detail.messageInfo.characters}</dd></div>
        </dl>
        <div class="tv-panel__body" style="padding-top:0">
          <pre class="tv-code-block" style="white-space:pre-wrap;margin:0;font-size:0.85rem">${escapeHtml(detail.messageInfo.text)}</pre>
        </div>
      </section>
    </div>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Wallet</h2>
      <div class="tv-panel__body">${walletBlock}</div>
    </section>
    ${showLiveReadiness ? renderLiveReadinessBlock(liveReadiness) : ""}
    ${showLiveLaunch ? renderLiveLaunchBlock(detail, liveReadiness, c.id) : ""}
    ${showQueueStatus ? renderQueueStatusBlock(detail) : ""}
    ${messagesSection}
  </div>`;

  return wrapAppPage(ctx, "campaigns", c.name, body);
}
