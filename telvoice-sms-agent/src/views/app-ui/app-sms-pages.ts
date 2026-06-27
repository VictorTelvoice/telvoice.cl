import type {
  MockSmsSendResult,
  PanelCampaignSendResult,
} from "../../types/sms-panel.js";
import type { SmsCampaignRow } from "../../types/sms-panel.js";
import type { PanelSmsMessageRow } from "../../types/sms-panel.js";
import type { LiveTestSendPageStatus } from "../../services/smsLiveTestLimiterService.js";
import { isDailySendLimitEnforced } from "../../services/smsLiveTestLimiterService.js";
import type { SendControlPanelView } from "../../services/smsSendControlPanelService.js";
import { escapeHtml } from "../../utils/html.js";
import { renderKpiCard } from "../admin-ui/components.js";
import type { ClientSmsTemplateStatus } from "../../types/sms-templates.js";
import {
  resolveAccreditedCompanyName,
  suggestSenderIdFromCompany,
} from "../../utils/suggestSenderId.js";
import {
  renderBtn,
  renderHeroPhonePreview,
  renderModeCards,
  renderPageHeader,
  renderFilterField,
  renderStatChip,
} from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  type ClientTableLimit,
  renderClientDataTablePanel,
  renderClientTableFooter,
} from "./client-table-kit.js";
import {
  renderCampaignsTableRows,
  renderInboxTableRows,
  renderPanelMessageStatusBadge,
} from "./app-sms-ui.js";
import {
  APP_SCHEDULE_TIMEZONE,
  formatScheduleInTimeZone,
} from "../../utils/scheduleTime.js";

function renderSendMessageValidationChips(): string {
  return `<div class="tv-stat-chips tv-stat-chips--send-aside tv-validation-chips">
    ${renderStatChip("Caracteres", "0", "default")}
    ${renderStatChip("Segmentos", "0", "primary")}
    ${renderStatChip("Costo est.", "0 SMS", "primary")}
    ${renderStatChip("Codificación", "GSM-7", "default")}
  </div>`;
}

export type SendSmsPageOptions = {
  error?: string;
  flash?: string;
  activeMode?: "single" | "mass" | "scheduled" | "template";
  sendResult?: MockSmsSendResult | null;
  campaignResult?: PanelCampaignSendResult | null;
  sendEnabled?: boolean;
  liveTestStatus?: LiveTestSendPageStatus | null;
  controlPanel?: SendControlPanelView | null;
  /** Clave de un solo uso; evita envíos duplicados en servidor. */
  idempotencyKey?: string;
  contactLists?: SendPageContactListPick[];
  smsTemplates?: SendPageTemplatePick[];
};

export type SendPageTemplatePick = {
  id: string;
  name: string;
  message: string;
  status: ClientSmsTemplateStatus;
};

export type SendPageContactListPick = {
  id: string;
  name: string;
  count: number;
  phones: string[];
};

function renderAgendaPickOptions(lists: SendPageContactListPick[]): string {
  if (!lists.length) {
    return `<option value="">Contactos</option>`;
  }
  const items = lists
    .map(
      (list) =>
        `<option value="${escapeHtml(list.id)}" data-phones="${escapeHtml(list.phones.join("\n"))}">${escapeHtml(list.name)} (${list.count})</option>`,
    )
    .join("");
  return `<option value="">Contactos</option>${items}`;
}

function renderTemplateOptions(
  templates: SendPageTemplatePick[],
  disabled: boolean,
): string {
  const dis = disabled ? " disabled" : "";
  const active = templates.filter((t) => t.status === "active");
  if (!active.length) {
    return `<option value=""${dis}>— Sin plantillas activas —</option>`;
  }
  return `<option value=""${dis}>Selecciona una plantilla</option>${active
    .map(
      (t) =>
        `<option value="${escapeHtml(t.id)}" data-message="${escapeHtml(t.message)}" data-status="${escapeHtml(t.status)}"${dis}>${escapeHtml(t.name)}</option>`,
    )
    .join("")}`;
}

type AppSendMode = "single" | "mass" | "scheduled" | "template";

function sendModeDisplayLabel(mode: AppSendMode): string {
  const labels: Record<AppSendMode, string> = {
    single: "SMS individual",
    mass: "Campaña masiva",
    scheduled: "Envío programado",
    template: "Desde plantilla",
  };
  return labels[mode] ?? mode;
}

function defaultCampaignNameForMode(mode: AppSendMode): string {
  const names: Record<AppSendMode, string> = {
    single: "SMS individual",
    mass: "Campaña masiva",
    scheduled: "Envío programado",
    template: "Envío desde plantilla",
  };
  return names[mode];
}

/** Nombre legible en modal; evita “Campaña masiva” cuando el modo real es plantilla. */
function campaignDisplayName(activeMode: AppSendMode, rawName: string): string {
  const trimmed = rawName.trim();
  const def = defaultCampaignNameForMode(activeMode);
  if (!trimmed) return def;
  if (activeMode === "template" && trimmed === "Campaña masiva") return def;
  if (activeMode === "scheduled" && trimmed === "Campaña masiva") return def;
  return trimmed;
}

function sendConfirmSuccessMeta(
  activeMode: AppSendMode,
  campaignResult?: PanelCampaignSendResult | null,
  sendResult?: MockSmsSendResult | null,
): {
  title: string;
  subtitle: string;
  hint?: string;
  variant: string;
  icon: string;
} {
  if (campaignResult) {
    const isQueued = campaignResult.queued > 0 && campaignResult.sent === 0;
    const isScheduled =
      activeMode === "scheduled" || campaignResult.mode === "scheduled";
    if (isScheduled && isQueued) {
      return {
        title: "Envío programado",
        subtitle:
          "Tus mensajes quedaron programados para la fecha seleccionada.",
        hint: "Puedes seguir el avance desde Bandeja o Campañas.",
        variant: "scheduled",
        icon: "event_available",
      };
    }
    if (isQueued) {
      return {
        title: "Campaña aceptada",
        subtitle:
          "Tus mensajes fueron recibidos correctamente y quedaron en cola para procesamiento.",
        hint: "Puedes seguir el avance desde Bandeja o Campañas.",
        variant: "queued",
        icon: "task_alt",
      };
    }
    if (isScheduled) {
      return {
        title: "Campaña programada",
        subtitle: "Los mensajes se enviarán según la programación configurada.",
        hint: "Puedes seguir el avance desde Bandeja o Campañas.",
        variant: "scheduled",
        icon: "schedule_send",
      };
    }
    return {
      title: "Campaña completada",
      subtitle: "El despacho masivo finalizó correctamente.",
      hint: "Puedes revisar el detalle en Bandeja o Campañas.",
      variant: "success",
      icon: "check_circle",
    };
  }
  if (sendResult) {
    return {
      title: "SMS enviado",
      subtitle: "Tu mensaje fue registrado y está en proceso de entrega.",
      hint: "Puedes seguir el estado en Bandeja.",
      variant: "success",
      icon: "check_circle",
    };
  }
  return {
    title: "Envío confirmado",
    subtitle: "La operación se completó correctamente.",
    variant: "success",
    icon: "check_circle",
  };
}

function renderConfirmStat(label: string, value: string, accent?: boolean): string {
  return `<div class="tv-send-confirm-stat${accent ? " tv-send-confirm-stat--accent" : ""}">
    <span class="tv-send-confirm-stat__value">${escapeHtml(value)}</span>
    <span class="tv-send-confirm-stat__label">${escapeHtml(label)}</span>
  </div>`;
}

function renderSendConfirmModal(opts: {
  flash?: string;
  activeMode: AppSendMode;
  campaignResult?: PanelCampaignSendResult | null;
  sendResult?: MockSmsSendResult | null;
}): string {
  const { flash, activeMode, campaignResult, sendResult } = opts;
  if (!flash && !campaignResult && !sendResult) return "";

  const meta = sendConfirmSuccessMeta(activeMode, campaignResult, sendResult);
  let statsHtml = "";
  let metaRowsHtml = "";
  let opsNoteHtml = "";
  let footSecondary = "";

  if (campaignResult) {
    const scheduledLabel = campaignResult.scheduledAt
      ? formatScheduleInTimeZone(
          campaignResult.scheduledAt,
          APP_SCHEDULE_TIMEZONE,
        )
      : "";
    const isQueued = campaignResult.queued > 0 && campaignResult.sent === 0;
    const smsStatLabel = isQueued ? "SMS estimados" : "SMS debitados";
    const smsStatValue = isQueued
      ? String(campaignResult.queued)
      : String(campaignResult.smsConsumed);

    statsHtml = `<div class="tv-send-confirm-modal__stats">
      ${renderConfirmStat("Destinatarios", String(campaignResult.totalRecipients), true)}
      ${isQueued
        ? renderConfirmStat("En cola", String(campaignResult.queued), true)
        : renderConfirmStat("Enviados", String(campaignResult.sent), true)}
      ${renderConfirmStat(smsStatLabel, smsStatValue)}
      ${renderConfirmStat("Saldo actual", `${fmtSms(campaignResult.balanceAfter)} SMS`)}
    </div>`;

    metaRowsHtml = `<dl class="tv-send-confirm-modal__meta">
      <div class="tv-send-confirm-meta-row">
        <dt>Modo</dt>
        <dd>${escapeHtml(sendModeDisplayLabel(activeMode))}</dd>
      </div>
      <div class="tv-send-confirm-meta-row">
        <dt>Campaña</dt>
        <dd>${escapeHtml(campaignDisplayName(activeMode, campaignResult.campaignName))}</dd>
      </div>
      ${scheduledLabel
        ? `<div class="tv-send-confirm-meta-row">
            <dt>Programado para</dt>
            <dd>${escapeHtml(scheduledLabel)}</dd>
          </div>`
        : ""}
    </dl>`;

    if (isQueued) {
      opsNoteHtml = `<p class="tv-send-confirm-modal__ops-note">El despacho se procesa en segundo plano según la capacidad disponible de la ruta. No es necesario mantener esta pantalla abierta.</p>`;
    }

    footSecondary = `<a href="/app/campaigns" class="btn btn-secondary btn-sm tv-send-confirm-modal__foot-btn">Ver campañas</a>
      <a href="/app/inbox" class="btn btn-secondary btn-sm tv-send-confirm-modal__foot-btn">Ir a bandeja</a>`;
  } else if (sendResult) {
    statsHtml = `<div class="tv-send-confirm-modal__stats tv-send-confirm-modal__stats--3">
      ${renderConfirmStat("Destino", sendResult.recipientNumber)}
      ${renderConfirmStat("Segmentos", String(sendResult.segments), true)}
      ${renderConfirmStat("Saldo actual", `${fmtSms(sendResult.balanceAfter)} SMS`)}
    </div>`;
    metaRowsHtml = `<dl class="tv-send-confirm-modal__meta">
      <div class="tv-send-confirm-meta-row">
        <dt>Modo</dt>
        <dd>${escapeHtml(sendModeDisplayLabel(activeMode))}</dd>
      </div>
      <div class="tv-send-confirm-meta-row">
        <dt>Estado</dt>
        <dd>${renderPanelMessageStatusBadge(sendResult.status, sendResult.sendMode)}</dd>
      </div>
    </dl>`;
    opsNoteHtml = `<p class="tv-send-confirm-modal__ops-note">El estado «Entregado» se actualiza cuando el operador confirma la entrega vía webhook DLR.</p>`;
    footSecondary = `<a href="/app/inbox" class="btn btn-secondary btn-sm tv-send-confirm-modal__foot-btn">Ir a bandeja</a>`;
  } else if (flash) {
    metaRowsHtml = `<p class="tv-send-confirm-modal__lead">${escapeHtml(flash)}</p>`;
    footSecondary = `<a href="/app/inbox" class="btn btn-secondary btn-sm tv-send-confirm-modal__foot-btn">Ir a bandeja</a>`;
  }

  const hintHtml = meta.hint
    ? `<p class="tv-send-confirm-modal__hint">${escapeHtml(meta.hint)}</p>`
    : "";

  return `<div class="tv-send-confirm-modal" id="tv-send-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="tv-send-confirm-title" aria-hidden="false">
    <div class="tv-send-confirm-modal__backdrop" data-tv-send-confirm-close tabindex="-1"></div>
    <div class="tv-send-confirm-modal__panel tv-send-confirm-modal__panel--${meta.variant}">
      <button type="button" class="tv-send-confirm-modal__close" data-tv-send-confirm-close aria-label="Cerrar">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
      <header class="tv-send-confirm-modal__hero">
        <div class="tv-send-confirm-modal__icon-wrap tv-send-confirm-modal__icon-wrap--${meta.variant}" aria-hidden="true">
          <span class="material-symbols-outlined tv-send-confirm-modal__icon">${meta.icon}</span>
        </div>
        <h2 class="tv-send-confirm-modal__title" id="tv-send-confirm-title">${escapeHtml(meta.title)}</h2>
        <p class="tv-send-confirm-modal__subtitle">${escapeHtml(meta.subtitle)}</p>
        ${hintHtml}
      </header>
      <div class="tv-send-confirm-modal__body">
        ${statsHtml}
        ${metaRowsHtml}
        ${opsNoteHtml}
      </div>
      <footer class="tv-send-confirm-modal__foot">
        <div class="tv-send-confirm-modal__foot-actions">
          ${footSecondary}
          <button type="button" class="btn btn-primary tv-send-confirm-modal__foot-btn tv-send-confirm-modal__foot-btn--primary" data-tv-send-confirm-close>Entendido</button>
        </div>
      </footer>
    </div>
  </div>`;
}

export function renderAppSendSmsPage(
  ctx: AppPageContext,
  opts: SendSmsPageOptions = {},
): string {
  const avail = ctx.balance.availableSms;
  const errorBlock = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : "";

  const lt = opts.liveTestStatus;
  const panel = opts.controlPanel;
  const canSubmit = lt?.canSelectLiveTest ?? false;
  const defaultVerifyMsg = panel?.defaultVerifyMessage ?? "";

  const verifyPhonesForJs = panel
    ? panel.verifyNumbers.map((v) => v.entry.phone)
    : [];
  const envAllowed = lt?.allowedNumbersNormalized ?? [];
  const numbersRestricted = lt?.authorizedNumbersConfigured ?? false;
  const allowedLiveNumbers = numbersRestricted
    ? [...new Set([...envAllowed, ...verifyPhonesForJs])]
    : [];

  const dailyRemaining = !lt
    ? "—"
    : isDailySendLimitEnforced()
      ? lt.trafficDailyRemaining != null && lt.trafficDailyLimit != null
        ? `${lt.trafficDailyRemaining} / ${lt.trafficDailyLimit}`
        : `${lt.dailyRemaining} / ${lt.dailyLimit}`
      : `${lt.dailyUsed} hoy`;

  const disabledAttr = "";
  const submitDisabled = canSubmit ? "" : "disabled";
  const submitBlockAlert =
    !canSubmit && lt?.liveTestBlockReason
      ? `<div class="alert alert-warn tv-send-block-reason" role="status">${escapeHtml(lt.liveTestBlockReason)}</div>`
      : !canSubmit
        ? `<div class="alert alert-warn tv-send-block-reason" role="status">Puedes preparar el mensaje; el envío se habilitará cuando tu cuenta cumpla los requisitos del checklist.</div>`
        : "";
  const accreditedCompanyName = resolveAccreditedCompanyName(ctx.company);
  const suggestedSenderId = suggestSenderIdFromCompany(ctx.company);
  const companyDisplayName = accreditedCompanyName || "Tu empresa";

  const headerNavBtn = (label: string, href: string, icon: string) =>
    `<a href="${escapeHtml(href)}" class="btn btn-ghost btn-sm tv-head-nav-btn" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      <span class="material-symbols-outlined tv-head-nav-btn__icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span class="tv-head-nav-btn__label">${escapeHtml(label)}</span>
    </a>`;

  const headerActions = `
    ${headerNavBtn("Bandeja", "/app/inbox", "inbox")}
    ${headerNavBtn("Reportes", "/app/reports", "bar_chart")}
    <button type="submit" form="tv-app-send-form" class="tv-btn-campaign tv-header-send-btn" id="tv-header-send-btn" ${submitDisabled}>
      <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">send</span>
      Enviar SMS
    </button>`;

  const activeMode = opts.activeMode ?? "single";

  const modes = renderModeCards(
    [
      {
        id: "single",
        label: "SMS individual",
        description: "Un destinatario, envío inmediato o de prueba.",
        icon: "person",
      },
      {
        id: "mass",
        label: "Campaña masiva",
        description: "Listas de contactos o carga CSV.",
        icon: "groups",
      },
      {
        id: "scheduled",
        label: "Envío programado",
        description: "CSV o listas con fecha y hora de despacho.",
        icon: "schedule",
      },
      {
        id: "template",
        label: "Desde plantilla",
        description: "Mensajes preaprobados con variables.",
        icon: "description",
      },
    ],
    activeMode,
  );

  const varChips = ["{nombre}", "{codigo}", "{empresa}", "{fecha}"]
    .map(
      (v) =>
        `<button type="button" class="tv-var-chip tv-var-btn" data-var="${escapeHtml(v)}">${escapeHtml(v)}</button>`,
    )
    .join("");

  const sendConfirmModal = renderSendConfirmModal({
    flash: opts.flash,
    activeMode,
    campaignResult: opts.campaignResult,
    sendResult: opts.sendResult,
  });

  const opsChips =
    panel && lt
      ? `<div class="tv-stat-chips tv-stat-chips--ops">
      ${renderStatChip("Saldo SMS", fmtSms(avail), "success")}
      ${renderStatChip("Ruta", lt.routeName ?? "—", "primary")}
      ${renderStatChip("Webhook", panel.webhookConfigured ? "Activo" : "Off", panel.webhookConfigured ? "success" : "warn")}
      ${renderStatChip(isDailySendLimitEnforced() ? "Cuota hoy" : "Enviados hoy", dailyRemaining, "default")}
      ${renderStatChip("TPS", lt.effectiveTps != null ? String(lt.effectiveTps) : "—", "default")}
    </div>`
      : "";

  const panelUnavailableHtml = `<p class="alert alert-error">El envío SMS no está disponible. Contacte a soporte Telvoice.</p>`;

  const contactLists = opts.contactLists ?? [];
  const smsTemplates = opts.smsTemplates ?? [];
  const activeSmsTemplates = smsTemplates.filter((t) => t.status === "active");

  const sendForm = !panel
    ? panelUnavailableHtml
    : `
    <form method="post" action="/app/send-sms" id="tv-app-send-form" class="tv-send-layout">
      ${opts.idempotencyKey ? `<input type="hidden" name="idempotency_key" value="${escapeHtml(opts.idempotencyKey)}" />` : ""}
      <input type="hidden" name="send_mode" id="tv-send-mode" value="${escapeHtml(activeMode)}" />
      <textarea name="bulk_recipients" id="tv-bulk-recipients" hidden aria-hidden="true"></textarea>
      <input type="hidden" name="bulk_rows_json" id="tv-bulk-rows-json" value="" />
      <div class="tv-send-main">
        ${modes}
        <section class="tv-panel">
          <div class="tv-panel__body">
            <div class="tv-send-meta-row">
              <div class="form-group">
                <label for="campaign_name">Nombre de campaña (opcional)</label>
                <input id="campaign_name" class="tv-input-full" name="campaign_name" placeholder="Ej. Bienvenida clientes" ${disabledAttr} />
              </div>
              <div class="form-group">
                <label for="sender_id">Remitente / Sender ID</label>
                <input id="sender_id" class="tv-input-full" name="sender_id" value="${escapeHtml(suggestedSenderId)}" placeholder="${escapeHtml(suggestedSenderId)}" required maxlength="11" pattern="[A-Za-z0-9]+" title="Solo letras y números, máximo 11 caracteres" ${disabledAttr} />
                <p class="field-hint">Sugerencia según tu empresa acreditada: <strong>${escapeHtml(accreditedCompanyName || "—")}</strong></p>
              </div>
            </div>
            <div class="tv-send-meta-row tv-send-recipient-row">
              <div class="form-group tv-send-recipient-row__left">
                <div data-tv-single-fields${activeMode === "single" ? "" : " hidden"}>
                  <label for="tv-send-to">Número destinatario</label>
                  <input class="tv-input-full" name="to" id="tv-send-to" placeholder="56912345678" inputmode="numeric" autocomplete="tel" ${activeMode === "single" ? "required" : ""} ${disabledAttr} />
                  <p class="field-hint">Formato Chile: 569XXXXXXXX (sin signo +)</p>
                </div>
                <div data-tv-template-fields${activeMode === "template" ? "" : " hidden"}>
                  <label for="template_id">Plantilla SMS</label>
                  <select id="template_id" name="template_id" class="tv-input-full" ${disabledAttr}${activeMode === "template" && activeSmsTemplates.length ? " required" : ""}${activeSmsTemplates.length ? "" : " disabled"}>
                    ${renderTemplateOptions(smsTemplates, !activeSmsTemplates.length)}
                  </select>
                  <p class="field-hint" id="tv-template-meta-hint">${activeSmsTemplates.length ? "Selecciona una plantilla; el mensaje se cargará abajo." : "No tienes plantillas activas. <a href=\"/app/templates\">Crear plantilla</a>"}</p>
                </div>
                <div data-tv-mass-csv-field${activeMode === "mass" || activeMode === "scheduled" ? "" : " hidden"}>
                  <label for="csv_file">Cargar CSV</label>
                  <input id="csv_file" type="file" accept=".csv,text/csv" class="tv-input-full" ${disabledAttr} />
                  <p class="field-hint">Columnas <code>numero</code> y <code>mensaje</code> (o solo números + mensaje común abajo). Separador coma o punto y coma.</p>
                </div>
              </div>
              <div class="form-group" data-tv-contacts-group>
                <label for="tv-send-contacts" id="tv-send-contacts-label">${activeMode === "template" ? "Destinatarios" : "Contactos"}</label>
                <select id="tv-send-contacts" name="contact_list" class="tv-input-full tv-send-contacts-pick"${contactLists.length ? "" : " disabled"}>
                  ${renderAgendaPickOptions(contactLists)}
                </select>
                <p class="field-hint" id="tv-send-contacts-hint">${activeMode === "template" ? "Elige una agenda o lista de contactos." : contactLists.length ? "Elige una agenda para cargar destinatarios" : "Crea agendas en Contactos para usarlas aquí"}</p>
              </div>
            </div>
            <div data-tv-recipients-preview${activeMode === "mass" || activeMode === "scheduled" || activeMode === "template" ? "" : " hidden"}>
              <p class="field-hint tv-mass-summary" id="tv-mass-summary">${activeMode === "template" ? "Selecciona una plantilla y una agenda para previsualizar destinatarios." : "Selecciona una lista o sube un CSV para previsualizar la campaña."}</p>
              <p class="field-hint tv-template-var-warn" id="tv-template-var-warn" hidden></p>
              <div class="tv-mass-table-wrap" id="tv-mass-table-wrap" hidden>
                <div class="table-wrap tv-panel" style="padding:0;margin-top:0.5rem">
                  <table class="tv-table tv-table--dense" id="tv-mass-preview-table">
                    <thead><tr>
                      <th>Número</th><th>Mensaje</th><th>Seg.</th><th>SMS</th>
                    </tr></thead>
                    <tbody id="tv-mass-preview-body"></tbody>
                  </table>
                </div>
                <p class="field-hint" id="tv-mass-preview-more" hidden></p>
              </div>
            </div>
            <div data-tv-schedule-fields${activeMode === "scheduled" ? "" : " hidden"}>
              <div class="tv-form-grid">
                <div class="form-group">
                  <label for="schedule_date">Fecha programada</label>
                  <input id="schedule_date" name="schedule_date" type="date" class="tv-input-full" ${disabledAttr} />
                </div>
                <div class="form-group">
                  <label for="schedule_time">Hora</label>
                  <input id="schedule_time" name="schedule_time" type="time" class="tv-input-full" ${disabledAttr} />
                </div>
              </div>
              <p class="field-hint">Hora de Chile (America/Santiago). Puedes programar un CSV masivo o una lista; el despacho será a esa hora para todos los destinatarios.</p>
            </div>
            <div class="form-group" data-tv-message-group>
              <label for="tv-sms-message">Mensaje SMS <span class="field-hint" id="tv-mass-msg-hint" style="font-weight:400"></span></label>
              <textarea id="tv-sms-message" class="tv-input-full" name="message" rows="5"${activeMode === "mass" || activeMode === "scheduled" ? "" : " required"} placeholder="Escribe tu mensaje…" ${disabledAttr}></textarea>
              <div class="tv-send-validation tv-send-validation--inline" aria-live="polite">
                ${renderSendMessageValidationChips()}
              </div>
              <div class="tv-var-row">
                <button type="button" class="tv-var-chip tv-template-btn" data-template="qa">QA pre-campaña</button>
                <button type="button" class="tv-var-chip tv-template-btn" data-template="dlr">Test DLR</button>
                ${varChips}
              </div>
            </div>
            <p class="field-hint tv-live-segment-warn" id="tv-live-segment-warn" hidden></p>
            <p class="field-hint tv-live-number-warn" id="tv-live-number-warn" hidden>El número destino no está autorizado.</p>
            <p class="field-hint tv-mass-warn" id="tv-mass-warn" hidden>Agrega al menos un destinatario válido (lista o CSV).</p>
            ${submitBlockAlert}
            <button type="submit" class="btn btn-primary tv-send-submit" id="tv-send-submit" ${submitDisabled}>Enviar SMS</button>
          </div>
        </section>
      </div>
      <aside class="tv-send-aside">
        <div id="tv-send-preview-phone" class="tv-send-preview-phone">
          ${renderHeroPhonePreview({
            senderLabel: suggestedSenderId,
            senderSub: companyDisplayName,
            message: "Hola, tu mensaje aparecerá aquí.",
            bubbleId: "tv-send-preview-bubble",
          })}
        </div>
        <div class="tv-send-validation tv-send-validation--aside">
          ${renderSendMessageValidationChips()}
        </div>
      </aside>
    </form>`;

  const body = `
    <div class="tv-app-send-page">
    ${renderPageHeader({
      title: "Enviar SMS",
      subtitle: "Individual, campaña masiva, programación o plantillas preaprobadas.",
      headClass: "tv-page-head--title-cta tv-page-head--send",
      actions: panel ? headerActions : undefined,
    })}
    ${errorBlock}
    ${opsChips}
    ${sendForm}
    </div>
    ${sendConfirmModal}
    <script>
    (function(){
      var confirmModal = document.getElementById('tv-send-confirm-modal');
      if(confirmModal){
        function closeConfirmModal(){
          confirmModal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }
        confirmModal.querySelectorAll('[data-tv-send-confirm-close]').forEach(function(btn){
          btn.addEventListener('click', closeConfirmModal);
        });
        document.addEventListener('keydown', function(e){
          if(e.key === 'Escape' && confirmModal.getAttribute('aria-hidden') === 'false') closeConfirmModal();
        });
        document.body.style.overflow = 'hidden';
        var outcomeParams = new URLSearchParams(window.location.search);
        ['ok','message_id','campaign_id','mode'].forEach(function(k){ outcomeParams.delete(k); });
        var cleanQs = outcomeParams.toString();
        history.replaceState({}, '', '/app/send-sms' + (cleanQs ? '?' + cleanQs : ''));
      }
    })();
    </script>
    <script>
    (function(){
      var ta = document.getElementById('tv-sms-message');
      var senderInput = document.getElementById('sender_id');
      var toInput = document.getElementById('tv-send-to');
      var sendContacts = document.getElementById('tv-send-contacts');
      var sendModeInput = document.getElementById('tv-send-mode');
      var bulkHidden = document.getElementById('tv-bulk-recipients');
      var csvInput = document.getElementById('csv_file');
      var templateSelect = document.getElementById('template_id');
      var scheduleDate = document.getElementById('schedule_date');
      var scheduleTime = document.getElementById('schedule_time');
      var avail = ${avail};
      var maxLiveSegments = ${lt?.maxSegments ?? 3};
      var canSubmit = ${canSubmit ? "true" : "false"};
      var numbersRestricted = ${numbersRestricted ? "true" : "false"};
      var allowedLiveNumbers = ${JSON.stringify(allowedLiveNumbers)};
      var defaultVerifyMsg = ${JSON.stringify(defaultVerifyMsg)};
      var initialMode = ${JSON.stringify(activeMode)};
      var suggestedSenderId = ${JSON.stringify(suggestedSenderId)};
      var templateQa = defaultVerifyMsg;
      var templateDlr = '[Telvoice DLR] Test entrega ' + new Date().toISOString().slice(0,16).replace('T',' ') + '.';
      var bulkRowsJson = document.getElementById('tv-bulk-rows-json');
      var massSummary = document.getElementById('tv-mass-summary');
      var massTableWrap = document.getElementById('tv-mass-table-wrap');
      var massPreviewBody = document.getElementById('tv-mass-preview-body');
      var massPreviewMore = document.getElementById('tv-mass-preview-more');
      var massMsgHint = document.getElementById('tv-mass-msg-hint');
      var templateMetaHint = document.getElementById('tv-template-meta-hint');
      var templateVarWarn = document.getElementById('tv-template-var-warn');
      var contactsLabel = document.getElementById('tv-send-contacts-label');
      var contactsHint = document.getElementById('tv-send-contacts-hint');
      var recipientsPreview = document.querySelector('[data-tv-recipients-preview]');
      var csvParsedRows = [];
      var massPreviewRows = [];
      function templateStatusLabel(st){
        if(st === 'active') return 'Activa';
        if(st === 'draft') return 'Borrador';
        if(st === 'archived') return 'Archivada';
        return st || '';
      }
      function messageHasUnresolvedVars(text){
        return /\\{\\{[^}]+\\}\\}|\\{[a-zA-Z_][a-zA-Z0-9_]*\\}/.test(text || '');
      }
      function clearCsvSelection(){
        csvParsedRows = [];
        if(csvInput) csvInput.value = '';
      }
      function gsmBasic(ch){ return /^[@£$¥èéùìòÇ\\nØø\\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\\-./0-9:;<=>?¡A-Za-zäöñüà^{}\\\\\\[\\]~|€]*$/.test(ch); }
      function calc(text){
        var chars = [...text].length;
        if(!chars) return {chars:0,enc:'GSM-7',seg:0,cost:0};
        if(gsmBasic(text)){
          if(chars<=160) return {chars:chars,enc:'GSM-7',seg:1,cost:1};
          return {chars:chars,enc:'GSM-7',seg:Math.ceil(chars/153),cost:Math.ceil(chars/153)};
        }
        if(chars<=70) return {chars:chars,enc:'UCS-2',seg:1,cost:1};
        return {chars:chars,enc:'UCS-2',seg:Math.ceil(chars/67),cost:Math.ceil(chars/67)};
      }
      function normalizePhoneDigits(v){
        var d = (v || '').replace(/\\D/g,'');
        if(d.length===11 && d.charAt(0)==='9') return '56'+d;
        if(d.length===9 && d.charAt(0)==='9') return '56'+d;
        return d;
      }
      function isValidClMobile(digits){
        if(!digits) return false;
        var d = digits.replace(/^\\+/,'');
        if(d.length===11 && d.indexOf('56')===0) return /^56[29]\\d{8}$/.test(d);
        if(d.length===9 && d.charAt(0)==='9') return true;
        return false;
      }
      function splitRecipients(raw){
        return (raw || '').split(/[\\n,;]+/).map(function(s){ return s.trim(); }).filter(Boolean);
      }
      function escHtml(s){
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function parseCsvLine(line){
        var out = [], cur = '', q = false;
        for(var i=0;i<line.length;i++){
          var ch = line.charAt(i);
          if(ch === '"'){ q = !q; continue; }
          if((ch === ',' || ch === ';') && !q){ out.push(cur.trim()); cur = ''; continue; }
          cur += ch;
        }
        out.push(cur.trim());
        return out;
      }
      function isPhoneHeaderCell(c){
        return /^(numero|numeros|telefono|phone|destino|celular|movil|to)$/i.test((c||'').toLowerCase().replace(/[áéíóú]/g,function(m){ return {'á':'a','é':'e','í':'i','ó':'o','ú':'u'}[m]||m; }));
      }
      function isMessageHeaderCell(c){
        return /^(mensaje|mensajes|message|texto|sms)$/i.test((c||'').toLowerCase().replace(/[áéíóú]/g,function(m){ return {'á':'a','é':'e','í':'i','ó':'o','ú':'u'}[m]||m; }));
      }
      function parseCsvText(text){
        var lines = (text||'').split(/\\r?\\n/).map(function(l){ return l.trim(); }).filter(Boolean);
        if(!lines.length) return [];
        var start = 0;
        var first = parseCsvLine(lines[0]);
        if(first.length >= 2 && (isPhoneHeaderCell(first[0]) || isMessageHeaderCell(first[1]))) start = 1;
        var rows = [];
        for(var i=start;i<lines.length;i++){
          var cols = parseCsvLine(lines[i]);
          if(!cols.length) continue;
          var phone = (cols[0]||'').trim();
          if(!phone) continue;
          var message = cols.length >= 2 ? cols.slice(1).join(',').trim() : '';
          rows.push({ phone: phone, message: message });
        }
        return rows;
      }
      function rebuildMassPreviewRows(){
        var mode = getSendMode();
        var fallback = ta ? (ta.value || '').trim() : '';
        var combined = [];
        if(sendContacts && sendContacts.value){
          var opt = sendContacts.options[sendContacts.selectedIndex];
          var sample = opt ? (opt.getAttribute('data-phones') || opt.getAttribute('data-sample') || '') : '';
          var fromList = splitRecipients(sample);
          var tplSingle = mode === 'template' && fromList.length === 1;
          if(!tplSingle){
            fromList.forEach(function(p){
              combined.push({ phone: p, message: fallback });
            });
          }
        }
        if(isBulkMode(mode)){
          csvParsedRows.forEach(function(r){ combined.push({ phone: r.phone, message: r.message || fallback }); });
        }
        var seen = {};
        massPreviewRows = [];
        combined.forEach(function(r){
          var key = normalizePhoneDigits(r.phone);
          if(!key || seen[key]) return;
          seen[key] = true;
          var msg = (r.message || fallback).trim();
          var valid = isValidClMobile(key);
          var seg = msg ? calc(msg) : { seg: 0, cost: 0 };
          var hasMsg = !!msg;
          var rowOk = valid && hasMsg;
          massPreviewRows.push({
            phone: r.phone,
            message: msg || '—',
            valid: valid,
            ok: rowOk,
            seg: seg.seg,
            cost: seg.cost
          });
        });
      }
      function countMassStats(){
        rebuildMassPreviewRows();
        var valid = 0, invalid = 0, totalSms = 0, withCsvMsg = false;
        massPreviewRows.forEach(function(r){
          if(r.ok){ valid++; totalSms += r.cost; }
          else invalid++;
          if(csvParsedRows.length && r.message && r.message !== '—') withCsvMsg = true;
        });
        if(csvParsedRows.length){
          withCsvMsg = csvParsedRows.some(function(r){ return !!(r.message && r.message.trim()); });
        }
        return {
          total: massPreviewRows.length,
          valid: valid,
          invalid: invalid,
          totalSms: totalSms,
          hasPerRowMessages: withCsvMsg,
          rows: massPreviewRows
        };
      }
      function syncBulkPayload(){
        rebuildMassPreviewRows();
        var stats = countMassStats();
        if(bulkHidden) bulkHidden.value = massPreviewRows.map(function(r){ return r.phone; }).join('\\n');
        if(bulkRowsJson){
          var payload = massPreviewRows.filter(function(r){ return r.ok; }).map(function(r){
            return { phone: r.phone, message: r.message === '—' ? '' : r.message };
          });
          bulkRowsJson.value = JSON.stringify(payload);
        }
        return stats;
      }
      function syncMassMessageFieldLock(stats){
        if(!ta) return;
        var mode = getSendMode();
        var locked = isBulkMode(mode) && stats && stats.hasPerRowMessages && stats.valid > 0;
        var grp = document.querySelector('[data-tv-message-group]');
        if(grp) grp.classList.toggle('tv-message-locked', locked);
        if(locked){
          ta.readOnly = true;
          ta.setAttribute('readonly','readonly');
          ta.classList.add('tv-input-readonly-locked');
          ta.value = '';
          ta.placeholder = 'Texto definido en la planilla (columna mensaje). Este cuadro está bloqueado para no duplicar un mensaje manual.';
        } else {
          ta.readOnly = false;
          ta.removeAttribute('readonly');
          ta.classList.remove('tv-input-readonly-locked');
          if((ta.placeholder || '').indexOf('planilla') >= 0) ta.placeholder = 'Escribe tu mensaje…';
        }
      }
      function updateMessageRequired(){
        if(!ta) return;
        var mode = getSendMode();
        var stats = countMassStats();
        if(isBulkMode(mode)){
          if(stats.hasPerRowMessages && stats.valid > 0){
            ta.removeAttribute('required');
            if(massMsgHint) massMsgHint.textContent = '(mensajes por fila en la planilla — cuadro bloqueado)';
          } else {
            ta.setAttribute('required','');
            if(massMsgHint) massMsgHint.textContent = mode === 'scheduled'
              ? '(mensaje común si el CSV solo trae números)'
              : '(mensaje común para todos los números)';
          }
        } else {
          ta.setAttribute('required','');
          if(massMsgHint) massMsgHint.textContent = '';
        }
        syncMassMessageFieldLock(stats);
      }
      function renderMassPreview(){
        var mode = getSendMode();
        var stats = syncBulkPayload();
        updateMessageRequired();
        if(massSummary){
          var bulk = isBulkMode(mode);
          var tpl = mode === 'template';
          if(!stats.total){
            if(tpl){
              massSummary.textContent = 'Selecciona una plantilla y una agenda para previsualizar destinatarios.';
            } else if(bulk && mode === 'scheduled'){
              massSummary.textContent = 'Sube un CSV o elige una lista para programar el envío masivo.';
            } else {
              massSummary.textContent = 'Selecciona una lista o sube un CSV para previsualizar la campaña.';
            }
          } else if(tpl){
            massSummary.textContent = stats.total + ' destinatario(s) seleccionado(s) · ' + stats.valid + ' válidos · ' + stats.totalSms + ' SMS estimados';
          } else {
            var prefix = mode === 'scheduled' ? 'A programar: ' : '';
            massSummary.textContent = prefix + stats.valid + ' listos · ' + stats.invalid + ' con error · ' + stats.totalSms + ' SMS estimados · ' + stats.total + ' filas';
          }
        }
        if(templateVarWarn){
          var msg = ta ? (ta.value || '').trim() : '';
          if(mode === 'template' && stats.total > 0 && messageHasUnresolvedVars(msg)){
            templateVarWarn.hidden = false;
            templateVarWarn.textContent = 'La plantilla incluye variables ({nombre}, {codigo}, etc.). Se enviará el mismo texto a todos los destinatarios hasta que definas valores por contacto.';
          } else {
            templateVarWarn.hidden = true;
          }
        }
        if(massTableWrap && massPreviewBody){
          var show = stats.total > 0;
          massTableWrap.hidden = !show;
          if(show){
            var maxShow = 8;
            var html = stats.rows.slice(0, maxShow).map(function(r){
              var cls = r.ok ? '' : ' style="opacity:0.65"';
              var msgShort = r.message.length > 48 ? r.message.slice(0,48) + '…' : r.message;
              return '<tr'+cls+'><td><code>'+escHtml(r.phone)+'</code></td><td>'+escHtml(msgShort)+'</td><td>'+r.seg+'</td><td>'+r.cost+'</td></tr>';
            }).join('');
            massPreviewBody.innerHTML = html || '<tr><td colspan="4">Sin filas</td></tr>';
            if(massPreviewMore){
              if(stats.rows.length > maxShow){
                massPreviewMore.hidden = false;
                massPreviewMore.textContent = 'Y ' + (stats.rows.length - maxShow) + ' filas más…';
              } else {
                massPreviewMore.hidden = true;
              }
            }
            var firstOk = stats.rows.filter(function(r){ return r.ok; })[0];
            var bubble = document.querySelector('.tv-phone__bubble');
            if(bubble && firstOk) bubble.textContent = firstOk.message;
          }
        }
        return stats;
      }
      function getSendMode(){
        return sendModeInput ? sendModeInput.value : 'single';
      }
      function isBulkMode(mode){
        return mode === 'mass' || mode === 'scheduled';
      }
      function showsRecipientsPreview(mode){
        return isBulkMode(mode) || mode === 'template';
      }
      function templateUsesBulkRecipients(mode){
        if(mode !== 'template') return false;
        return countMassStats().total > 1;
      }
      function isRecipientAllowed(){
        var mode = getSendMode();
        if(isBulkMode(mode) || templateUsesBulkRecipients(mode)){
          var ms = countMassStats();
          return ms.valid > 0 && (ms.hasPerRowMessages || (ta && (ta.value || '').trim()));
        }
        if(mode === 'template'){
          if(!toInput) return !!(ta && (ta.value || '').trim());
          return !!(toInput.value || '').trim() && !!(ta && (ta.value || '').trim());
        }
        if(!numbersRestricted){
          if(!toInput) return true;
          return !!(toInput.value || '').trim();
        }
        if(!toInput) return true;
        var v = (toInput.value || '').trim();
        if(!v) return false;
        if(!allowedLiveNumbers.length) return true;
        var digits = normalizePhoneDigits(v);
        return allowedLiveNumbers.some(function(n){
          var a = normalizePhoneDigits(n);
          return a === digits || a === digits.replace(/^\\+/,'');
        });
      }
      function updateSubmitLabel(mode){
        var btn = document.getElementById('tv-send-submit');
        var headerBtn = document.getElementById('tv-header-send-btn');
        var labels = { single: 'Enviar SMS', mass: 'Enviar campaña', scheduled: 'Programar envío', template: 'Enviar SMS' };
        var label = labels[mode] || 'Enviar SMS';
        if(btn) btn.textContent = label;
        if(headerBtn){
          var icon = headerBtn.querySelector('.material-symbols-outlined');
          headerBtn.innerHTML = (icon ? icon.outerHTML : '<span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">send</span>') + ' ' + label;
        }
      }
      function applySendMode(mode){
        if(sendModeInput) sendModeInput.value = mode;
        var single = document.querySelector('[data-tv-single-fields]');
        var massCsv = document.querySelector('[data-tv-mass-csv-field]');
        var tpl = document.querySelector('[data-tv-template-fields]');
        var sched = document.querySelector('[data-tv-schedule-fields]');
        if(single) single.hidden = mode !== 'single';
        if(massCsv) massCsv.hidden = !isBulkMode(mode);
        if(recipientsPreview) recipientsPreview.hidden = !showsRecipientsPreview(mode);
        if(tpl) tpl.hidden = mode !== 'template';
        if(sched) sched.hidden = mode !== 'scheduled';
        if(contactsLabel){
          contactsLabel.textContent = mode === 'template' ? 'Destinatarios' : 'Contactos';
        }
        if(contactsHint){
          contactsHint.textContent = mode === 'template'
            ? 'Elige una agenda o lista de contactos.'
            : (sendContacts && !sendContacts.disabled
              ? 'Elige una agenda para cargar destinatarios'
              : 'Crea agendas en Contactos para usarlas aquí');
        }
        if(mode === 'template') clearCsvSelection();
        if(toInput){
          if(mode === 'single') toInput.setAttribute('required', 'required');
          else toInput.removeAttribute('required');
        }
        if(templateSelect){
          var hasTemplates = templateSelect.options.length > 1;
          if(mode === 'template' && hasTemplates) templateSelect.setAttribute('required', 'required');
          else templateSelect.removeAttribute('required');
          templateSelect.disabled = mode === 'template' && !hasTemplates;
        }
        updateSubmitLabel(mode);
        updateMessageRequired();
        if(showsRecipientsPreview(mode)) renderMassPreview();
        else if(templateVarWarn) templateVarWarn.hidden = true;
        refresh();
      }
      function setChip(label, value){
        document.querySelectorAll('.tv-validation-chips .tv-stat-chip').forEach(function(chip){
          var l = chip.querySelector('.tv-stat-chip__label');
          var val = chip.querySelector('.tv-stat-chip__value');
          if(l && val && l.textContent === label) val.textContent = value;
        });
      }
      function refresh(){
        if(!ta) return;
        var mode = getSendMode();
        var t = ta.value || '';
        var c = calc(t);
        var massStats = null;
        if(isBulkMode(mode) || templateUsesBulkRecipients(mode)){
          massStats = renderMassPreview();
          setChip('Caracteres', String(massStats.total) + ' filas');
          setChip('Segmentos', String(massStats.totalSms) + ' SMS');
          setChip('Costo est.', String(massStats.valid) + ' válidos');
          setChip('Codificación', String(massStats.invalid) + ' err.');
        } else {
          var costEst = c.cost + ' SMS';
          setChip('Caracteres', String(c.chars));
          setChip('Segmentos', String(c.seg));
          setChip('Costo est.', costEst);
          setChip('Codificación', c.enc);
        }
        var bubble = document.getElementById('tv-send-preview-bubble');
        var phoneTitle = document.querySelector('#tv-send-preview-phone .tv-hero-phone__app-title');
        var phoneAvatar = document.querySelector('#tv-send-preview-phone .tv-hero-phone__avatar');
        if(!isBulkMode(mode) && !templateUsesBulkRecipients(mode) && bubble) bubble.textContent = t || 'Hola, tu mensaje aparecerá aquí.';
        if(senderInput) {
          var sid = (senderInput.value || '').trim() || suggestedSenderId;
          if(phoneTitle) phoneTitle.textContent = sid;
          if(phoneAvatar) phoneAvatar.textContent = (sid.charAt(0) || 'E').toUpperCase();
        }
        var overSeg = false;
        if(!isBulkMode(mode) && mode !== 'template') {
          overSeg = c.seg > maxLiveSegments;
        }
        var numOk = isRecipientAllowed();
        var schedOk = mode !== 'scheduled' || (scheduleDate && scheduleDate.value && scheduleTime && scheduleTime.value);
        var needsBulkRecipients = isBulkMode(mode) || templateUsesBulkRecipients(mode);
        var bulkOk = !needsBulkRecipients || (massStats && massStats.valid > 0 && (massStats.hasPerRowMessages || (ta && (ta.value || '').trim())));
        var balanceOk = true;
        if(avail > 0){
          if((isBulkMode(mode) || templateUsesBulkRecipients(mode)) && massStats) balanceOk = massStats.totalSms <= avail;
          else if(mode === 'single' || mode === 'template') balanceOk = c.cost <= avail;
        }
        var segWarn = document.getElementById('tv-live-segment-warn');
        var numWarn = document.getElementById('tv-live-number-warn');
        var massWarn = document.getElementById('tv-mass-warn');
        var submitBtn = document.getElementById('tv-send-submit');
        var headerBtn = document.getElementById('tv-header-send-btn');
        if(segWarn){
          if((isBulkMode(mode) || (mode === 'template' && templateUsesBulkRecipients(mode))) && massStats && massStats.totalSms > 0){
            segWarn.hidden = false;
            segWarn.textContent = 'Se descontarán ' + massStats.totalSms + ' créditos SMS según segmentos del mensaje (no hay tope de segmentos en campañas).';
            segWarn.style.color = '';
          } else if(overSeg){
            segWarn.hidden = false;
            segWarn.textContent = 'El mensaje supera el máximo de ' + maxLiveSegments + ' segmentos permitido en envío individual.';
            segWarn.style.color = 'var(--err,#b91c1c)';
          } else {
            segWarn.hidden = true;
          }
        }
        if(numWarn) numWarn.hidden = isBulkMode(mode) || templateUsesBulkRecipients(mode) || numOk || !numbersRestricted;
        if(massWarn){
          if(mode === 'template' && !templateUsesBulkRecipients(mode)){
            massWarn.hidden = numOk || !numbersRestricted;
            if(!massWarn.hidden) massWarn.textContent = 'Indica el número destinatario o elige una agenda con contactos.';
          } else {
            massWarn.hidden = bulkOk || !needsBulkRecipients;
            if(!massWarn.hidden) massWarn.textContent = 'Agrega al menos un destinatario válido (lista o CSV).';
          }
        }
        var disabled = overSeg || !numOk || !schedOk || !bulkOk || !balanceOk;
        if(submitBtn) submitBtn.disabled = !canSubmit || disabled;
        if(headerBtn) headerBtn.disabled = !canSubmit || disabled;
      }
      document.querySelectorAll('.tv-var-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          if(!ta || ta.readOnly) return;
          ta.value = (ta.value || '') + (btn.getAttribute('data-var') || '');
          ta.focus();
          refresh();
        });
      });
      document.querySelectorAll('.tv-template-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          if(!ta || ta.readOnly) return;
          ta.value = btn.getAttribute('data-template') === 'dlr' ? templateDlr : templateQa;
          ta.focus();
          refresh();
        });
      });
      var modeRoot = document.querySelector('[data-tv-send-mode-root]');
      if(modeRoot){
        modeRoot.querySelectorAll('[data-tv-send-mode]').forEach(function(btn){
          btn.addEventListener('click', function(){
            var id = btn.getAttribute('data-tv-send-mode');
            modeRoot.querySelectorAll('[data-tv-send-mode]').forEach(function(b){
              b.classList.toggle('tv-mode-card--active', b === btn);
            });
            applySendMode(id || 'single');
          });
        });
      }
      if(sendContacts){
        sendContacts.addEventListener('change', function(){
          var listId = sendContacts.value;
          var mode = getSendMode();
          if(!listId){
            if(showsRecipientsPreview(mode)) renderMassPreview();
            refresh();
            return;
          }
          var opt = sendContacts.options[sendContacts.selectedIndex];
          var phonesRaw = opt ? (opt.getAttribute('data-phones') || opt.getAttribute('data-sample') || '') : '';
          var phones = phonesRaw ? phonesRaw.split('\\n').map(function(p){ return p.trim(); }).filter(Boolean) : [];
          if(!phones.length){
            alert('Esta agenda no tiene contactos.');
            sendContacts.value = '';
            return;
          }
          if(mode === 'single'){
            if(phones.length === 1 && toInput){
              toInput.value = phones[0];
            } else {
              applySendMode('mass');
            }
            refresh();
            return;
          }
          if(mode === 'template'){
            if(phones.length === 1 && toInput){
              toInput.value = phones[0];
              if(bulkHidden) bulkHidden.value = '';
              if(bulkRowsJson) bulkRowsJson.value = '';
              massPreviewRows = [];
            }
            renderMassPreview();
            refresh();
            return;
          }
          if(isBulkMode(mode)){
            renderMassPreview();
            refresh();
          }
        });
      }
      if(csvInput){
        csvInput.addEventListener('change', function(){
          var file = csvInput.files && csvInput.files[0];
          if(!file){ csvParsedRows = []; renderMassPreview(); refresh(); return; }
          var reader = new FileReader();
          reader.onload = function(ev){
            csvParsedRows = parseCsvText(String(ev.target && ev.target.result || ''));
            renderMassPreview();
            refresh();
          };
          reader.readAsText(file);
        });
      }
      var sendForm = document.getElementById('tv-app-send-form');
      var sendSubmit = document.getElementById('tv-send-submit');
      var headerSendBtn = document.getElementById('tv-header-send-btn');
      if(sendForm){
        sendForm.addEventListener('submit', function(ev){
          var submitMode = getSendMode();
          if(isBulkMode(submitMode) || templateUsesBulkRecipients(submitMode)) renderMassPreview();
          if(sendForm.getAttribute('data-tv-submitting') === '1'){
            ev.preventDefault();
            return;
          }
          sendForm.setAttribute('data-tv-submitting', '1');
          [sendSubmit, headerSendBtn].forEach(function(btn){
            if(!btn) return;
            btn.setAttribute('disabled', 'disabled');
            if(btn === sendSubmit) btn.textContent = 'Enviando…';
          });
        });
      }
      if(templateSelect){
        templateSelect.addEventListener('change', function(){
          if(ta && ta.readOnly) return;
          var opt = templateSelect.options[templateSelect.selectedIndex];
          var msg = opt ? opt.getAttribute('data-message') : '';
          var st = opt ? opt.getAttribute('data-status') : '';
          if(templateMetaHint){
            if(opt && opt.value && st){
              templateMetaHint.innerHTML = 'Estado: <strong>' + escHtml(templateStatusLabel(st)) + '</strong>. Personaliza variables en el mensaje si lo necesitas.';
            } else if(templateSelect.options.length > 1){
              templateMetaHint.textContent = 'Selecciona una plantilla; el mensaje se cargará abajo.';
            }
          }
          if(msg && ta){ ta.value = msg; ta.focus(); refresh(); }
          if(getSendMode() === 'template') renderMassPreview();
        });
      }
      if(scheduleDate) scheduleDate.addEventListener('change', refresh);
      if(scheduleTime) scheduleTime.addEventListener('change', refresh);
      if(senderInput) senderInput.addEventListener('input', refresh);
      if(toInput) toInput.addEventListener('input', refresh);
      if(ta){ ta.addEventListener('input', refresh); }
      applySendMode(initialMode || 'single');
    })();
    </script>`;

  return wrapAppPage(
    { ...ctx, flash: undefined, error: undefined },
    "send-sms",
    "Enviar SMS",
    body,
  );
}

export type AppInboxPageFilters = {
  startDate?: string;
  endDate?: string;
  status?: string;
  senderId?: string;
  recipient?: string;
  reference?: string;
  limit?: ClientTableLimit;
};

export function renderAppInboxPage(
  ctx: AppPageContext,
  messages: PanelSmsMessageRow[],
  filters?: AppInboxPageFilters,
): string {
  const f = filters ?? {};
  const senderFilterPlaceholder = `Ej. ${suggestSenderIdFromCompany(ctx.company)}`;
  const status = (f.status ?? "").trim();
  const statusOpts = [
    ["", "Todos"],
    ["queued", "En cola"],
    ["pending", "Pendiente"],
    ["sent", "Enviado"],
    ["delivered", "Entregado"],
    ["failed", "Fallido"],
    ["rejected", "Rechazado"],
    ["expired", "Expirado"],
  ]
    .map(([v, label]) => {
      const on = v === status;
      return `<option value="${escapeHtml(v)}"${on ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  const filtersPanel = `
    <section class="tv-panel tv-dlr-report__filters-panel">
      <header class="tv-section-head tv-dlr-report__filters-head">
        <h2 class="tv-section-head__title">Filtros de búsqueda</h2>
        <p class="tv-section-head__sub">Filtra mensajes por período, estado, remitente, destinatario o referencia aSMSC</p>
      </header>
      <div class="tv-panel__body tv-dlr-report__filters-body">
        <form method="get" action="/app/inbox" class="tv-dlr-report__filters-form">
          <div class="tv-dlr-report__filters-grid tv-inbox__filters-grid">
            ${renderFilterField("Desde", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(f.startDate ?? "")}" />`)}
            ${renderFilterField("Hasta", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(f.endDate ?? "")}" />`)}
            ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
            ${renderFilterField("Remitente", `<input type="text" name="sender_id" class="tv-filter-input" placeholder="${escapeHtml(senderFilterPlaceholder)}" value="${escapeHtml(f.senderId ?? "")}" />`)}
            ${renderFilterField("Destinatario", `<input type="text" name="recipient" class="tv-filter-input" placeholder="Ej. +569…" value="${escapeHtml(f.recipient ?? "")}" />`)}
            ${renderFilterField("Referencia", `<input type="text" name="reference" class="tv-filter-input" placeholder="Ej. 22486311" value="${escapeHtml(f.reference ?? "")}" />`)}
            <div class="tv-dlr-report__filter-actions">
              <button type="submit" class="btn btn-primary btn-sm">Buscar</button>
              <a class="btn btn-ghost btn-sm" href="/app/inbox">Limpiar</a>
            </div>
          </div>
        </form>
      </div>
    </section>`;

  const body = `
    ${renderPageHeader({
      title: "Bandeja",
      subtitle: "Mensajes SMS enviados por tu empresa.",
    })}
    <div class="tv-client-dashboard tv-dlr-report tv-inbox-report">
      ${filtersPanel}
      <div class="tv-dash-block tv-dlr-report__table-block">
        <div class="tv-dash-block__head">
          <h2 class="tv-dash-block__title">Mensajes</h2>
        </div>
        ${renderClientDataTablePanel(
          `<table class="tv-table tv-table--dash tv-table--col-resize" data-table-id="app-inbox">
                <colgroup>
                  <col><col><col><col><col><col><col><col><col>
                </colgroup>
                <thead><tr>
                  <th>Fecha</th><th>Destinatario</th><th>Remitente</th><th>Mensaje</th>
                  <th>Seg.</th><th>Estado</th><th>Modo</th><th>Referencia</th><th>Error</th>
                </tr></thead>
                <tbody>${renderInboxTableRows(messages)}</tbody>
              </table>`,
          renderClientTableFooter({
            tableKey: "app_inbox",
            count: messages.length,
            limit: f.limit ?? 20,
            basePath: "/app/inbox",
            countHint: "con filtros aplicados",
            hiddenFields: {
              start_date: f.startDate,
              end_date: f.endDate,
              status: f.status,
              sender_id: f.senderId,
              recipient: f.recipient,
              reference: f.reference,
            },
          }),
        )}
      </div>
    </div>`;
  return wrapAppPage(ctx, "inbox", "Bandeja", body);
}

export function renderAppCampaignsPage(
  ctx: AppPageContext,
  campaigns: SmsCampaignRow[],
  filters?: {
    q?: string;
    status?: string;
    senderId?: string;
    startDate?: string;
    endDate?: string;
    limit?: ClientTableLimit;
  },
): string {
  const f = filters ?? {};
  const senderFilterPlaceholder = `Ej. ${suggestSenderIdFromCompany(ctx.company)}`;
  const status = (f.status ?? "").trim();
  const statusOpts = [
    ["", "Todos"],
    ["draft", "Borrador"],
    ["processing", "Procesando"],
    ["sent", "Enviada"],
    ["completed", "Completada"],
    ["failed", "Fallida"],
    ["cancelled", "Cancelada"],
  ]
    .map(([v, label]) => {
      const on = v === status;
      return `<option value="${escapeHtml(v)}"${on ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  const total = campaigns.length;
  const count = (s: string) => campaigns.filter((c) => c.status === s).length;
  const drafts = count("draft");
  const processing = count("processing");
  const ok = count("completed") + count("sent");
  const failed = count("failed") + count("cancelled");

  const kpis = `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
      ${renderKpiCard({ label: "Campañas", value: fmtSms(total), hint: "Con filtros aplicados", icon: "campaign", variant: "primary" })}
      ${renderKpiCard({ label: "Completadas", value: fmtSms(ok), hint: "Enviadas / finalizadas", icon: "check_circle", variant: "success" })}
      ${renderKpiCard({ label: "En curso", value: fmtSms(processing), hint: "Procesando", icon: "schedule", variant: "warn" })}
      ${renderKpiCard({ label: "Borradores", value: fmtSms(drafts), hint: "Aún no enviadas", icon: "edit", variant: "default" })}
      ${renderKpiCard({ label: "Fallidas", value: fmtSms(failed), hint: "Fallidas / canceladas", icon: "error", variant: "danger" })}
    </div>`;

  const filtersPanel = `
    <section class="tv-panel tv-dlr-report__filters-panel">
      <header class="tv-section-head tv-dlr-report__filters-head">
        <h2 class="tv-section-head__title">Filtros de búsqueda</h2>
        <p class="tv-section-head__sub">Filtra campañas por período, estado y nombre</p>
      </header>
      <div class="tv-panel__body tv-dlr-report__filters-body">
        <form method="get" action="/app/campaigns" class="tv-dlr-report__filters-form">
          <div class="tv-dlr-report__filters-grid">
            ${renderFilterField("Desde", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(f.startDate ?? "")}" />`)}
            ${renderFilterField("Hasta", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(f.endDate ?? "")}" />`)}
            ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
            ${renderFilterField("Remitente", `<input type="text" name="sender_id" class="tv-filter-input" placeholder="${escapeHtml(senderFilterPlaceholder)}" value="${escapeHtml(f.senderId ?? "")}" />`)}
            ${renderFilterField("Nombre", `<input type="text" name="q" class="tv-filter-input" placeholder="Buscar por nombre" value="${escapeHtml(f.q ?? "")}" />`)}
            <div class="tv-dlr-report__filter-actions">
              <button type="submit" class="btn btn-primary btn-sm">Buscar</button>
              <a class="btn btn-ghost btn-sm" href="/app/campaigns">Limpiar</a>
            </div>
          </div>
        </form>
      </div>
    </section>`;

  const body = `
    ${renderPageHeader({
      title: "Campañas",
      subtitle: "Borradores y campañas SMS con envío real vía operador (aSMSC).",
      headClass: "tv-page-head--title-cta",
      actions: renderBtn("Nueva campaña", {
        href: "/app/campaigns/new",
        variant: "primary",
        icon: "campaign",
        size: "sm",
      }),
    })}
    <div class="tv-client-dashboard tv-dlr-report tv-campaigns-report">
      ${kpis}
      ${filtersPanel}
      <div class="tv-dash-block tv-dlr-report__table-block">
        <div class="tv-dash-block__head">
          <h2 class="tv-dash-block__title">Últimas campañas</h2>
        </div>
        ${renderClientDataTablePanel(
          `<table class="tv-table tv-table--dash tv-table--col-resize" data-table-id="app-campaigns">
                <colgroup>
                  <col><col><col><col><col><col><col><col>
                </colgroup>
                <thead><tr>
                  <th>Fecha</th><th>Nombre</th><th>Remitente</th><th>Destinatarios</th>
                  <th>SMS</th><th>Estado</th><th>Modo</th><th>Acciones</th>
                </tr></thead>
                <tbody>${renderCampaignsTableRows(campaigns)}</tbody>
              </table>`,
          renderClientTableFooter({
            tableKey: "app_campaigns",
            count: campaigns.length,
            limit: f.limit ?? 20,
            basePath: "/app/campaigns",
            countHint: "con filtros aplicados",
            hiddenFields: {
              q: f.q,
              status: f.status,
              sender_id: f.senderId,
              start_date: f.startDate,
              end_date: f.endDate,
            },
          }),
        )}
      </div>
    </div>`;
  return wrapAppPage(ctx, "campaigns", "Campañas", body);
}
