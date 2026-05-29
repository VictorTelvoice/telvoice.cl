import type { CampaignPreviewResult } from "../../types/campaign-audience.js";
import { escapeHtml } from "../../utils/html.js";
import { fmtSms } from "./app-page-wrap.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderBtn, renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";
import { audienceHiddenFields } from "../../services/campaignPreviewService.js";

export type AppCampaignNewPageData = {
  preview: CampaignPreviewResult;
  defaultSenderId: string;
  noAudience?: boolean;
};

function audienceStep(preview: CampaignPreviewResult): string {
  const a = preview.audience;
  const omittedNote =
    a.totalFound > a.validCount
      ? `<p class="alert alert-warn" style="margin-top:0.75rem">Algunos contactos fueron omitidos por estar bloqueados, opt-out, teléfono inválido o duplicado.</p>`
      : "";

  return `<section class="tv-panel" id="paso-audiencia">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">1. Audiencia</h2>
      <p class="tv-section-head__sub">${escapeHtml(a.sourceLabel)}</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
        ${renderKpiCard({ label: "Encontrados", value: String(a.totalFound), icon: "groups", variant: "default" })}
        ${renderKpiCard({ label: "Válidos", value: String(a.validCount), icon: "check_circle", variant: "success" })}
        ${renderKpiCard({ label: "Inválidos", value: String(a.invalidCount), icon: "error", variant: a.invalidCount ? "warn" : "default" })}
        ${renderKpiCard({ label: "Bloqueados", value: String(a.blockedCount), icon: "block", variant: "default" })}
        ${renderKpiCard({ label: "Opt-out", value: String(a.optOutCount), icon: "do_not_disturb", variant: "default" })}
        ${renderKpiCard({ label: "Duplicados omitidos", value: String(a.duplicatesOmitted), icon: "content_copy", variant: a.duplicatesOmitted ? "warn" : "default" })}
      </div>
      ${omittedNote}
    </div>
  </section>`;
}

function messageStep(preview: CampaignPreviewResult, defaultSender: string): string {
  const hidden = Object.entries(audienceHiddenFields(preview.audience))
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
    .join("");

  return `<section class="tv-panel" id="paso-mensaje">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">2. Mensaje</h2>
      <p class="tv-section-head__sub">Define remitente y texto para calcular segmentos y costo</p>
    </header>
    <div class="tv-panel__body">
      <form method="post" action="/app/campaigns/new/preview" class="tv-dlr-report__filters-form">
        ${hidden}
        <div class="tv-dlr-report__filters-grid" style="grid-template-columns:1fr 1fr">
          ${renderFilterField("Nombre campaña", `<input type="text" name="campaign_name" class="tv-filter-input" value="${escapeHtml(preview.campaignName)}" required />`)}
          ${renderFilterField("Sender ID", `<input type="text" name="sender_id" class="tv-filter-input" value="${escapeHtml(preview.senderId || defaultSender)}" maxlength="11" pattern="[A-Za-z0-9]+" required />`)}
          ${renderFilterField("Mensaje SMS", `<textarea name="message" class="tv-filter-input" rows="5" required>${escapeHtml(preview.message)}</textarea>`)}
        </div>
        <div class="tv-dlr-report__filter-actions">
          <button type="submit" class="btn btn-primary btn-sm">Actualizar previsualización</button>
        </div>
      </form>
      <div class="tv-kpi-grid tv-kpi-grid--client" style="margin-top:1rem">
        ${renderKpiCard({ label: "Caracteres", value: String(preview.characters), hint: preview.encoding, icon: "text_fields", variant: "default" })}
        ${renderKpiCard({ label: "Segmentos / SMS", value: String(preview.segmentsPerMessage), hint: "Por destinatario", icon: "layers", variant: "primary" })}
      </div>
      <div class="tv-panel" style="margin-top:0.75rem;padding:0.75rem 1rem;background:var(--tv-surface-2)">
        <strong>Vista previa</strong>
        <p style="margin:0.5rem 0 0;white-space:pre-wrap">${escapeHtml(preview.message || "—")}</p>
      </div>
    </div>
  </section>`;
}

function economicsStep(preview: CampaignPreviewResult): string {
  const warn = preview.blockReason
    ? `<p class="alert alert-error">${escapeHtml(preview.blockReason)}</p>`
    : preview.audience.validCount < preview.audience.totalFound
      ? `<p class="alert alert-warn">Algunas filas fueron omitidas por errores.</p>`
      : "";

  return `<section class="tv-panel" id="paso-costo">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">3. Resumen económico</h2>
      <p class="tv-section-head__sub">Estimación sin descontar saldo ni enviar SMS</p>
    </header>
    <div class="tv-panel__body">
      ${warn}
      <div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
        ${renderKpiCard({ label: "Destinatarios válidos", value: String(preview.validRecipientCount), icon: "person", variant: "primary" })}
        ${renderKpiCard({ label: "SMS por destinatario", value: String(preview.segmentsPerMessage), icon: "sms", variant: "default" })}
        ${renderKpiCard({ label: "Total SMS estimado", value: fmtSms(preview.totalSmsEstimated), icon: "calculate", variant: "primary" })}
        ${renderKpiCard({ label: "Saldo disponible", value: fmtSms(preview.balanceAvailable), icon: "account_balance_wallet", variant: "default" })}
        ${renderKpiCard({ label: "Saldo después", value: fmtSms(Math.max(0, preview.balanceAfter)), icon: "savings", variant: preview.balanceAfter >= 0 ? "success" : "danger" })}
      </div>
    </div>
  </section>`;
}

function confirmStep(preview: CampaignPreviewResult): string {
  const hidden = Object.entries(audienceHiddenFields(preview.audience))
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
    .join("");

  return `<section class="tv-panel" id="paso-confirmar">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">4. Confirmación</h2>
      <p class="tv-section-head__sub">Guarda un borrador; luego confirma el envío real desde el detalle de la campaña</p>
    </header>
    <div class="tv-panel__body">
      <p class="alert alert-warn">
        Guardar borrador no envía SMS ni descuenta saldo.
        Desde el detalle de la campaña podrás revisar la preparación operativa y lanzar el envío real a cola.
      </p>
      <form method="post" action="/app/campaigns/drafts" class="tv-dlr-report__filters-form">
        ${hidden}
        <input type="hidden" name="campaign_name" value="${escapeHtml(preview.campaignName)}" />
        <input type="hidden" name="sender_id" value="${escapeHtml(preview.senderId)}" />
        <textarea name="message" hidden>${escapeHtml(preview.message)}</textarea>
        <div class="tv-dlr-report__filter-actions" style="margin-top:0.75rem">
          <button type="submit" class="btn btn-primary btn-sm" ${preview.validRecipientCount === 0 ? "disabled" : ""}>Guardar borrador</button>
          <a class="btn btn-secondary btn-sm" href="/app/campaigns">Ir a campañas</a>
        </div>
      </form>
      <p class="field-hint" style="margin-top:0.5rem">Tras guardar, abre el detalle de la campaña y usa «Enviar campaña real» cuando estés listo.</p>
    </div>
  </section>`;
}

function noAudienceState(): string {
  return `<section class="tv-panel">
    <div class="tv-panel__body tv-coming-soon">
      <span class="material-symbols-outlined" aria-hidden="true">campaign</span>
      <h2 style="margin-top:1rem">Selecciona una audiencia</h2>
      <p class="tv-page-sub">Filtra Contactos por agenda; el identificador de la agenda aparece en la URL (<code>?agenda=…</code>). Usa ese ID en <strong>Nueva campaña</strong> como <code>/app/campaigns/new?list_id=…</code>, o envía masivo desde <strong>Enviar SMS</strong> eligiendo la agenda.</p>
      ${renderBtn("Ir a contactos", { href: "/app/contacts", variant: "primary" })}
    </div>
  </section>`;
}

export function renderAppCampaignNewPage(
  ctx: AppPageContext,
  data: AppCampaignNewPageData,
): string {
  const body = `
    <div class="tv-client-dashboard tv-dlr-report tv-campaign-new">
    ${renderPageHeader({
      title: "Nueva campaña",
      subtitle: "Previsualiza audiencia, mensaje y costo estimado sin enviar SMS.",
      actions: [
        renderBtn("Contactos", { href: "/app/contacts", variant: "ghost" }),
        renderBtn("Campañas", { href: "/app/campaigns", variant: "secondary" }),
      ].join(" "),
    })}
    ${data.noAudience ? noAudienceState() : `
      ${audienceStep(data.preview)}
      ${messageStep(data.preview, data.defaultSenderId)}
      ${economicsStep(data.preview)}
      ${confirmStep(data.preview)}
    `}
    </div>`;

  return wrapAppPage(ctx, "campaigns", "Nueva campaña", body);
}
