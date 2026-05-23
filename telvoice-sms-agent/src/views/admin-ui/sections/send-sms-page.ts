import { env } from "../../../config/env.js";
import { SMS_TYPE_HELP_TEXT } from "../../../utils/asmsc-hints.js";
import { escapeHtml } from "../../../utils/html.js";
import type { SendTestFormValues } from "../../admin-pages.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderMobilePreview,
  renderModeCards,
  renderNotice,
  renderPageHeader,
  renderPanel,
  renderStatChip,
} from "../page-kit.js";

function renderSmsTypeSelect(selected: string): string {
  const pSelected = selected === "P" ? " selected" : "";
  const tSelected = selected === "T" ? " selected" : "";
  return `<select id="sms_type" name="sms_type" required class="tv-input-full">
    <option value="P"${pSelected}>P — Promotional</option>
    <option value="T"${tSelected}>T — Transactional</option>
  </select>
  <p class="field-hint">${escapeHtml(SMS_TYPE_HELP_TEXT)}</p>`;
}

export function renderSendSmsPageBody(options: {
  error?: string;
  values?: Partial<SendTestFormValues>;
  smsBalance?: string;
}): string {
  const defaultSmsType = env.asmsc.defaultSmsType;
  const v: SendTestFormValues = {
    phonenumber: options.values?.phonenumber ?? "56912345678",
    textmessage: options.values?.textmessage ?? "Hola {nombre}, tu código es {codigo}. — {empresa}",
    sender_id: options.values?.sender_id ?? (env.asmsc.defaultSenderId || "TELVOICE"),
    sms_type: options.values?.sms_type ?? defaultSmsType,
    encoding: options.values?.encoding ?? "T",
  };

  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const balance = options.smsBalance ?? "12.450";

  const headerActions = `
    ${renderBtn("Guardar borrador", { variant: "ghost", disabled: true, title: "Próximamente" })}
    <button type="submit" form="tv-send-form" class="btn btn-secondary"><span class="material-symbols-outlined" style="font-size:1.1rem">science</span>Enviar prueba</button>
    ${renderBtn("Programar envío", { variant: "ghost", disabled: true, title: "Próximamente" })}
    <button type="submit" form="tv-send-form" class="tv-btn-campaign"><span class="material-symbols-outlined" style="font-size:1.1rem">send</span>Enviar campaña</button>
  `;

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
        description: "Define fecha y hora de despacho.",
        icon: "schedule",
      },
      {
        id: "template",
        label: "Desde plantilla",
        description: "Mensajes preaprobados con variables.",
        icon: "description",
      },
    ],
    "single",
  );

  const varChips = ["{nombre}", "{codigo}", "{empresa}", "{fecha}"]
    .map(
      (v) =>
        `<button type="button" class="tv-var-chip" data-tv-insert-var="${escapeHtml(v)}">${escapeHtml(v)}</button>`,
    )
    .join("");

  const form = `
    <form method="post" action="/admin/sms/send-test" id="tv-send-form" class="tv-send-layout">
      <div class="tv-send-main">
        ${modes}
        <div class="tv-panel">
          <div class="tv-panel__body">
            <div class="tv-form-grid">
              <div class="form-group">
                <label for="campaign_name">Nombre de campaña</label>
                <input id="campaign_name" name="campaign_name" type="text" placeholder="Ej. OTP Verificación Mayo" disabled title="Próximamente en backend" />
              </div>
              <div class="form-group">
                <label for="sender_id">Remitente / Sender ID</label>
                <input id="sender_id" name="sender_id" value="${escapeHtml(v.sender_id)}" required />
              </div>
            </div>
            <div data-tv-single-fields>
              <div class="form-group">
                <label for="phonenumber">Número destinatario (sin +)</label>
                <input id="phonenumber" name="phonenumber" value="${escapeHtml(v.phonenumber)}" required inputmode="numeric" />
              </div>
            </div>
            <div data-tv-mass-fields hidden>
              <div class="form-group">
                <label for="contact_list">Lista de contactos</label>
                <select id="contact_list" disabled class="tv-input-full">
                  <option>Clientes activos CL (mock · 2.400)</option>
                  <option>Leads últimos 30 días (mock · 890)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="csv_file">Cargar CSV</label>
                <input id="csv_file" type="file" accept=".csv" disabled class="tv-input-full" />
                <p class="field-hint">Formato: número;mensaje o número en primera columna.</p>
              </div>
            </div>
            <div data-tv-template-fields hidden>
              <div class="form-group">
                <label>Plantilla</label>
                <select disabled class="tv-input-full">
                  <option>OTP verificación</option>
                  <option>Recordatorio de pago</option>
                  <option>Bienvenida cliente</option>
                </select>
              </div>
            </div>
            <div data-tv-schedule-fields hidden>
              <div class="tv-form-grid">
                <div class="form-group">
                  <label for="schedule_date">Fecha programada</label>
                  <input id="schedule_date" type="date" disabled />
                </div>
                <div class="form-group">
                  <label for="schedule_time">Hora</label>
                  <input id="schedule_time" type="time" disabled />
                </div>
              </div>
            </div>
            <div class="form-group">
              <label for="textmessage">Mensaje SMS</label>
              <textarea id="textmessage" name="textmessage" required rows="5">${escapeHtml(v.textmessage)}</textarea>
              <div class="tv-var-row">${varChips}</div>
            </div>
            <div class="tv-form-grid tv-form-grid--compact">
              <div class="form-group">
                <label for="sms_type">Tipo SMS</label>
                ${renderSmsTypeSelect(v.sms_type)}
              </div>
              <div class="form-group">
                <label for="encoding">Encoding</label>
                <input id="encoding" name="encoding" value="${escapeHtml(v.encoding)}" maxlength="1" />
                <p class="field-hint">T = GSM · U = Unicode</p>
              </div>
            </div>
            <p class="field-hint tv-mock-tag">Envío real conectado: POST /admin/sms/send-test (cliente prueba aSMSC).</p>
          </div>
        </div>
        ${renderPanel(
          "Buenas prácticas",
          `<ul class="tv-tips-list">
            <li>Evita enlaces acortados sospechosos.</li>
            <li>Incluye identificación clara de tu empresa.</li>
            <li>Respeta bajas y opt-out.</li>
            <li>Usa mensajes cortos y directos.</li>
            <li>Verifica números antes de enviar campañas masivas.</li>
          </ul>`,
        )}
      </div>
      <aside class="tv-send-aside">
        <div class="tv-panel">
          <header class="tv-section-head"><h2 class="tv-section-head__title">Validación</h2></header>
          <div class="tv-panel__body">
            <div class="tv-stat-chips">
              ${renderStatChip("Caracteres", String(v.textmessage.length), "default")}
              ${renderStatChip("Segmentos est.", "1", "primary")}
              ${renderStatChip("Válidos", "1", "success")}
              ${renderStatChip("Inválidos", "0", "default")}
              ${renderStatChip("Duplicados", "0", "warn")}
              ${renderStatChip("Costo est.", "1 SMS", "primary")}
              ${renderStatChip("Saldo después", balance, "success")}
            </div>
            ${renderNotice("Los mensajes serán descontados del saldo disponible una vez procesado el envío.")}
          </div>
        </div>
        <div class="tv-panel">
          <header class="tv-section-head"><h2 class="tv-section-head__title">Vista previa móvil</h2></header>
          <div class="tv-panel__body tv-panel__body--center">
            ${renderMobilePreview(v.sender_id, v.textmessage)}
          </div>
        </div>
      </aside>
    </form>`;

  return `
    ${renderPageHeader({
      title: "Enviar SMS",
      subtitle:
        "Crea campañas, envía mensajes individuales o programa envíos masivos usando tu saldo Telvoice.",
      actions: headerActions,
    })}
    ${errorBlock}
    ${form}
    ${renderAdminUiScript()}
    <script>
    document.querySelectorAll("[data-tv-insert-var]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var ta = document.getElementById("textmessage");
        if (!ta) return;
        ta.value += btn.getAttribute("data-tv-insert-var");
        ta.dispatchEvent(new Event("input"));
      });
    });
    </script>`;
}
