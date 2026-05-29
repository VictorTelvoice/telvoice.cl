import type {
  AppSettingsPageData,
  ClientSettingsData,
} from "../../types/client-settings.js";
import { escapeHtml } from "../../utils/html.js";
import { renderPageHeader, renderTabs } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";

export type { ClientSettingsData };

const SETTINGS_TABS = [
  { id: "empresa", label: "Empresa" },
  { id: "facturacion", label: "Facturación" },
  { id: "seguridad", label: "Seguridad" },
  { id: "notificaciones", label: "Notificaciones" },
  { id: "preferencias", label: "Preferencias" },
] as const;

function countryLabel(code: string): string {
  const map: Record<string, string> = {
    CL: "Chile",
    AR: "Argentina",
    BR: "Brasil",
    PE: "Perú",
    MX: "México",
    CO: "Colombia",
  };
  return map[code] ?? code;
}

export function buildDefaultClientSettings(ctx: AppPageContext): ClientSettingsData {
  const c = ctx.company;
  const p = ctx.profile;
  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const str = (k: string) => {
    const v = meta[k];
    return typeof v === "string" ? v : "";
  };

  return {
    activeTab: "empresa",
    company: {
      name: c.name?.trim() ?? "",
      rut: c.rut?.trim() ?? "",
      activity: str("activity") || str("giro"),
      website: str("website"),
      country: countryLabel(c.country) || "Chile",
      city: str("city"),
      address: str("address") || str("commercial_address"),
      contactName: c.contact_name?.trim() ?? p.fullName?.trim() ?? "",
      contactEmail: p.email?.trim() ?? c.billing_email?.trim() ?? "",
      contactPhone: c.contact_phone?.trim() ?? "",
    },
    billing: {
      legalName: c.legal_name?.trim() ?? c.name?.trim() ?? "",
      rut: c.rut?.trim() ?? "",
      address: str("billing_address") || str("address"),
      email: c.billing_email?.trim() ?? "",
      country: "Chile",
      currency: "CLP",
      sendReceipts: true,
      sendInvoices: true,
      notifyPending: true,
      notifyCredited: true,
    },
    notifications: {
      purchaseStarted: true,
      paymentApproved: true,
      balanceCredited: true,
      paymentRejected: true,
      lowBalance: true,
      campaignFinished: true,
      massDeliveryError: true,
      dlrReports: true,
      apiKeyRegenerated: true,
      webhookErrors: true,
      rateLimit: true,
      ticketNewMessage: true,
      ticketResolved: true,
      ticketWaiting: true,
      lowBalanceThreshold: 100,
    },
    preferences: {
      language: "es",
      timezone: "America/Santiago",
      dateFormat: "DD/MM/YYYY",
      homePage: "dashboard",
      ticketView: "table",
      showQuickHelp: true,
      defaultSender: "Telvoice",
      defaultCountry: "Chile",
      phoneFormat: "e164",
      warnMultiSms: true,
      confirmMassSend: true,
    },
  };
}

function settingsPageStyles(): string {
  return `<style>
    .tv-settings-page .tv-settings-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 300px);
      gap: 1.25rem;
      align-items: start;
    }
    .tv-settings-page .tv-settings-main { min-width: 0; }
    .tv-settings-tab-panel { display: none; padding-top: 1rem; }
    .tv-settings-tab-panel[data-active="true"] { display: block; }
    .tv-settings-form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }
    .tv-settings-form-grid .form-group--full { grid-column: 1 / -1; }
    .tv-settings-notif-group {
      margin-bottom: 1.25rem;
    }
    .tv-settings-notif-group h3 {
      font-size: 0.9rem;
      margin: 0 0 0.65rem;
      color: var(--tv-text);
    }
    .tv-settings-switch-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .tv-set-switch {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      cursor: pointer;
      font-size: 0.88rem;
    }
    .tv-set-switch input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }
    .tv-set-switch__track {
      width: 2.25rem;
      height: 1.2rem;
      background: var(--tv-border);
      border-radius: 999px;
      position: relative;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .tv-set-switch__track::after {
      content: "";
      position: absolute;
      width: 0.95rem;
      height: 0.95rem;
      left: 2px;
      top: 2px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.15s;
      box-shadow: 0 1px 2px rgba(0,0,0,0.15);
    }
    .tv-set-switch input:checked + .tv-set-switch__track {
      background: var(--tv-primary);
    }
    .tv-set-switch input:checked + .tv-set-switch__track::after {
      transform: translateX(1.05rem);
    }
    .tv-settings-security-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--tv-border);
      flex-wrap: wrap;
    }
    .tv-settings-security-row:last-child { border-bottom: none; }
    .tv-settings-aside { display: flex; flex-direction: column; gap: 1rem; }
    .tv-settings-status dl {
      display: grid;
      gap: 0.5rem;
      margin: 0;
      font-size: 0.88rem;
    }
    .tv-settings-status dt {
      color: var(--tv-muted);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .tv-settings-status dd { margin: 0.1rem 0 0; font-weight: 600; }
    .tv-settings-toast {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      left: 1.25rem;
      max-width: 380px;
      margin-left: auto;
      padding: 0.85rem 1rem;
      background: #0f172a;
      color: #f8fafc;
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow-lg);
      font-size: 0.88rem;
      z-index: 300;
      display: none;
    }
    .tv-settings-toast[aria-hidden="false"] { display: block; }
    .tv-settings-toast--error { background: #7f1d1d; }
    .tv-settings-modal {
      position: fixed;
      inset: 0;
      z-index: 260;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .tv-settings-modal[aria-hidden="false"] { display: flex; }
    .tv-settings-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }
    .tv-settings-modal__panel {
      position: relative;
      width: min(420px, 100%);
      background: var(--tv-surface);
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow-lg);
      padding: 1.25rem;
    }
    .tv-settings-field-error {
      font-size: 0.75rem;
      color: #b91c1c;
      margin-top: 0.25rem;
    }
    @media (max-width: 900px) {
      .tv-settings-page .tv-settings-layout { grid-template-columns: 1fr; }
      .tv-settings-form-grid { grid-template-columns: 1fr; }
    }
  </style>`;
}

function field(
  label: string,
  inputHtml: string,
  full = false,
): string {
  return `<div class="form-group${full ? " form-group--full" : ""}">
    <label>${escapeHtml(label)}</label>
    ${inputHtml}
  </div>`;
}

function textInput(id: string, placeholder = "", type = "text"): string {
  return `<input type="${escapeHtml(type)}" id="${escapeHtml(id)}" class="tv-input-full" data-settings-field placeholder="${escapeHtml(placeholder)}" />`;
}

function switchRow(id: string, label: string, checked = true): string {
  return `<label class="tv-set-switch">
    <input type="checkbox" id="${escapeHtml(id)}" data-settings-switch ${checked ? "checked" : ""} />
    <span class="tv-set-switch__track" aria-hidden="true"></span>
    <span>${escapeHtml(label)}</span>
  </label>`;
}

function renderEmpresaTab(): string {
  return `<div class="tv-settings-tab-panel" data-tv-settings-tab="empresa" data-active="true">
    <section class="tv-panel">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Datos de empresa</h2>
      </header>
      <div class="tv-panel__body">
        <div class="alert alert-warn" role="status" style="margin-bottom:1rem">
          Estos datos ayudan al equipo Telvoice a identificar tu cuenta, revisar compras y entregar soporte comercial o técnico.
        </div>
        <div class="tv-settings-form-grid">
          ${field("Nombre de empresa", textInput("tv-set-co-name", "Nombre comercial"), true)}
          ${field("RUT empresa", textInput("tv-set-co-rut", "12.345.678-9"))}
          ${field("Giro o actividad", textInput("tv-set-co-activity", "Ej. Telecomunicaciones"))}
          ${field("Sitio web", textInput("tv-set-co-website", "https://", "url"))}
          ${field("País", textInput("tv-set-co-country", "Chile"))}
          ${field("Ciudad", textInput("tv-set-co-city", "Santiago"))}
          ${field("Dirección comercial", textInput("tv-set-co-address", "Calle y número"), true)}
          ${field("Nombre contacto principal", textInput("tv-set-co-contact-name"))}
          ${field("Email contacto", textInput("tv-set-co-contact-email", "contacto@empresa.cl", "email"))}
          ${field("Teléfono contacto", textInput("tv-set-co-contact-phone", "+56 9 ...", "tel"))}
        </div>
      </div>
    </section>
  </div>`;
}

function renderFacturacionTab(): string {
  return `<div class="tv-settings-tab-panel" data-tv-settings-tab="facturacion">
    <section class="tv-panel">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Datos de facturación</h2>
      </header>
      <div class="tv-panel__body">
        <div class="tv-settings-form-grid">
          ${field("Razón social", textInput("tv-set-bl-legal", "Razón social"))}
          ${field("RUT facturación", textInput("tv-set-bl-rut"))}
          ${field("Dirección tributaria", textInput("tv-set-bl-address"), true)}
          ${field("Email facturación", textInput("tv-set-bl-email", "facturacion@empresa.cl", "email"))}
          ${field("País de facturación", textInput("tv-set-bl-country", "Chile"))}
          ${field("Moneda preferida", `<select id="tv-set-bl-currency" class="tv-input-full" data-settings-field>
            <option value="CLP">CLP</option>
            <option value="USD">USD</option>
          </select>`)}
        </div>
        <h3 class="tv-section-head__title" style="font-size:0.95rem;margin:1.25rem 0 0.65rem">Preferencias de documentos</h3>
        <div class="tv-settings-switch-list">
          ${switchRow("tv-set-bl-receipts", "Enviar comprobantes por email")}
          ${switchRow("tv-set-bl-invoices", "Enviar factura o boleta cuando corresponda")}
          ${switchRow("tv-set-bl-pending", "Notificar pagos pendientes")}
          ${switchRow("tv-set-bl-credited", "Notificar compras acreditadas")}
        </div>
        <p class="field-hint" style="margin:1rem 0 0">
          La emisión de documentos tributarios dependerá del método de pago, datos ingresados y configuración comercial de la cuenta.
        </p>
      </div>
    </section>
  </div>`;
}

function renderSeguridadTab(ctx: AppPageContext): string {
  const email = ctx.profile.email || "—";
  const statusLabel =
    ctx.company.status === "active"
      ? '<span class="badge badge-ok">Activa</span>'
      : `<span class="badge badge-warn">${escapeHtml(ctx.company.status)}</span>`;

  return `<div class="tv-settings-tab-panel" data-tv-settings-tab="seguridad">
    <section class="tv-panel">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Seguridad de cuenta</h2>
      </header>
      <div class="tv-panel__body">
        <div class="tv-settings-security-row">
          <div><strong>Email de acceso</strong><br /><span class="field-hint">${escapeHtml(email)}</span></div>
        </div>
        <div class="tv-settings-security-row">
          <div><strong>Estado de cuenta</strong></div>
          ${statusLabel}
        </div>
        <div class="tv-settings-security-row">
          <div><strong>Último acceso</strong><br /><span class="field-hint">Hace menos de 1 hora (referencia)</span></div>
        </div>
        <div class="tv-settings-security-row">
          <div><strong>Autenticación en dos pasos</strong><br /><span class="badge badge-muted">Próximamente</span></div>
          <button type="button" class="btn btn-ghost btn-sm" data-tv-settings-soon>Activar 2FA</button>
        </div>
        <div class="tv-settings-security-row">
          <div><strong>Sesiones activas</strong><br /><span class="field-hint">1 sesión en este navegador (mock)</span></div>
          <button type="button" class="btn btn-ghost btn-sm" data-tv-settings-soon>Cerrar sesiones</button>
        </div>
        <div class="tv-settings-security-row">
          <div><strong>Contraseña</strong></div>
          <button type="button" class="btn btn-secondary btn-sm" data-tv-settings-soon>Cambiar contraseña</button>
        </div>
      </div>
    </section>
    <section class="tv-panel" style="margin-top:1rem">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Buenas prácticas</h2>
      </header>
      <div class="tv-panel__body">
        <ul style="margin:0;padding-left:1.15rem;color:var(--tv-muted);font-size:0.88rem;line-height:1.55">
          <li>Usa una contraseña segura.</li>
          <li>No compartas tus credenciales.</li>
          <li>Regenera tu API Key si sospechas exposición.</li>
          <li>Revisa tus accesos si detectas actividad inusual.</li>
        </ul>
      </div>
    </section>
  </div>`;
}

function renderNotificacionesTab(): string {
  return `<div class="tv-settings-tab-panel" data-tv-settings-tab="notificaciones">
    <section class="tv-panel">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Notificaciones</h2>
      </header>
      <div class="tv-panel__body">
        <div class="tv-settings-notif-group">
          <h3>Compras y pagos</h3>
          <div class="tv-settings-switch-list">
            ${switchRow("tv-set-n-purchase-started", "Compra iniciada")}
            ${switchRow("tv-set-n-payment-approved", "Pago aprobado")}
            ${switchRow("tv-set-n-balance-credited", "Saldo acreditado")}
            ${switchRow("tv-set-n-payment-rejected", "Pago rechazado")}
          </div>
        </div>
        <div class="tv-settings-notif-group">
          <h3>Operación SMS</h3>
          <div class="tv-settings-switch-list">
            ${switchRow("tv-set-n-low-balance", "Saldo bajo")}
            ${switchRow("tv-set-n-campaign-done", "Campaña finalizada")}
            ${switchRow("tv-set-n-mass-error", "Error de entrega masiva")}
            ${switchRow("tv-set-n-dlr-reports", "Reportes de entrega disponibles")}
          </div>
        </div>
        <div class="tv-settings-notif-group">
          <h3>API</h3>
          <div class="tv-settings-switch-list">
            ${switchRow("tv-set-n-api-regen", "API Key regenerada")}
            ${switchRow("tv-set-n-webhook-err", "Webhook con errores")}
            ${switchRow("tv-set-n-rate-limit", "Límite de solicitudes alcanzado")}
          </div>
        </div>
        <div class="tv-settings-notif-group">
          <h3>Soporte</h3>
          <div class="tv-settings-switch-list">
            ${switchRow("tv-set-n-ticket-msg", "Nuevo mensaje en ticket")}
            ${switchRow("tv-set-n-ticket-resolved", "Ticket resuelto")}
            ${switchRow("tv-set-n-ticket-waiting", "Ticket esperando respuesta")}
          </div>
        </div>
        <div class="form-group" style="max-width:240px;margin-top:0.5rem">
          <label for="tv-set-n-threshold">Umbral de saldo bajo</label>
          <input type="number" id="tv-set-n-threshold" class="tv-input-full" data-settings-field min="1" step="1" placeholder="Ej: 100 SMS" />
          <p class="field-hint">Te avisaremos cuando tu saldo SMS sea igual o menor a este valor.</p>
          <p class="tv-settings-field-error" id="tv-set-n-threshold-err" hidden></p>
        </div>
      </div>
    </section>
  </div>`;
}

function renderPreferenciasTab(): string {
  return `<div class="tv-settings-tab-panel" data-tv-settings-tab="preferencias">
    <section class="tv-panel">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Preferencias del panel</h2>
      </header>
      <div class="tv-panel__body">
        <div class="tv-settings-form-grid">
          ${field("Idioma", `<select id="tv-set-p-language" class="tv-input-full" data-settings-field>
            <option value="es">Español</option>
          </select>`)}
          ${field("Zona horaria", `<select id="tv-set-p-timezone" class="tv-input-full" data-settings-field>
            <option value="America/Santiago">Chile (America/Santiago)</option>
          </select>`)}
          ${field("Formato de fecha", `<select id="tv-set-p-datefmt" class="tv-input-full" data-settings-field>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </select>`)}
          ${field("Página inicial", `<select id="tv-set-p-home" class="tv-input-full" data-settings-field>
            <option value="dashboard">Dashboard</option>
            <option value="send-sms">Enviar SMS</option>
            <option value="wallet">Mi saldo</option>
            <option value="campaigns">Campañas</option>
          </select>`)}
          ${field("Vista preferida de tickets", `<select id="tv-set-p-tickets" class="tv-input-full" data-settings-field>
            <option value="table">Tabla</option>
            <option value="cards">Cards</option>
          </select>`)}
          ${field("Mostrar ayuda rápida", `<select id="tv-set-p-quickhelp" class="tv-input-full" data-settings-field>
            <option value="1">Activado</option>
            <option value="0">Desactivado</option>
          </select>`)}
        </div>
      </div>
    </section>
    <section class="tv-panel" style="margin-top:1rem">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Preferencias SMS</h2>
      </header>
      <div class="tv-panel__body">
        <div class="tv-settings-form-grid">
          ${field("Remitente por defecto", textInput("tv-set-p-sender", "Telvoice"))}
          ${field("País por defecto para envíos", `<select id="tv-set-p-sms-country" class="tv-input-full" data-settings-field>
            <option>Chile</option><option>Argentina</option><option>Brasil</option>
            <option>Perú</option><option>México</option><option>Colombia</option><option>Otro</option>
          </select>`)}
          ${field("Formato de número preferido", `<select id="tv-set-p-phone-fmt" class="tv-input-full" data-settings-field>
            <option value="e164">E.164 (+569...)</option>
            <option value="local">Local chileno</option>
            <option value="intl">Internacional</option>
          </select>`)}
        </div>
        <div class="tv-settings-switch-list" style="margin-top:1rem">
          ${switchRow("tv-set-p-warn-sms", "Advertir si el mensaje supera 1 SMS")}
          ${switchRow("tv-set-p-confirm-mass", "Confirmar antes de envíos masivos")}
        </div>
      </div>
    </section>
  </div>`;
}

function renderAccountAside(ctx: AppPageContext): string {
  const statusBadge =
    ctx.company.status === "active"
      ? '<span class="badge badge-ok">Activa</span>'
      : `<span class="badge badge-warn">${escapeHtml(ctx.company.status)}</span>`;

  return `<aside class="tv-settings-aside">
    <section class="tv-panel tv-settings-status">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Estado de cuenta</h2>
      </header>
      <div class="tv-panel__body">
        <dl>
          <div><dt>Empresa</dt><dd>${escapeHtml(ctx.company.name)}</dd></div>
          <div><dt>Company ID</dt><dd><code class="tv-code-sm">${escapeHtml(ctx.company.id)}</code></dd></div>
          <div><dt>Plan</dt><dd>Cliente SMS</dd></div>
          <div><dt>Estado</dt><dd>${statusBadge}</dd></div>
          <div><dt>Saldo SMS</dt><dd id="tv-settings-live-balance">${escapeHtml(fmtSms(ctx.balance.availableSms))}</dd></div>
          <div><dt>Última compra</dt><dd class="field-hint">Referencia local (mock)</dd></div>
        </dl>
        <a href="/app/orders" class="btn btn-secondary btn-sm" style="margin-top:1rem">Ver mis órdenes</a>
      </div>
    </section>
    <section class="tv-panel">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Acciones de cuenta</h2>
      </header>
      <div class="tv-panel__body" style="display:flex;flex-direction:column;gap:0.5rem">
        <button type="button" class="btn btn-ghost btn-sm" data-tv-settings-request="legal">Solicitar cambio de datos legales</button>
        <button type="button" class="btn btn-ghost btn-sm" data-tv-settings-request="delete">Solicitar eliminación de cuenta</button>
        <button type="button" class="btn btn-ghost btn-sm" data-tv-settings-request="admin">Contactar soporte administrativo</button>
      </div>
    </section>
  </aside>`;
}

function renderSettingsScript(
  companyId: string,
  pageData: AppSettingsPageData,
): string {
  const serverJson = JSON.stringify(pageData.settings).replace(/</g, "\\u003c");
  const dbAvailable =
    pageData.module.available && companyId !== "default";
  const syncHint =
    pageData.syncSource === "supabase"
      ? "Configuración sincronizada con tu empresa."
      : pageData.syncSource === "local"
        ? "Configuración guardada localmente."
        : dbAvailable
          ? "Aún no has guardado configuración en la nube."
          : "Los cambios se guardan en este navegador hasta conectar Supabase.";

  return `<script>
(function () {
  var STORAGE_KEY = "telvoice_client_settings_${escapeHtml(companyId)}";
  var SERVER_SETTINGS = ${serverJson};
  var DB_AVAILABLE = ${dbAvailable ? "true" : "false"};
  var SERVER_HAS_RECORD = ${pageData.hasStoredRecord ? "true" : "false"};
  var SERVER_SYNC = ${JSON.stringify(pageData.syncSource)};
  var SYNC_HINT = ${JSON.stringify(syncHint)};
  var lastSaved = null;
  var syncSource = SERVER_SYNC;
  var toast = document.getElementById("tv-settings-toast");
  var syncHintEl = document.getElementById("tv-settings-sync-hint");

  function showToast(msg, isError) {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = "tv-settings-toast" + (isError ? " tv-settings-toast--error" : "");
    toast.setAttribute("aria-hidden", "false");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.setAttribute("aria-hidden", "true"); }, 4200);
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  if (syncHintEl) syncHintEl.textContent = SYNC_HINT;

  function mergeDefaults(saved, defs) {
    var m = deepClone(defs);
    if (saved.activeTab) m.activeTab = saved.activeTab;
    if (saved.company) Object.assign(m.company, saved.company);
    if (saved.billing) Object.assign(m.billing, saved.billing);
    if (saved.notifications) Object.assign(m.notifications, saved.notifications);
    if (saved.preferences) Object.assign(m.preferences, saved.preferences);
    return m;
  }

  function loadLocalSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === "object") return mergeDefaults(p, SERVER_SETTINGS);
      }
    } catch (e) {}
    return null;
  }

  function loadSettings() {
    if (DB_AVAILABLE && SERVER_HAS_RECORD) {
      syncSource = "supabase";
      return deepClone(SERVER_SETTINGS);
    }
    if (!DB_AVAILABLE) {
      var local = loadLocalSettings();
      if (local) {
        syncSource = "local";
        return local;
      }
      return deepClone(SERVER_SETTINGS);
    }
    return deepClone(SERVER_SETTINGS);
  }

  function updateSyncHint() {
    if (!syncHintEl) return;
    if (syncSource === "supabase") {
      syncHintEl.textContent = "Configuración sincronizada con tu empresa.";
    } else if (syncSource === "local") {
      syncHintEl.textContent = "Configuración guardada localmente.";
    } else {
      syncHintEl.textContent = SYNC_HINT;
    }
  }

  function postJson(payload) {
    return fetch("/app/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    });
  }

  function saveLocal(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }
  function chk(id) {
    var el = document.getElementById(id);
    return el ? !!el.checked : false;
  }
  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v == null ? "" : String(v);
  }
  function setChk(id, v) {
    var el = document.getElementById(id);
    if (el) el.checked = !!v;
  }

  function collectSettings() {
    var activeTab = document.querySelector(".tv-tab--active[data-tv-tab]");
    return {
      activeTab: activeTab ? activeTab.getAttribute("data-tv-tab") : "empresa",
      company: {
        name: val("tv-set-co-name"),
        rut: val("tv-set-co-rut"),
        activity: val("tv-set-co-activity"),
        website: val("tv-set-co-website"),
        country: val("tv-set-co-country"),
        city: val("tv-set-co-city"),
        address: val("tv-set-co-address"),
        contactName: val("tv-set-co-contact-name"),
        contactEmail: val("tv-set-co-contact-email"),
        contactPhone: val("tv-set-co-contact-phone"),
      },
      billing: {
        legalName: val("tv-set-bl-legal"),
        rut: val("tv-set-bl-rut"),
        address: val("tv-set-bl-address"),
        email: val("tv-set-bl-email"),
        country: val("tv-set-bl-country"),
        currency: val("tv-set-bl-currency") || "CLP",
        sendReceipts: chk("tv-set-bl-receipts"),
        sendInvoices: chk("tv-set-bl-invoices"),
        notifyPending: chk("tv-set-bl-pending"),
        notifyCredited: chk("tv-set-bl-credited"),
      },
      notifications: {
        purchaseStarted: chk("tv-set-n-purchase-started"),
        paymentApproved: chk("tv-set-n-payment-approved"),
        balanceCredited: chk("tv-set-n-balance-credited"),
        paymentRejected: chk("tv-set-n-payment-rejected"),
        lowBalance: chk("tv-set-n-low-balance"),
        campaignFinished: chk("tv-set-n-campaign-done"),
        massDeliveryError: chk("tv-set-n-mass-error"),
        dlrReports: chk("tv-set-n-dlr-reports"),
        apiKeyRegenerated: chk("tv-set-n-api-regen"),
        webhookErrors: chk("tv-set-n-webhook-err"),
        rateLimit: chk("tv-set-n-rate-limit"),
        ticketNewMessage: chk("tv-set-n-ticket-msg"),
        ticketResolved: chk("tv-set-n-ticket-resolved"),
        ticketWaiting: chk("tv-set-n-ticket-waiting"),
        lowBalanceThreshold: parseInt(val("tv-set-n-threshold"), 10) || 0,
      },
      preferences: {
        language: val("tv-set-p-language") || "es",
        timezone: val("tv-set-p-timezone"),
        dateFormat: val("tv-set-p-datefmt"),
        homePage: val("tv-set-p-home"),
        ticketView: val("tv-set-p-tickets"),
        showQuickHelp: val("tv-set-p-quickhelp") === "1",
        defaultSender: val("tv-set-p-sender"),
        defaultCountry: val("tv-set-p-sms-country"),
        phoneFormat: val("tv-set-p-phone-fmt"),
        warnMultiSms: chk("tv-set-p-warn-sms"),
        confirmMassSend: chk("tv-set-p-confirm-mass"),
      },
    };
  }

  function applySettings(s) {
    setVal("tv-set-co-name", s.company.name);
    setVal("tv-set-co-rut", s.company.rut);
    setVal("tv-set-co-activity", s.company.activity);
    setVal("tv-set-co-website", s.company.website);
    setVal("tv-set-co-country", s.company.country);
    setVal("tv-set-co-city", s.company.city);
    setVal("tv-set-co-address", s.company.address);
    setVal("tv-set-co-contact-name", s.company.contactName);
    setVal("tv-set-co-contact-email", s.company.contactEmail);
    setVal("tv-set-co-contact-phone", s.company.contactPhone);
    setVal("tv-set-bl-legal", s.billing.legalName);
    setVal("tv-set-bl-rut", s.billing.rut);
    setVal("tv-set-bl-address", s.billing.address);
    setVal("tv-set-bl-email", s.billing.email);
    setVal("tv-set-bl-country", s.billing.country);
    setVal("tv-set-bl-currency", s.billing.currency);
    setChk("tv-set-bl-receipts", s.billing.sendReceipts);
    setChk("tv-set-bl-invoices", s.billing.sendInvoices);
    setChk("tv-set-bl-pending", s.billing.notifyPending);
    setChk("tv-set-bl-credited", s.billing.notifyCredited);
    setChk("tv-set-n-purchase-started", s.notifications.purchaseStarted);
    setChk("tv-set-n-payment-approved", s.notifications.paymentApproved);
    setChk("tv-set-n-balance-credited", s.notifications.balanceCredited);
    setChk("tv-set-n-payment-rejected", s.notifications.paymentRejected);
    setChk("tv-set-n-low-balance", s.notifications.lowBalance);
    setChk("tv-set-n-campaign-done", s.notifications.campaignFinished);
    setChk("tv-set-n-mass-error", s.notifications.massDeliveryError);
    setChk("tv-set-n-dlr-reports", s.notifications.dlrReports);
    setChk("tv-set-n-api-regen", s.notifications.apiKeyRegenerated);
    setChk("tv-set-n-webhook-err", s.notifications.webhookErrors);
    setChk("tv-set-n-rate-limit", s.notifications.rateLimit);
    setChk("tv-set-n-ticket-msg", s.notifications.ticketNewMessage);
    setChk("tv-set-n-ticket-resolved", s.notifications.ticketResolved);
    setChk("tv-set-n-ticket-waiting", s.notifications.ticketWaiting);
    setVal("tv-set-n-threshold", String(s.notifications.lowBalanceThreshold || ""));
    setVal("tv-set-p-language", s.preferences.language);
    setVal("tv-set-p-timezone", s.preferences.timezone);
    setVal("tv-set-p-datefmt", s.preferences.dateFormat);
    setVal("tv-set-p-home", s.preferences.homePage);
    setVal("tv-set-p-tickets", s.preferences.ticketView);
    setVal("tv-set-p-quickhelp", s.preferences.showQuickHelp ? "1" : "0");
    setVal("tv-set-p-sender", s.preferences.defaultSender);
    setVal("tv-set-p-sms-country", s.preferences.defaultCountry);
    setVal("tv-set-p-phone-fmt", s.preferences.phoneFormat);
    setChk("tv-set-p-warn-sms", s.preferences.warnMultiSms);
    setChk("tv-set-p-confirm-mass", s.preferences.confirmMassSend);
    activateTab(s.activeTab || "empresa");
  }

  function activateTab(tabId) {
    document.querySelectorAll("[data-tv-settings-tab]").forEach(function (p) {
      p.setAttribute("data-active", p.getAttribute("data-tv-settings-tab") === tabId ? "true" : "false");
    });
    document.querySelectorAll(".tv-tabs [data-tv-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-tv-tab") === tabId;
      btn.classList.toggle("tv-tab--active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function validate(s) {
    var errEl = document.getElementById("tv-set-n-threshold-err");
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    var emailRe = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    if (s.company.contactEmail && !emailRe.test(s.company.contactEmail)) {
      showToast("El email de contacto no tiene un formato válido.", true);
      activateTab("empresa");
      return false;
    }
    if (s.billing.email && !emailRe.test(s.billing.email)) {
      showToast("El email de facturación no tiene un formato válido.", true);
      activateTab("facturacion");
      return false;
    }
    if (s.company.website) {
      try {
        var u = new URL(s.company.website.indexOf("://") === -1 ? "https://" + s.company.website : s.company.website);
        if (!u.protocol.startsWith("http")) throw new Error();
      } catch (e) {
        showToast("El sitio web no tiene un formato válido.", true);
        activateTab("empresa");
        return false;
      }
    }
    var th = s.notifications.lowBalanceThreshold;
    if (th && (isNaN(th) || th < 1)) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = "Ingresa un número positivo.";
      }
      showToast("El umbral de saldo bajo debe ser un número positivo.", true);
      activateTab("notificaciones");
      return false;
    }
    return true;
  }

  document.querySelectorAll(".tv-tabs [data-tv-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activateTab(btn.getAttribute("data-tv-tab"));
    });
  });

  document.getElementById("tv-settings-save")?.addEventListener("click", function () {
    var s = collectSettings();
    if (!validate(s)) return;

    function finishSave(saved, source) {
      lastSaved = deepClone(saved);
      applySettings(saved);
      syncSource = source;
      updateSyncHint();
    }

    if (DB_AVAILABLE) {
      postJson(s).then(function (r) {
        if (r.ok && r.body && r.body.ok) {
          var saved = r.body.settings || s;
          saveLocal(saved);
          finishSave(saved, "supabase");
          showToast("Configuración guardada correctamente.");
          return;
        }
        saveLocal(s);
        finishSave(s, "local");
        showToast(
          "Configuración guardada localmente. Se sincronizará cuando la conexión esté disponible.",
        );
      }).catch(function () {
        saveLocal(s);
        finishSave(s, "local");
        showToast(
          "Configuración guardada localmente. Se sincronizará cuando la conexión esté disponible.",
        );
      });
      return;
    }

    try {
      saveLocal(s);
      finishSave(s, "local");
      showToast("Configuración guardada correctamente.");
    } catch (e) {
      showToast("No se pudo guardar la configuración.", true);
    }
  });

  document.getElementById("tv-settings-restore")?.addEventListener("click", function () {
    if (lastSaved) {
      applySettings(deepClone(lastSaved));
      showToast("Se restauraron los últimos cambios guardados.");
    } else {
      applySettings(deepClone(SERVER_SETTINGS));
      showToast("Se restauró la configuración predeterminada.");
    }
  });

  document.querySelectorAll("[data-tv-settings-soon]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showToast("Esta función estará disponible próximamente.");
    });
  });

  document.querySelectorAll("[data-tv-settings-request]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.getElementById("tv-settings-request-modal")?.setAttribute("aria-hidden", "false");
    });
  });

  document.querySelectorAll("[data-tv-settings-modal-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      document.getElementById("tv-settings-request-modal")?.setAttribute("aria-hidden", "true");
    });
  });

  var initial = loadSettings();
  lastSaved = deepClone(initial);
  applySettings(initial);
})();
</script>`;
}

export function renderAppSettingsPage(
  ctx: AppPageContext,
  pageData?: AppSettingsPageData,
): string {
  const defaults = buildDefaultClientSettings(ctx);
  const data: AppSettingsPageData = pageData ?? {
    module: { available: false, migrationPending: false },
    settings: defaults,
    syncSource: "defaults",
    hasStoredRecord: false,
  };
  const tabs = renderTabs(
    [...SETTINGS_TABS],
    data.settings.activeTab || "empresa",
    "settings",
  );

  const body = `
    ${settingsPageStyles()}
    <div class="tv-settings-page">
    ${renderPageHeader({
      title: "Configuración",
      subtitle:
        "Administra los datos de tu empresa, facturación, seguridad, notificaciones y preferencias de uso del panel Telvoice.",
      subtitleHtml:
        'Administra los datos de tu empresa, facturación, seguridad, notificaciones y preferencias de uso del panel Telvoice. <span id="tv-settings-sync-hint" class="field-hint" style="display:block;margin-top:0.35rem"></span>',
      actions: `
        <button type="button" class="btn btn-primary" id="tv-settings-save">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">save</span>
          Guardar cambios
        </button>
        <button type="button" class="btn btn-secondary" id="tv-settings-restore">Restaurar</button>
      `,
    })}
    <div class="tv-settings-layout">
      <div class="tv-settings-main">
        ${tabs}
        <div id="tv-settings-panels">
          ${renderEmpresaTab()}
          ${renderFacturacionTab()}
          ${renderSeguridadTab(ctx)}
          ${renderNotificacionesTab()}
          ${renderPreferenciasTab()}
        </div>
      </div>
      ${renderAccountAside(ctx)}
    </div>
    </div>
    <div class="tv-settings-modal" id="tv-settings-request-modal" role="dialog" aria-modal="true" aria-hidden="true">
      <div class="tv-settings-modal__backdrop" data-tv-settings-modal-close tabindex="-1"></div>
      <div class="tv-settings-modal__panel">
        <h2 class="tv-section-head__title" style="margin:0 0 0.5rem">Solicitud registrada</h2>
        <p class="tv-page-sub" style="margin:0 0 1rem">Tu solicitud será revisada por el equipo Telvoice.</p>
        <button type="button" class="btn btn-primary btn-sm" data-tv-settings-modal-close>Entendido</button>
      </div>
    </div>
    <div class="tv-settings-toast" id="tv-settings-toast" role="status" aria-live="polite" aria-hidden="true"></div>
    ${renderSettingsScript(ctx.company.id || "default", data)}`;

  return wrapAppPage(ctx, "settings", "Configuración", body);
}
