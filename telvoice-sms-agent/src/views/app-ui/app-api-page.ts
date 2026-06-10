import {
  buildDefaultClientApiSettings,
  DEFAULT_DEMO_API_KEY,
} from "../../services/clientApiSettingsService.js";
import type {
  AppApiPageData,
  ClientApiCredentials,
  ClientApiSettings,
  ClientApiWebhookConfig,
} from "../../types/client-api-settings.js";
import type {
  ClientApiKey,
  ClientApiKeyEnvironment,
  ClientApiKeyScope,
  ClientApiKeyStatus,
} from "../../types/client-api-keys.js";
import { CLIENT_API_KEY_SCOPES } from "../../types/client-api-keys.js";
import type { ClientApiRequest } from "../../types/client-api-requests.js";
import { canOperateClientPanel } from "../../types/roles.js";
import { escapeHtml, formatDateShort } from "../../utils/html.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";

export const DEFAULT_MOCK_API_KEY = DEFAULT_DEMO_API_KEY;
export type { ClientApiCredentials, ClientApiWebhookConfig };

function statusBadgeClass(status: string): string {
  if (status === "Activa" || status === "Activo") return "badge-ok";
  if (status === "Error" || status === "Pausada") return "badge-warn";
  return "badge-muted";
}

function settingsToCredentials(s: ClientApiSettings): ClientApiCredentials {
  return {
    apiKey: s.apiKeyDemo,
    environment: "production",
    status: "active",
    createdAt: s.createdAt,
    lastUsedLabel: s.lastUsedLabel,
  };
}

function settingsToWebhook(s: ClientApiSettings): ClientApiWebhookConfig {
  return {
    url: s.webhookUrl,
    active: s.webhookStatus === "Activo",
    events: { ...s.webhookEvents },
  };
}

function apiPageStyles(): string {
  return `<style>
    .tv-app-client.tv-app-client--api .tv-content {
      width: 100%;
      max-width: 100%;
    }
    .tv-app-client .tv-api-page {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    .tv-api-page .tv-api-layout {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
      max-width: 100%;
    }
    .tv-api-page .tv-api-main { display: flex; flex-direction: column; gap: 1.25rem; min-width: 0; width: 100%; }
    .tv-api-key-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    .tv-api-key-row code {
      font-size: 0.88rem;
      padding: 0.35rem 0.5rem;
      background: var(--tv-bg);
      border-radius: 6px;
      word-break: break-all;
    }
    .tv-api-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.85rem 1rem;
      margin-top: 1rem;
    }
    .tv-api-meta-grid dt {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--tv-muted);
      margin: 0;
    }
    .tv-api-meta-grid dd {
      margin: 0.2rem 0 0;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .tv-api-webhook-events {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.35rem;
    }
    .tv-api-webhook-events label {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.82rem;
      cursor: pointer;
    }
    .tv-api-smpp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.65rem 1rem;
      margin: 0.75rem 0 1rem;
      font-size: 0.88rem;
    }
    .tv-api-smpp-grid dt { color: var(--tv-muted); font-size: 0.75rem; margin: 0; }
    .tv-api-smpp-grid dd { margin: 0.15rem 0 0; font-weight: 600; }
    .tv-api-toast {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      left: 1.25rem;
      max-width: 360px;
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
    .tv-api-toast[aria-hidden="false"] { display: block; }
    .tv-api-toast--error { background: #7f1d1d; }
    .tv-api-modal {
      position: fixed;
      inset: 0;
      z-index: 250;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .tv-api-modal[aria-hidden="false"] { display: flex; }
    .tv-api-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }
    .tv-api-modal__panel {
      position: relative;
      width: min(420px, 100%);
      background: var(--tv-surface);
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow-lg);
      padding: 1.25rem;
    }
    .tv-api-keys-table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tv-api-keys-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .tv-api-keys-table th,
    .tv-api-keys-table td {
      padding: 0.65rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--tv-border);
      vertical-align: top;
    }
    .tv-api-keys-table th {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--tv-muted);
      font-weight: 600;
    }
    .tv-api-keys-table code {
      font-size: 0.8rem;
      word-break: break-all;
    }
    .tv-api-keys-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      justify-content: flex-end;
    }
    .tv-api-keys-scopes {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .tv-api-keys-scopes .badge {
      font-size: 0.72rem;
    }
    .tv-api-keys-empty {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--tv-muted);
    }
    .tv-api-keys-create-scopes {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin-top: 0.35rem;
    }
    .tv-api-keys-create-scopes label {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .tv-api-key-reveal {
      margin: 1rem 0;
      padding: 0.75rem;
      background: var(--tv-bg);
      border-radius: 6px;
      word-break: break-all;
      font-family: ui-monospace, monospace;
      font-size: 0.82rem;
    }
  </style>`;
}

function apiKeyStatusLabel(status: ClientApiKeyStatus): string {
  const map: Record<ClientApiKeyStatus, string> = {
    active: "Activa",
    paused: "Pausada",
    revoked: "Revocada",
    expired: "Expirada",
  };
  return map[status] ?? status;
}

function apiKeyStatusBadgeClass(status: ClientApiKeyStatus): string {
  if (status === "active") return "badge-ok";
  if (status === "paused") return "badge-warn";
  if (status === "revoked" || status === "expired") return "badge-muted";
  return "badge-muted";
}

function apiKeyEnvironmentLabel(env: ClientApiKeyEnvironment): string {
  return env === "production" ? "Producción" : "Sandbox";
}

function productionApprovalClientBadges(k: ClientApiKey): string {
  if (k.environment !== "production") {
    return "";
  }
  const approval = k.productionApproved
    ? '<span class="badge badge-ok">Producción aprobada</span>'
    : '<span class="badge badge-warn">Producción pendiente de aprobación</span>';
  const sendNote =
    '<span class="badge badge-muted" title="Envío SMS productivo no activo">Producción no habilitada para envío real</span>';
  return `<div style="display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.25rem">${approval} ${sendNote}</div>`;
}

function renderKeyScopesBadges(scopes: ClientApiKeyScope[]): string {
  if (!scopes.length) {
    return '<span class="badge badge-muted">—</span>';
  }
  return scopes
    .map((s) => `<span class="badge badge-muted">${escapeHtml(s)}</span>`)
    .join("");
}

function renderRealApiKeysPanel(ctx: AppPageContext, data: AppApiPageData): string {
  const canWrite = canOperateClientPanel(ctx.profile.role);
  const keysModule = data.keysModule ?? { available: false, migrationPending: false };
  const keys = data.keys ?? [];
  const pepperOk = data.pepperConfigured === true;

  let bodyInner = "";
  if (!keysModule.available) {
    bodyInner = `<div class="alert alert-warn" role="status">
      Backend de API Keys no disponible${keysModule.migrationPending ? " (migración pendiente)" : ""}.
    </div>`;
  } else if (!pepperOk) {
    bodyInner = `<div class="alert alert-warn" role="status">
      No se pueden crear API Keys: falta configurar <code>API_KEY_PEPPER</code> en el servidor.
    </div>`;
  }

  const rows =
    keys.length === 0
      ? `<tr><td colspan="8" class="tv-api-keys-empty">Aún no tienes API Keys. Crea una para futuras integraciones.</td></tr>`
      : keys
          .map((k) => {
            const isRevoked = k.status === "revoked";
            const isActive = k.status === "active";
            const isPaused = k.status === "paused";
            const prodBadge = productionApprovalClientBadges(k);
            const lastUsed = k.lastUsedAt
              ? escapeHtml(formatDateShort(k.lastUsedAt))
              : "—";
            const created = escapeHtml(formatDateShort(k.createdAt));
            const actions = canWrite
              ? `<div class="tv-api-keys-actions" data-key-id="${escapeHtml(k.id)}">
              ${
                isActive
                  ? `<button type="button" class="btn btn-ghost btn-sm" data-key-action="pause">Pausar</button>`
                  : ""
              }
              ${
                isPaused
                  ? `<button type="button" class="btn btn-ghost btn-sm" data-key-action="activate">Activar</button>`
                  : ""
              }
              ${
                !isRevoked
                  ? `<button type="button" class="btn btn-ghost btn-sm" data-key-action="scopes">Scopes</button>
              <button type="button" class="btn btn-ghost btn-sm" data-key-action="name">Nombre</button>
              <button type="button" class="btn btn-ghost btn-sm" data-key-action="revoke">Revocar</button>`
                  : ""
              }
            </div>`
              : "—";
            return `<tr data-key-row="${escapeHtml(k.id)}">
            <td><strong>${escapeHtml(k.name)}</strong></td>
            <td>${escapeHtml(apiKeyEnvironmentLabel(k.environment))}${prodBadge}</td>
            <td><code>${escapeHtml(k.keyMasked)}</code></td>
            <td><span class="badge ${apiKeyStatusBadgeClass(k.status)}">${escapeHtml(apiKeyStatusLabel(k.status))}</span></td>
            <td><div class="tv-api-keys-scopes">${renderKeyScopesBadges(k.scopes)}</div></td>
            <td>${lastUsed}</td>
            <td>${created}</td>
            <td>${actions}</td>
          </tr>`;
          })
          .join("");

  const createBtn = canWrite
    ? `<button type="button" class="btn btn-primary btn-sm" id="tv-api-keys-create-btn"${
        !keysModule.available || !pepperOk ? " disabled" : ""
      }>Crear API Key</button>`
    : "";

  return `<section class="tv-panel" id="tv-api-keys-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0;display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:0.75rem">
      <div>
        <h2 class="tv-section-head__title">API Keys</h2>
        <p class="tv-section-head__sub">Crea y administra claves de acceso para futuras integraciones API de Telvoice.</p>
      </div>
      ${createBtn}
    </header>
    <div class="tv-panel__body">
      <div class="alert alert-warn" role="status" style="margin-bottom:1rem">
        Estas claves son reales para autenticación futura, pero el envío SMS por API aún no está habilitado.
      </div>
      <p class="field-hint" style="margin:0 0 1rem">
        Aunque una key de producción esté aprobada, el envío SMS productivo será habilitado en una fase posterior por Telvoice.
      </p>
      ${bodyInner}
      <div class="tv-api-keys-table-wrap">
        <table class="tv-api-keys-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Ambiente</th>
              <th>Key</th>
              <th>Estado</th>
              <th>Scopes</th>
              <th>Último uso</th>
              <th>Creada</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="tv-api-keys-tbody">${rows}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}

function requestResultLabel(log: ClientApiRequest): string {
  return log.success ? "Éxito" : "Error";
}

function requestResultBadgeClass(log: ClientApiRequest): string {
  return log.success ? "badge-ok" : "badge-warn";
}

function requestKeyLabel(log: ClientApiRequest): string {
  if (log.apiKeyName?.trim()) {
    return log.apiKeyName.trim();
  }
  if (log.apiKeyMasked?.trim()) {
    return log.apiKeyMasked.trim();
  }
  return "—";
}

function renderRecentApiActivityPanel(data: AppApiPageData): string {
  const module = data.requestsModule ?? { available: false, migrationPending: false };
  const logs = data.recentApiRequests ?? [];

  if (!module.available) {
    return `<section class="tv-panel" id="tv-api-activity-panel">
      <header class="tv-section-head" style="padding:1rem 1.25rem 0">
        <h2 class="tv-section-head__title">Actividad reciente de API</h2>
        <p class="tv-section-head__sub">Últimas solicitudes realizadas con tus API Keys.</p>
      </header>
      <div class="tv-panel__body">
        <div class="alert alert-warn" role="status">Registro de actividad API no disponible${module.migrationPending ? " (migración pendiente)" : ""}.</div>
      </div>
    </section>`;
  }

  const rows =
    logs.length === 0
      ? `<tr><td colspan="7" class="tv-api-keys-empty">Aún no hay actividad registrada para tus API Keys.</td></tr>`
      : logs
          .map((log) => {
            const err = log.errorCode
              ? `<span class="badge badge-muted">${escapeHtml(log.errorCode)}</span>`
              : "—";
            return `<tr>
            <td>${escapeHtml(formatDateShort(log.createdAt))}</td>
            <td><code>${escapeHtml(log.endpoint)}</code></td>
            <td>${escapeHtml(log.method)}</td>
            <td>${log.statusCode}</td>
            <td><span class="badge ${requestResultBadgeClass(log)}">${escapeHtml(requestResultLabel(log))}</span></td>
            <td>${escapeHtml(requestKeyLabel(log))}</td>
            <td>${err}</td>
          </tr>`;
          })
          .join("");

  return `<section class="tv-panel" id="tv-api-activity-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Actividad reciente de API</h2>
      <p class="tv-section-head__sub">Últimas solicitudes realizadas con tus API Keys.</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-api-keys-table-wrap">
        <table class="tv-api-keys-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Endpoint</th>
              <th>Método</th>
              <th>HTTP</th>
              <th>Resultado</th>
              <th>API Key</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}

function renderKeysModals(): string {
  const scopeChecks = CLIENT_API_KEY_SCOPES.map(
    (s) =>
      `<label><input type="checkbox" name="scope" value="${escapeHtml(s)}"${
        s === "balance:read" ? " checked" : ""
      } /> ${escapeHtml(s)}</label>`,
  ).join("");

  return `
    <div class="tv-api-modal" id="tv-api-keys-create-modal" role="dialog" aria-modal="true" aria-labelledby="tv-api-keys-create-title" aria-hidden="true">
      <div class="tv-api-modal__backdrop" data-tv-keys-modal-close tabindex="-1"></div>
      <div class="tv-api-modal__panel">
        <h2 class="tv-section-head__title" id="tv-api-keys-create-title" style="margin:0 0 0.75rem">Crear API Key</h2>
        <div class="form-group">
          <label for="tv-api-keys-create-name">Nombre</label>
          <input type="text" id="tv-api-keys-create-name" class="tv-input-full" maxlength="120" placeholder="Ej. Backend producción" autocomplete="off" />
        </div>
        <div class="form-group">
          <label for="tv-api-keys-create-env">Ambiente</label>
          <select id="tv-api-keys-create-env" class="tv-input-full">
            <option value="sandbox">Sandbox</option>
            <option value="production">Producción</option>
          </select>
          <p class="field-hint" id="tv-api-keys-create-env-hint" style="display:none;margin-top:0.35rem">
            Producción — requiere aprobación antes de uso real.
          </p>
        </div>
        <div class="form-group">
          <span class="field-hint">Scopes</span>
          <div class="tv-api-keys-create-scopes" id="tv-api-keys-create-scopes">${scopeChecks}</div>
        </div>
        <div class="form-group">
          <label for="tv-api-keys-create-expires">Expiración (opcional)</label>
          <input type="datetime-local" id="tv-api-keys-create-expires" class="tv-input-full" />
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap;margin-top:1rem">
          <button type="button" class="btn btn-ghost" data-tv-keys-modal-close>Cancelar</button>
          <button type="button" class="btn btn-primary" id="tv-api-keys-create-submit">Crear</button>
        </div>
      </div>
    </div>
    <div class="tv-api-modal" id="tv-api-keys-reveal-modal" role="dialog" aria-modal="true" aria-labelledby="tv-api-keys-reveal-title" aria-hidden="true">
      <div class="tv-api-modal__backdrop" data-tv-keys-reveal-close tabindex="-1"></div>
      <div class="tv-api-modal__panel">
        <h2 class="tv-section-head__title" id="tv-api-keys-reveal-title" style="margin:0 0 0.5rem">API Key creada</h2>
        <p class="tv-page-sub" style="margin:0 0 0.75rem">Copia esta API Key ahora. Por seguridad no volverás a verla completa.</p>
        <div class="tv-api-key-reveal" id="tv-api-keys-reveal-value"></div>
        <button type="button" class="btn btn-primary" id="tv-api-keys-reveal-copy">Copiar API Key</button>
        <button type="button" class="btn btn-ghost" style="margin-left:0.5rem" data-tv-keys-reveal-close>Cerrar</button>
      </div>
    </div>
    <div class="tv-api-modal" id="tv-api-keys-name-modal" role="dialog" aria-modal="true" aria-hidden="true">
      <div class="tv-api-modal__backdrop" data-tv-keys-modal-close tabindex="-1"></div>
      <div class="tv-api-modal__panel">
        <h2 class="tv-section-head__title" style="margin:0 0 0.75rem">Editar nombre</h2>
        <input type="hidden" id="tv-api-keys-name-id" />
        <div class="form-group">
          <label for="tv-api-keys-name-input">Nombre</label>
          <input type="text" id="tv-api-keys-name-input" class="tv-input-full" maxlength="120" />
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
          <button type="button" class="btn btn-ghost" data-tv-keys-modal-close>Cancelar</button>
          <button type="button" class="btn btn-primary" id="tv-api-keys-name-submit">Guardar</button>
        </div>
      </div>
    </div>
    <div class="tv-api-modal" id="tv-api-keys-scopes-modal" role="dialog" aria-modal="true" aria-hidden="true">
      <div class="tv-api-modal__backdrop" data-tv-keys-modal-close tabindex="-1"></div>
      <div class="tv-api-modal__panel">
        <h2 class="tv-section-head__title" style="margin:0 0 0.75rem">Editar scopes</h2>
        <input type="hidden" id="tv-api-keys-scopes-id" />
        <div class="tv-api-keys-create-scopes" id="tv-api-keys-scopes-edit">${scopeChecks}</div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
          <button type="button" class="btn btn-ghost" data-tv-keys-modal-close>Cancelar</button>
          <button type="button" class="btn btn-primary" id="tv-api-keys-scopes-submit">Guardar</button>
        </div>
      </div>
    </div>
    <div class="tv-api-modal" id="tv-api-keys-revoke-modal" role="dialog" aria-modal="true" aria-hidden="true">
      <div class="tv-api-modal__backdrop" data-tv-keys-modal-close tabindex="-1"></div>
      <div class="tv-api-modal__panel">
        <h2 class="tv-section-head__title" style="margin:0 0 0.5rem">Revocar API Key</h2>
        <p class="tv-page-sub" style="margin:0 0 0.75rem">Esta acción no se puede deshacer. La key dejará de funcionar cuando la API esté habilitada.</p>
        <input type="hidden" id="tv-api-keys-revoke-id" />
        <div class="form-group">
          <label for="tv-api-keys-revoke-reason">Motivo (opcional)</label>
          <input type="text" id="tv-api-keys-revoke-reason" class="tv-input-full" placeholder="Ej. Rotación de credenciales" />
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
          <button type="button" class="btn btn-ghost" data-tv-keys-modal-close>Cancelar</button>
          <button type="button" class="btn btn-primary" id="tv-api-keys-revoke-submit">Revocar</button>
        </div>
      </div>
    </div>`;
}

function renderRealApiKeysScript(data: AppApiPageData): string {
  const keysJson = JSON.stringify(data.keys ?? []).replace(/</g, "\\u003c");
  const keysModuleJson = JSON.stringify(
    data.keysModule ?? { available: false, migrationPending: false },
  ).replace(/</g, "\\u003c");
  const pepperOk = data.pepperConfigured === true;

  return `<script>
(function () {
  var KEYS = ${keysJson};
  var KEYS_MODULE = ${keysModuleJson};
  var PEPPER_OK = ${pepperOk ? "true" : "false"};
  var revealPlainKey = null;

  function keysToast(msg, isError) {
    var t = document.getElementById("tv-api-toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "tv-api-toast" + (isError ? " tv-api-toast--error" : "");
    t.setAttribute("aria-hidden", "false");
    clearTimeout(keysToast._t);
    keysToast._t = setTimeout(function () {
      t.setAttribute("aria-hidden", "true");
    }, 4200);
  }

  function keysPost(url, payload) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    });
  }

  function closeKeysModals() {
    ["tv-api-keys-create-modal", "tv-api-keys-name-modal", "tv-api-keys-scopes-modal", "tv-api-keys-revoke-modal"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.setAttribute("aria-hidden", "true");
    });
  }

  function closeRevealModal() {
    var hadKey = !!revealPlainKey;
    revealPlainKey = null;
    var el = document.getElementById("tv-api-keys-reveal-value");
    if (el) el.textContent = "";
    document.getElementById("tv-api-keys-reveal-modal")?.setAttribute("aria-hidden", "true");
    if (hadKey) window.location.reload();
  }

  function readCreateScopes() {
    var list = [];
    document.querySelectorAll("#tv-api-keys-create-scopes input[name=scope]:checked").forEach(function (cb) {
      var v = cb.getAttribute("value");
      if (v) list.push(v);
    });
    return list;
  }

  function readEditScopes() {
    var list = [];
    document.querySelectorAll("#tv-api-keys-scopes-edit input[name=scope]:checked").forEach(function (cb) {
      var v = cb.getAttribute("value");
      if (v) list.push(v);
    });
    return list;
  }

  document.getElementById("tv-api-keys-create-env")?.addEventListener("change", function (e) {
    var hint = document.getElementById("tv-api-keys-create-env-hint");
    if (hint) hint.style.display = e.target.value === "production" ? "block" : "none";
  });

  document.getElementById("tv-api-keys-create-btn")?.addEventListener("click", function () {
    if (!KEYS_MODULE.available || !PEPPER_OK) {
      keysToast("No se pueden crear API Keys en este momento.", true);
      return;
    }
    document.getElementById("tv-api-keys-create-name").value = "";
    document.getElementById("tv-api-keys-create-env").value = "sandbox";
    document.getElementById("tv-api-keys-create-expires").value = "";
    document.getElementById("tv-api-keys-create-env-hint").style.display = "none";
    document.querySelectorAll("#tv-api-keys-create-scopes input[name=scope]").forEach(function (cb) {
      cb.checked = cb.getAttribute("value") === "balance:read";
    });
    document.getElementById("tv-api-keys-create-modal")?.setAttribute("aria-hidden", "false");
  });

  document.getElementById("tv-api-keys-create-submit")?.addEventListener("click", function () {
    var name = (document.getElementById("tv-api-keys-create-name")?.value || "").trim();
    var environment = document.getElementById("tv-api-keys-create-env")?.value || "sandbox";
    var scopes = readCreateScopes();
    var expiresRaw = document.getElementById("tv-api-keys-create-expires")?.value || "";
    var payload = { name: name, environment: environment, scopes: scopes };
    if (expiresRaw) {
      try {
        payload.expiresAt = new Date(expiresRaw).toISOString();
      } catch (e) {}
    }
    keysPost("/app/api/keys", payload).then(function (r) {
      if (r.ok && r.body && r.body.ok && r.body.plainTextKey) {
        closeKeysModals();
        revealPlainKey = r.body.plainTextKey;
        var revealEl = document.getElementById("tv-api-keys-reveal-value");
        if (revealEl) revealEl.textContent = revealPlainKey;
        document.getElementById("tv-api-keys-reveal-modal")?.setAttribute("aria-hidden", "false");
        keysToast("API Key creada.");
      } else {
        keysToast((r.body && r.body.error) || "No se pudo crear la API Key.", true);
      }
    }).catch(function () {
      keysToast("Error de red al crear la API Key.", true);
    });
  });

  document.getElementById("tv-api-keys-reveal-copy")?.addEventListener("click", function () {
    if (!revealPlainKey) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(revealPlainKey).then(function () {
        keysToast("API Key copiada.");
      });
    }
  });

  document.querySelectorAll("[data-tv-keys-reveal-close]").forEach(function (el) {
    el.addEventListener("click", closeRevealModal);
  });

  document.querySelectorAll("[data-tv-keys-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeKeysModals);
  });

  document.getElementById("tv-api-keys-tbody")?.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-key-action]");
    if (!btn) return;
    var wrap = btn.closest("[data-key-id]");
    var keyId = wrap && wrap.getAttribute("data-key-id");
    if (!keyId) return;
    var action = btn.getAttribute("data-key-action");
    var key = KEYS.find(function (k) { return k.id === keyId; });
    if (action === "pause") {
      keysPost("/app/api/keys/" + keyId + "/pause", {}).then(function (r) {
        if (r.ok && r.body && r.body.ok) {
          keysToast("API Key pausada.");
          window.location.reload();
        } else {
          keysToast((r.body && r.body.error) || "No se pudo pausar.", true);
        }
      });
    } else if (action === "activate") {
      keysPost("/app/api/keys/" + keyId + "/activate", {}).then(function (r) {
        if (r.ok && r.body && r.body.ok) {
          keysToast("API Key activada.");
          window.location.reload();
        } else {
          keysToast((r.body && r.body.error) || "No se pudo activar.", true);
        }
      });
    } else if (action === "revoke") {
      document.getElementById("tv-api-keys-revoke-id").value = keyId;
      document.getElementById("tv-api-keys-revoke-reason").value = "";
      document.getElementById("tv-api-keys-revoke-modal")?.setAttribute("aria-hidden", "false");
    } else if (action === "name") {
      document.getElementById("tv-api-keys-name-id").value = keyId;
      document.getElementById("tv-api-keys-name-input").value = key ? key.name : "";
      document.getElementById("tv-api-keys-name-modal")?.setAttribute("aria-hidden", "false");
    } else if (action === "scopes") {
      document.getElementById("tv-api-keys-scopes-id").value = keyId;
      var scopes = (key && key.scopes) || [];
      document.querySelectorAll("#tv-api-keys-scopes-edit input[name=scope]").forEach(function (cb) {
        var v = cb.getAttribute("value");
        cb.checked = scopes.indexOf(v) >= 0;
      });
      document.getElementById("tv-api-keys-scopes-modal")?.setAttribute("aria-hidden", "false");
    }
  });

  document.getElementById("tv-api-keys-revoke-submit")?.addEventListener("click", function () {
    var keyId = document.getElementById("tv-api-keys-revoke-id")?.value;
    var reason = document.getElementById("tv-api-keys-revoke-reason")?.value || "";
    if (!keyId) return;
    keysPost("/app/api/keys/" + keyId + "/revoke", { reason: reason }).then(function (r) {
      if (r.ok && r.body && r.body.ok) {
        closeKeysModals();
        keysToast("API Key revocada.");
        window.location.reload();
      } else {
        keysToast((r.body && r.body.error) || "No se pudo revocar.", true);
      }
    });
  });

  document.getElementById("tv-api-keys-name-submit")?.addEventListener("click", function () {
    var keyId = document.getElementById("tv-api-keys-name-id")?.value;
    var name = (document.getElementById("tv-api-keys-name-input")?.value || "").trim();
    if (!keyId) return;
    keysPost("/app/api/keys/" + keyId + "/name", { name: name }).then(function (r) {
      if (r.ok && r.body && r.body.ok) {
        closeKeysModals();
        keysToast("Nombre actualizado.");
        window.location.reload();
      } else {
        keysToast((r.body && r.body.error) || "No se pudo actualizar.", true);
      }
    });
  });

  document.getElementById("tv-api-keys-scopes-submit")?.addEventListener("click", function () {
    var keyId = document.getElementById("tv-api-keys-scopes-id")?.value;
    if (!keyId) return;
    keysPost("/app/api/keys/" + keyId + "/scopes", { scopes: readEditScopes() }).then(function (r) {
      if (r.ok && r.body && r.body.ok) {
        closeKeysModals();
        keysToast("Scopes actualizados.");
        window.location.reload();
      } else {
        keysToast((r.body && r.body.error) || "No se pudieron actualizar los scopes.", true);
      }
    });
  });
})();
</script>`;
}

function renderCredentialsPanel(
  ctx: AppPageContext,
  settings: ClientApiSettings,
): string {
  const companyLabel = ctx.company.name?.trim() || "Tu empresa";
  const companyId = ctx.company.id?.trim() || "—";
  const creds = settingsToCredentials(settings);
  const statusCls = statusBadgeClass(settings.apiStatus);

  return `<section class="tv-panel" id="tv-api-credentials-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Credenciales de acceso</h2>
      <p class="tv-section-head__sub">Clave de demostración para integración visual. No autentica envíos SMS reales.</p>
    </header>
    <div class="tv-panel__body">
      <div class="alert alert-warn" role="status" style="margin-bottom:1rem">
        Clave de demostración. La activación de API productiva será habilitada por Telvoice.
      </div>
      <div class="tv-api-key-row">
        <span class="field-hint" style="margin:0">API Key (demo)</span>
        <code id="tv-api-key-display">${escapeHtml(creds.apiKey)}</code>
        <button type="button" class="btn btn-secondary btn-sm" id="tv-api-copy-key-btn">
          <span class="material-symbols-outlined" style="font-size:1rem" aria-hidden="true">content_copy</span>
          Copiar API Key
        </button>
        <button type="button" class="btn btn-ghost btn-sm" id="tv-api-regen-key-btn">Regenerar API Key</button>
      </div>
      <p class="field-hint" style="margin:0.35rem 0 0">Vista enmascarada: <code id="tv-api-key-masked">${escapeHtml(settings.apiKeyMasked)}</code></p>
      <dl class="tv-api-meta-grid">
        <div><dt>Ambiente</dt><dd id="tv-api-environment">${escapeHtml(settings.environment)}</dd></div>
        <div><dt>Estado</dt><dd><span class="badge ${statusCls}" id="tv-api-status-badge">${escapeHtml(settings.apiStatus)}</span></dd></div>
        <div><dt>Empresa</dt><dd>${escapeHtml(companyLabel)}</dd></div>
        <div><dt>Company ID</dt><dd><code class="tv-code-sm">${escapeHtml(companyId)}</code></dd></div>
        <div><dt>Creada</dt><dd id="tv-api-created-at">${escapeHtml(formatDateShort(creds.createdAt))}</dd></div>
        <div><dt>Último uso</dt><dd id="tv-api-last-used">${escapeHtml(creds.lastUsedLabel)}</dd></div>
      </dl>
    </div>
  </section>`;
}

function renderWebhookPanel(): string {
  return `<section class="tv-panel" id="tv-api-webhook-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Webhook de reportes de entrega</h2>
      <p class="tv-section-head__sub">Recibe DLR en tu servidor cuando el mensaje cambie de estado.</p>
    </header>
    <div class="tv-panel__body">
      <div class="form-group">
        <label for="tv-api-webhook-url">URL del webhook</label>
        <input type="url" id="tv-api-webhook-url" class="tv-input-full" placeholder="https://tusitio.cl/webhooks/telvoice" autocomplete="off" />
      </div>
      <p style="margin:0.75rem 0 0.35rem"><strong>Estado:</strong> <span id="tv-api-webhook-status" class="badge badge-muted">No configurado</span></p>
      <p class="field-hint" style="margin:0.5rem 0">Eventos</p>
      <div class="tv-api-webhook-events" id="tv-api-webhook-events">
        <label><input type="checkbox" name="evt" value="delivered" checked /> delivered</label>
        <label><input type="checkbox" name="evt" value="failed" checked /> failed</label>
        <label><input type="checkbox" name="evt" value="expired" checked /> expired</label>
        <label><input type="checkbox" name="evt" value="rejected" checked /> rejected</label>
      </div>
      <div class="tv-quick-actions" style="margin-top:1rem">
        <button type="button" class="btn btn-primary btn-sm" id="tv-api-webhook-save">Guardar webhook</button>
        <button type="button" class="btn btn-secondary btn-sm" id="tv-api-webhook-test">Enviar prueba</button>
      </div>
    </div>
  </section>`;
}

function renderSmppPanel(settings: ClientApiSettings): string {
  const smppBadge = settings.smppRequested
    ? '<span class="badge badge-ok" id="tv-api-smpp-status">Solicitud registrada</span>'
    : '<span class="badge badge-warn" id="tv-api-smpp-status">Bajo solicitud</span>';
  const btnLabel = settings.smppRequested
    ? "Solicitud enviada"
    : "Solicitar acceso SMPP";
  const btnDisabled = settings.smppRequested ? " disabled" : "";

  return `<section class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Integración SMPP</h2>
    </header>
    <div class="tv-panel__body">
      <p class="tv-page-sub" style="margin:0 0 0.75rem">
        Para clientes con alto volumen o integraciones telco avanzadas, Telvoice podrá habilitar acceso SMPP bajo evaluación comercial y técnica.
      </p>
      <dl class="tv-api-smpp-grid">
        <div><dt>Host</dt><dd>smpp.telvoice.cl</dd></div>
        <div><dt>Puerto</dt><dd>2775</dd></div>
        <div><dt>TLS</dt><dd>Disponible bajo solicitud</dd></div>
        <div><dt>Estado</dt><dd>${smppBadge}</dd></div>
      </dl>
      <button type="button" class="btn btn-secondary btn-sm" id="tv-api-smpp-request"${btnDisabled}>${escapeHtml(btnLabel)}</button>
    </div>
  </section>`;
}

function renderApiScript(ctx: AppPageContext, pageData: AppApiPageData): string {
  const companyId = escapeHtml(ctx.company.id || "default");
  const serverJson = JSON.stringify(pageData.settings).replace(/</g, "\\u003c");
  const credsJson = JSON.stringify(settingsToCredentials(pageData.settings)).replace(
    /</g,
    "\\u003c",
  );
  const webhookJson = JSON.stringify(settingsToWebhook(pageData.settings)).replace(
    /</g,
    "\\u003c",
  );
  const dbAvailable =
    pageData.module.available && companyId !== "default";
  const syncHint =
    pageData.syncSource === "supabase"
      ? "Configuración API sincronizada con tu empresa."
      : pageData.syncSource === "local"
        ? "Configuración API guardada localmente."
        : dbAvailable
          ? "Aún no has guardado configuración API en la nube."
          : "Los cambios se guardan en este navegador hasta conectar Supabase.";

  return `<script>
(function () {
  var CRED_KEY = "telvoice_client_api_credentials_${companyId}";
  var WEBHOOK_KEY = "telvoice_client_api_webhook_${companyId}";
  var SERVER_SETTINGS = ${serverJson};
  var DEFAULT_CRED = ${credsJson};
  var DEFAULT_WEBHOOK = ${webhookJson};
  var DB_AVAILABLE = ${dbAvailable ? "true" : "false"};
  var SERVER_HAS_RECORD = ${pageData.hasStoredRecord ? "true" : "false"};
  var SYNC_HINT = ${JSON.stringify(syncHint)};
  var syncSource = ${JSON.stringify(pageData.syncSource)};

  var toast = document.getElementById("tv-api-toast");
  var syncHintEl = document.getElementById("tv-api-sync-hint");
  var keyDisplay = document.getElementById("tv-api-key-display");
  var keyMasked = document.getElementById("tv-api-key-masked");
  var state = null;

  if (syncHintEl) syncHintEl.textContent = SYNC_HINT;

  function showToast(msg, isError) {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = "tv-api-toast" + (isError ? " tv-api-toast--error" : "");
    toast.setAttribute("aria-hidden", "false");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.setAttribute("aria-hidden", "true");
    }, 4200);
  }

  function copyText(text, okMsg) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(okMsg || "Copiado al portapapeles.");
      }).catch(function () { fallbackCopy(text, okMsg); });
    } else {
      fallbackCopy(text, okMsg);
    }
  }

  function fallbackCopy(text, okMsg) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast(okMsg || "Copiado al portapapeles.");
    } catch (e) {
      showToast("No se pudo copiar. Selecciona el texto manualmente.", true);
    }
    document.body.removeChild(ta);
  }

  function postJson(url, payload) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    });
  }

  function updateSyncHint() {
    if (!syncHintEl) return;
    if (syncSource === "supabase") {
      syncHintEl.textContent = "Configuración API sincronizada con tu empresa.";
    } else if (syncSource === "local") {
      syncHintEl.textContent = "Configuración API guardada localmente.";
    } else {
      syncHintEl.textContent = SYNC_HINT;
    }
  }

  function settingsToCred(s) {
    return {
      apiKey: s.apiKeyDemo,
      environment: "production",
      status: "active",
      createdAt: s.createdAt,
      lastUsedLabel: s.lastUsedLabel,
    };
  }

  function settingsToWebhookCfg(s) {
    return {
      url: s.webhookUrl || "",
      active: s.webhookStatus === "Activo",
      events: Object.assign({}, s.webhookEvents),
    };
  }

  function saveLocal(s) {
    try {
      localStorage.setItem(CRED_KEY, JSON.stringify(settingsToCred(s)));
      localStorage.setItem(WEBHOOK_KEY, JSON.stringify(settingsToWebhookCfg(s)));
    } catch (e) {}
  }

  function loadLocalSettings() {
    try {
      var credRaw = localStorage.getItem(CRED_KEY);
      var whRaw = localStorage.getItem(WEBHOOK_KEY);
      if (!credRaw && !whRaw) return null;
      var s = Object.assign({}, SERVER_SETTINGS);
      if (credRaw) {
        var c = JSON.parse(credRaw);
        if (c && c.apiKey) {
          s.apiKeyDemo = c.apiKey;
          s.createdAt = c.createdAt || s.createdAt;
          s.lastUsedLabel = c.lastUsedLabel || s.lastUsedLabel;
        }
      }
      if (whRaw) {
        var w = JSON.parse(whRaw);
        if (w) {
          s.webhookUrl = w.url || "";
          s.webhookStatus = w.active && w.url ? "Activo" : "No configurado";
          if (w.events) s.webhookEvents = Object.assign({}, s.webhookEvents, w.events);
        }
      }
      return s;
    } catch (e) {}
    return null;
  }

  function loadSettings() {
    if (DB_AVAILABLE && SERVER_HAS_RECORD) {
      syncSource = "supabase";
      return JSON.parse(JSON.stringify(SERVER_SETTINGS));
    }
    if (!DB_AVAILABLE) {
      var local = loadLocalSettings();
      if (local) {
        syncSource = "local";
        return local;
      }
    }
    return JSON.parse(JSON.stringify(SERVER_SETTINGS));
  }

  function saveCred(c) {
    if (!state) return;
    state.apiKeyDemo = c.apiKey;
    state.createdAt = c.createdAt;
    state.lastUsedLabel = c.lastUsedLabel;
    saveLocal(state);
  }

  function saveWebhook(w) {
    if (!state) return;
    state.webhookUrl = w.url || "";
    state.webhookStatus = w.active && w.url ? "Activo" : "No configurado";
    state.webhookEvents = Object.assign({}, w.events);
    saveLocal(state);
  }

  function applySettingsUI(s) {
    state = s;
    var c = settingsToCred(s);
    if (keyDisplay) keyDisplay.textContent = c.apiKey;
    if (keyMasked) keyMasked.textContent = s.apiKeyMasked || "";
    var created = document.getElementById("tv-api-created-at");
    var lastUsed = document.getElementById("tv-api-last-used");
    var envEl = document.getElementById("tv-api-environment");
    var statusBadge = document.getElementById("tv-api-status-badge");
    if (envEl) envEl.textContent = s.environment || "Producción";
    if (statusBadge) {
      statusBadge.textContent = s.apiStatus || "Activa";
      statusBadge.className = "badge " + (s.apiStatus === "Activa" ? "badge-ok" : "badge-warn");
    }
    if (created && c.createdAt) {
      try {
        created.textContent = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(c.createdAt));
      } catch (e) { created.textContent = c.createdAt; }
    }
    if (lastUsed) lastUsed.textContent = c.lastUsedLabel || "—";
    applyWebhookUI(settingsToWebhookCfg(s));
    var smppBtn = document.getElementById("tv-api-smpp-request");
    var smppStatus = document.getElementById("tv-api-smpp-status");
    if (s.smppRequested) {
      if (smppBtn) { smppBtn.disabled = true; smppBtn.textContent = "Solicitud enviada"; }
      if (smppStatus) {
        smppStatus.className = "badge badge-ok";
        smppStatus.textContent = "Solicitud registrada";
      }
    }
    updateSyncHint();
  }

  function applyCredUI(c) {
    if (!state) return;
    state.apiKeyDemo = c.apiKey;
    state.createdAt = c.createdAt;
    state.lastUsedLabel = c.lastUsedLabel;
    applySettingsUI(state);
  }

  function applyWebhookUI(w) {
    var urlInput = document.getElementById("tv-api-webhook-url");
    var statusEl = document.getElementById("tv-api-webhook-status");
    if (urlInput) urlInput.value = w.url || "";
    if (statusEl) {
      if (w.active && w.url) {
        statusEl.className = "badge badge-ok";
        statusEl.textContent = "Activo";
      } else if (state && state.webhookStatus === "Error") {
        statusEl.className = "badge badge-warn";
        statusEl.textContent = "Error";
      } else {
        statusEl.className = "badge badge-muted";
        statusEl.textContent = "No configurado";
      }
    }
    var boxes = document.querySelectorAll("#tv-api-webhook-events input[type=checkbox]");
    boxes.forEach(function (cb) {
      var v = cb.getAttribute("value");
      if (v && w.events) cb.checked = !!w.events[v];
    });
  }

  function readWebhookFromForm() {
    var w = settingsToWebhookCfg(state || SERVER_SETTINGS);
    var urlInput = document.getElementById("tv-api-webhook-url");
    w.url = (urlInput && urlInput.value || "").trim();
    w.events = w.events || {};
    document.querySelectorAll("#tv-api-webhook-events input[type=checkbox]").forEach(function (cb) {
      var v = cb.getAttribute("value");
      if (v) w.events[v] = cb.checked;
    });
    w.active = !!w.url;
    return w;
  }

  function readWebhookEventsArray(w) {
    var list = [];
    Object.keys(w.events || {}).forEach(function (k) {
      if (w.events[k]) list.push(k);
    });
    return list;
  }

  function isValidUrl(s) {
    try {
      var u = new URL(s);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch (e) { return false; }
  }

  applySettingsUI(loadSettings());

  document.getElementById("tv-api-copy-header")?.addEventListener("click", function () {
    copyText(state ? state.apiKeyDemo : "", "API Key copiada.");
  });
  document.getElementById("tv-api-copy-key-btn")?.addEventListener("click", function () {
    copyText(state ? state.apiKeyDemo : "", "API Key copiada.");
  });

  document.getElementById("tv-api-regen-key-btn")?.addEventListener("click", function () {
    var modal = document.getElementById("tv-api-regen-modal");
    if (modal) modal.setAttribute("aria-hidden", "false");
  });

  document.getElementById("tv-api-regen-confirm")?.addEventListener("click", function () {
    document.getElementById("tv-api-regen-modal")?.setAttribute("aria-hidden", "true");
    function doneLocal() {
      var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      var s = "tlv_live_";
      for (var i = 0; i < 20; i++) s += chars[Math.floor(Math.random() * chars.length)];
      var c = settingsToCred(state || SERVER_SETTINGS);
      c.apiKey = s;
      c.createdAt = new Date().toISOString();
      c.lastUsedLabel = "Recién generada";
      if (state) {
        state.apiKeyDemo = s;
        state.apiKeyMasked = "tlv_live_" + "•".repeat(12) + s.slice(-4);
        state.createdAt = c.createdAt;
        state.lastUsedLabel = c.lastUsedLabel;
      }
      saveLocal(state || SERVER_SETTINGS);
      applyCredUI(c);
      syncSource = "local";
      updateSyncHint();
      showToast("Clave demo guardada localmente. Se sincronizará cuando la conexión esté disponible.");
    }
    if (DB_AVAILABLE) {
      postJson("/app/api/key/regenerate", {}).then(function (r) {
        if (r.ok && r.body && r.body.ok && r.body.settings) {
          state = r.body.settings;
          saveLocal(state);
          applySettingsUI(state);
          syncSource = "supabase";
          updateSyncHint();
          showToast(r.body.message || "Clave de demostración regenerada.");
        } else {
          doneLocal();
        }
      }).catch(doneLocal);
    } else {
      doneLocal();
      showToast("Clave de demostración regenerada.");
    }
  });

  document.querySelectorAll("[data-tv-api-modal-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      document.getElementById("tv-api-regen-modal")?.setAttribute("aria-hidden", "true");
      document.getElementById("tv-api-smpp-modal")?.setAttribute("aria-hidden", "true");
    });
  });

  document.getElementById("tv-api-webhook-save")?.addEventListener("click", function () {
    var w = readWebhookFromForm();
    if (w.url && !isValidUrl(w.url)) {
      showToast("Ingresa una URL válida (http o https).", true);
      return;
    }
    function applySaved(settings) {
      if (settings) {
        state = settings;
        saveLocal(state);
        applySettingsUI(state);
      } else {
        saveWebhook(w);
        applyWebhookUI(w);
      }
    }
    if (DB_AVAILABLE) {
      postJson("/app/api/webhook", {
        webhookUrl: w.url,
        events: readWebhookEventsArray(w),
      }).then(function (r) {
        if (r.ok && r.body && r.body.ok) {
          applySaved(r.body.settings);
          syncSource = "supabase";
          updateSyncHint();
          showToast(w.url ? "Webhook guardado correctamente." : "Configuración guardada.");
        } else {
          saveWebhook(w);
          applyWebhookUI(w);
          syncSource = "local";
          updateSyncHint();
          showToast("Webhook guardado localmente. Se sincronizará cuando la conexión esté disponible.");
        }
      }).catch(function () {
        saveWebhook(w);
        applyWebhookUI(w);
        syncSource = "local";
        updateSyncHint();
        showToast("Webhook guardado localmente. Se sincronizará cuando la conexión esté disponible.");
      });
    } else {
      saveWebhook(w);
      applyWebhookUI(w);
      showToast(w.url ? "Webhook guardado correctamente." : "Configuración guardada.");
    }
  });

  document.getElementById("tv-api-webhook-test")?.addEventListener("click", function () {
    var w = readWebhookFromForm();
    if (!w.url || !isValidUrl(w.url)) {
      showToast("Debes ingresar una URL válida antes de enviar una prueba.", true);
      return;
    }
    function showTestOk(msg) {
      saveWebhook(w);
      applyWebhookUI(w);
      showToast(msg || "Prueba registrada correctamente. La entrega real de webhooks será habilitada por Telvoice.");
    }
    if (DB_AVAILABLE) {
      postJson("/app/api/webhook", {
        webhookUrl: w.url,
        events: readWebhookEventsArray(w),
      }).then(function () {
        return postJson("/app/api/webhook/test", {});
      }).then(function (r) {
        if (r.ok && r.body && r.body.ok) {
          if (r.body.settings) {
            state = r.body.settings;
            saveLocal(state);
            applySettingsUI(state);
          }
          syncSource = "supabase";
          updateSyncHint();
          showTestOk(r.body.message);
        } else {
          showTestOk();
        }
      }).catch(function () {
        showTestOk();
      });
    } else {
      showTestOk();
    }
  });

  document.getElementById("tv-api-smpp-request")?.addEventListener("click", function () {
    if (state && state.smppRequested) return;
    var modal = document.getElementById("tv-api-smpp-modal");
    if (modal) modal.setAttribute("aria-hidden", "false");
  });

  document.getElementById("tv-api-smpp-confirm")?.addEventListener("click", function () {
    document.getElementById("tv-api-smpp-modal")?.setAttribute("aria-hidden", "true");
    function doneLocal() {
      if (state) state.smppRequested = true;
      saveLocal(state || SERVER_SETTINGS);
      applySettingsUI(state || SERVER_SETTINGS);
      syncSource = "local";
      updateSyncHint();
      showToast("Solicitud guardada localmente. Se sincronizará cuando la conexión esté disponible.");
    }
    if (DB_AVAILABLE) {
      postJson("/app/api/smpp/request", {}).then(function (r) {
        if (r.ok && r.body && r.body.ok) {
          state = r.body.settings;
          saveLocal(state);
          applySettingsUI(state);
          syncSource = "supabase";
          updateSyncHint();
          showToast(r.body.message || "Tu solicitud SMPP fue registrada.");
        } else {
          doneLocal();
        }
      }).catch(doneLocal);
    } else {
      if (state) state.smppRequested = true;
      applySettingsUI(state || SERVER_SETTINGS);
      showToast("Tu solicitud SMPP fue registrada. El equipo Telvoice revisará factibilidad técnica y comercial.");
    }
  });
})();
</script>`;
}

function renderModals(): string {
  return `
    <div class="tv-api-modal" id="tv-api-regen-modal" role="dialog" aria-modal="true" aria-labelledby="tv-api-regen-title" aria-hidden="true">
      <div class="tv-api-modal__backdrop" data-tv-api-modal-close tabindex="-1"></div>
      <div class="tv-api-modal__panel">
        <h2 class="tv-section-head__title" id="tv-api-regen-title" style="margin:0 0 0.5rem">Regenerar API Key</h2>
        <p class="tv-page-sub" style="margin:0 0 1.25rem">
          Se generará una nueva clave de demostración visual. No afecta credenciales productivas (aún no habilitadas).
        </p>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost" data-tv-api-modal-close>Cancelar</button>
          <button type="button" class="btn btn-primary" id="tv-api-regen-confirm">Regenerar</button>
        </div>
      </div>
    </div>
    <div class="tv-api-modal" id="tv-api-smpp-modal" role="dialog" aria-modal="true" aria-labelledby="tv-api-smpp-title" aria-hidden="true">
      <div class="tv-api-modal__backdrop" data-tv-api-modal-close tabindex="-1"></div>
      <div class="tv-api-modal__panel">
        <h2 class="tv-section-head__title" id="tv-api-smpp-title" style="margin:0 0 0.5rem">Solicitud SMPP</h2>
        <p class="tv-page-sub" style="margin:0 0 1.25rem">Tu solicitud será revisada por el equipo Telvoice.</p>
        <button type="button" class="btn btn-primary" id="tv-api-smpp-confirm">Entendido</button>
      </div>
    </div>
    <div class="tv-api-toast" id="tv-api-toast" role="status" aria-live="polite" aria-hidden="true"></div>`;
}

export function renderAppApiPage(
  ctx: AppPageContext,
  pageData?: AppApiPageData,
): string {
  const balanceSms = fmtSms(ctx.balance?.availableSms ?? 0);
  const data: AppApiPageData = pageData ?? {
    module: { available: false, migrationPending: false },
    settings: buildDefaultClientApiSettings(),
    syncSource: "defaults",
    hasStoredRecord: false,
    requestsModule: { available: false, migrationPending: false },
    recentApiRequests: [],
  };
  const settings = data.settings;
  const apiStatusKpi = settings.apiStatus;

  const kpis = `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
    ${renderKpiCard({
      label: "Estado API",
      value: apiStatusKpi,
      hint: "Integración REST disponible",
      icon: "cloud_done",
      variant: "success",
    })}
    ${renderKpiCard({
      label: "Balance SMS disponible",
      value: balanceSms,
      hint: "Saldo actual de tu cuenta",
      icon: "account_balance_wallet",
      variant: "primary",
    })}
    ${renderKpiCard({
      label: "Solicitudes del mes",
      value: "342",
      hint: "Dato de referencia (mock)",
      icon: "monitoring",
      variant: "default",
    })}
    ${renderKpiCard({
      label: "Último envío API",
      value: "Hace 12 min",
      hint: "Dato de referencia (mock)",
      icon: "schedule",
      variant: "default",
    })}
  </div>`;

  const body = `
    ${apiPageStyles()}
    <div class="tv-api-page">
    ${renderPageHeader({
      title: "API",
      subtitle:
        "Conecta tus sistemas a Telvoice para enviar SMS transaccionales, OTP, alertas y notificaciones desde tus propias aplicaciones.",
      subtitleHtml:
        'Conecta tus sistemas a Telvoice para enviar SMS transaccionales, OTP, alertas y notificaciones desde tus propias aplicaciones. <span id="tv-api-sync-hint" class="field-hint" style="display:block;margin-top:0.35rem"></span>',
      actions: `
        <button type="button" class="btn btn-primary" id="tv-api-copy-header">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">content_copy</span>
          Copiar API Key
        </button>
        <a href="/app/api/docs" class="btn btn-secondary">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">menu_book</span>
          Ver documentación
        </a>
        <a href="/app/api/docs.pdf" class="btn btn-ghost" download="telvoice-api-docs.pdf">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">download</span>
          Descargar PDF
        </a>
      `,
    })}
    ${kpis}
    <div class="tv-api-layout">
      <div class="tv-api-main">
        ${renderCredentialsPanel(ctx, settings)}
        ${renderRealApiKeysPanel(ctx, data)}
        ${renderRecentApiActivityPanel(data)}
        ${renderWebhookPanel()}
        ${renderSmppPanel(settings)}
      </div>
    </div>
    </div>
    ${renderModals()}
    ${renderKeysModals()}
    ${renderApiScript(ctx, data)}
    ${renderRealApiKeysScript(data)}`;

  return wrapAppPage(ctx, "api", "API", body, { bodyClass: "tv-app-client--api" });
}
