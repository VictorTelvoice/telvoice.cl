import type { CampaignDetailView } from "../../services/campaignDetailService.js";
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

function renderCampaignMessagesTable(
  detail: CampaignDetailView,
): string {
  const rows = detail.messages;
  if (!rows.length) {
    return `<p class="field-hint" style="margin:0">Aún no hay mensajes. Usa «Simular campaña» para generar la simulación mock.</p>`;
  }
  const body = rows
    .map(
      (m) => `<tr>
      <td><code>${escapeHtml(m.recipient_number)}</code></td>
      <td>${renderPanelMessageStatusBadge(m.status, m.mode)}</td>
      <td>${renderSmsModeBadge(m.mode)}</td>
      <td>mock</td>
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
        <th>Seg.</th><th>Costo SMS</th><th>Ref. mock</th><th>Creado</th>
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
): string {
  const c = detail.campaign;
  const meta = c.metadata ?? {};
  const executedAt =
    (typeof meta.mock_executed_at === "string" && meta.mock_executed_at) ||
    c.sent_at;

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
    ${renderKpiCard({ label: "Modo", value: detail.kpis.simulationMode, icon: "science", variant: "default" })}
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
    : `<p class="field-hint" style="margin:0">Sin débito wallet aún. Al simular la campaña se registrará un único movimiento <code>sms_debit</code> con referencia <code>sms_campaign</code>.</p>`;

  const timelineSteps = detail.timeline.map((s) => ({
    title: s.title,
    detail: s.at ? `${s.detail} (${formatDate(s.at)})` : s.detail,
    state: s.state,
  }));

  const body = `
    ${renderPageHeader({
      title: escapeHtml(c.name),
      subtitle: `Campaña mock · ${renderCampaignClientStatusBadge(c)} ${renderCampaignModeLabel(c)}`,
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
          <div><dt>Simulación</dt><dd>${executedAt ? formatDate(executedAt) : "—"}</dd></div>
          <div><dt>Costo estimado</dt><dd>${fmtSms(c.estimated_sms_cost)} SMS</dd></div>
          <div><dt>Costo real (mock)</dt><dd>${fmtSms(c.real_sms_cost)} SMS</dd></div>
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
    <section class="tv-panel tv-dash-block" style="margin-top:1rem">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Mensajes simulados</h2>
        <p class="tv-section-head__sub">Solo mock — sin operador ni aSMSC</p>
      </header>
      <div class="tv-panel__body">${renderCampaignMessagesTable(detail)}</div>
    </section>
  </div>`;

  return wrapAppPage(ctx, "campaigns", c.name, body);
}
