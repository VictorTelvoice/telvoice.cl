import type { CompanyRow } from "../../../types/tenant.js";
import type { AdminSessionUser } from "../../../types/admin.js";
import type { PanelCampaignSendResult } from "../../../types/sms-panel.js";
import { escapeHtml } from "../../../utils/html.js";
import { APP_SCHEDULE_TIMEZONE } from "../../../utils/scheduleTime.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderBtn,
  renderModeCards,
  renderNotice,
  renderPageHeader,
  renderPanel,
  renderStatChip,
} from "../page-kit.js";
import { renderMassCampaignCsvPreviewScript } from "../../shared/mass-campaign-csv-preview-script.js";

export type AdminCampaignSendMode = "mass" | "scheduled";

export function renderAdminCampaignSendPage(options: {
  admin: AdminSessionUser;
  companies: CompanyRow[];
  selectedCompanyId?: string;
  selectedCompany?: CompanyRow | null;
  availSms?: number;
  activeMode: AdminCampaignSendMode;
  idempotencyKey: string;
  flash?: string;
  error?: string;
  campaignResult?: PanelCampaignSendResult;
  formValues?: {
    campaign_name?: string;
    sender_id?: string;
    message?: string;
    schedule_date?: string;
    schedule_time?: string;
  };
}): string {
  const activeMode = options.activeMode;
  const company = options.selectedCompany;
  const suggestedSender =
    options.formValues?.sender_id?.trim() ||
    (company?.name
      ? company.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 11).toUpperCase() ||
        "TELVOICE"
      : "TELVOICE");

  const todayCl = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_SCHEDULE_TIMEZONE,
  }).format(new Date());

  const companyOptions = options.companies
    .map((c) => {
      const sel =
        c.id === options.selectedCompanyId ? " selected" : "";
      return `<option value="${escapeHtml(c.id)}"${sel}>${escapeHtml(c.name)}</option>`;
    })
    .join("");

  const avail = options.availSms ?? 0;
  const balanceLabel =
    company && avail >= 0
      ? `${avail.toLocaleString("es-CL")} SMS`
      : "Selecciona cliente";

  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";
  const flashBlock = options.flash
    ? `<div class="alert alert-success">${escapeHtml(options.flash)}</div>`
    : "";

  const resultBlock =
    options.campaignResult && !options.flash
      ? `<div class="alert alert-success">Campaña «${escapeHtml(options.campaignResult.campaignName)}»: ${options.campaignResult.queued} en cola, ${options.campaignResult.sent} enviados, ${options.campaignResult.failed} fallidos.</div>`
      : "";

  const modes = renderModeCards(
    [
      {
        id: "mass",
        label: "Campaña masiva",
        description: "CSV con vista previa antes del despacho inmediato.",
        icon: "groups",
      },
      {
        id: "scheduled",
        label: "Envío programado",
        description: "Misma carga CSV; el despacho corre a la hora indicada.",
        icon: "schedule",
      },
    ],
    activeMode,
  );

  const dispatchDisabled = !company;

  const body = `
    ${renderPageHeader({
      title: "Enviar campaña (superadmin)",
      subtitle:
        "Carga CSV masivo o programado en nombre de un cliente. Revisa la tabla antes de confirmar el despacho.",
      actions: renderBtn("Ver campañas", {
        href: "/admin/campaigns",
        variant: "ghost",
        icon: "campaign",
      }),
    })}
    ${errorBlock}
    ${flashBlock}
    ${resultBlock}
  <form method="post" action="/admin/campaigns/send" id="tv-admin-campaign-form" class="tv-admin-campaign-layout">
    <input type="hidden" name="idempotency_key" value="${escapeHtml(options.idempotencyKey)}" />
    <input type="hidden" name="send_mode" id="tv-send-mode" value="${escapeHtml(activeMode)}" />
    <input type="hidden" name="bulk_rows_json" id="tv-bulk-rows-json" value="" />
    <div class="tv-send-main">
      ${modes}
      ${renderPanel(
        "Cliente y remitente",
        `<div class="tv-form-grid">
          <div class="form-group">
            <label for="company_id">Cliente / empresa</label>
            <select id="company_id" name="company_id" class="tv-input-full" required>
              <option value="">— Seleccionar —</option>
              ${companyOptions}
            </select>
            <p class="field-hint">Al cambiar el cliente se actualiza el saldo SMS disponible.</p>
          </div>
          <div class="form-group">
            <label for="campaign_name">Nombre de campaña (opcional)</label>
            <input id="campaign_name" class="tv-input-full" name="campaign_name" value="${escapeHtml(options.formValues?.campaign_name ?? "")}" placeholder="Ej. Promo mayo 2026" />
          </div>
          <div class="form-group">
            <label for="sender_id">Remitente / Sender ID</label>
            <input id="sender_id" class="tv-input-full" name="sender_id" value="${escapeHtml(suggestedSender)}" required maxlength="11" pattern="[A-Za-z0-9]+" />
            ${company ? `<p class="field-hint">Empresa: <strong>${escapeHtml(company.name)}</strong></p>` : ""}
          </div>
        </div>`,
      )}
      <div data-tv-mass-fields>
        ${renderPanel(
          "Carga CSV y vista previa",
          `<div class="form-group">
            <label for="csv_file">Archivo CSV</label>
            <input id="csv_file" type="file" accept=".csv,text/csv" class="tv-input-full" />
            <p class="field-hint">Columnas <code>numero</code> y <code>mensaje</code> (o solo números + mensaje común abajo). Separador coma o punto y coma.</p>
          </div>
          <p class="field-hint tv-mass-summary" id="tv-mass-summary">Sube un CSV para ver la vista previa antes del despacho.</p>
          <div class="tv-mass-table-wrap" id="tv-mass-table-wrap" hidden>
            <div class="table-wrap tv-panel" style="padding:0;margin-top:0.5rem">
              <table class="tv-table tv-table--dense">
                <thead><tr><th>Número</th><th>Mensaje</th><th>Seg.</th><th>SMS</th></tr></thead>
                <tbody id="tv-mass-preview-body"></tbody>
              </table>
            </div>
            <p class="field-hint" id="tv-mass-preview-more" hidden></p>
          </div>
          <div class="form-group" data-tv-message-group style="margin-top:1rem">
            <label for="tv-sms-message">Mensaje común <span class="field-hint" id="tv-mass-msg-hint" style="font-weight:400"></span></label>
            <textarea id="tv-sms-message" class="tv-input-full" name="message" rows="4" placeholder="Mensaje para todas las filas si el CSV solo trae números…">${escapeHtml(options.formValues?.message ?? "")}</textarea>
          </div>`,
        )}
      </div>
      <div data-tv-schedule-fields${activeMode === "scheduled" ? "" : " hidden"}>
        ${renderPanel(
          "Programación (Chile)",
          `<div class="tv-form-grid">
            <div class="form-group">
              <label for="schedule_date">Fecha</label>
              <input id="schedule_date" name="schedule_date" type="date" class="tv-input-full" min="${escapeHtml(todayCl)}" value="${escapeHtml(options.formValues?.schedule_date ?? "")}" />
            </div>
            <div class="form-group">
              <label for="schedule_time">Hora</label>
              <input id="schedule_time" name="schedule_time" type="time" class="tv-input-full" value="${escapeHtml(options.formValues?.schedule_time ?? "")}" />
            </div>
          </div>
          <p class="field-hint">Zona ${escapeHtml(APP_SCHEDULE_TIMEZONE)}. El despacho masivo se encola para esa hora.</p>`,
        )}
      </div>
      ${renderNotice(
        "Tras confirmar, los mensajes se encolan en segundo plano (~20 SMS/s según TPS configurado). La vista previa no envía SMS hasta pulsar el botón de confirmación.",
        "info",
      )}
      <button type="submit" class="btn btn-primary" id="tv-campaign-dispatch-btn" ${dispatchDisabled ? "disabled" : ""}>
        ${activeMode === "scheduled" ? "Confirmar y programar campaña" : "Confirmar y despachar campaña"}
      </button>
    </div>
    <aside>
      ${renderPanel(
        "Validación",
        `<div class="tv-stat-chips" style="flex-direction:column;align-items:stretch;gap:0.5rem">
          ${renderStatChip("Saldo cliente", balanceLabel, avail > 0 ? "success" : "warn")}
          <div class="tv-stat-chip tv-stat-chip--primary"><span class="tv-stat-chip__label">Filas válidas</span><span class="tv-stat-chip__value" data-tv-val-valid>0</span></div>
          <div class="tv-stat-chip tv-stat-chip--warn"><span class="tv-stat-chip__label">Errores CSV</span><span class="tv-stat-chip__value" data-tv-val-invalid>0</span></div>
          <div class="tv-stat-chip tv-stat-chip--default"><span class="tv-stat-chip__label">SMS estimados</span><span class="tv-stat-chip__value" data-tv-val-sms>0</span></div>
          <div class="tv-stat-chip tv-stat-chip--default"><span class="tv-stat-chip__label">Saldo tras envío</span><span class="tv-stat-chip__value" data-tv-val-balance>—</span></div>
        </div>`,
      )}
    </aside>
  </form>
  ${renderMassCampaignCsvPreviewScript({
    initialMode: activeMode,
    suggestedSenderId: suggestedSender,
    availSms: avail,
    maxLiveSegments: 10,
    maxPreviewRows: 12,
    numbersRestricted: false,
    allowedLiveNumbers: [],
  })}
  <script>
  (function(){
    var sel = document.getElementById('company_id');
    if(sel) sel.addEventListener('change', function(){
      var id = sel.value;
      var mode = document.getElementById('tv-send-mode');
      var q = id ? '?company_id=' + encodeURIComponent(id) : '/admin/campaigns/send';
      if(id && mode && mode.value) q += (q.indexOf('?')>=0 ? '&' : '?') + 'mode=' + encodeURIComponent(mode.value);
      window.location.href = id ? q : '/admin/campaigns/send';
    });
  })();
  </script>`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Enviar campaña",
    body,
    activeNav: "campaigns",
  });
}
