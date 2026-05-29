import { escapeHtml, formatDateShort } from "../../utils/html.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderCodeBlock, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";

const API_DOCS_URL = "https://www.telvoice.cl";
const API_BASE_URL = "https://api.telvoice.cl";

export const DEFAULT_MOCK_API_KEY = "tlv_live_ch7k2m9p4q1n8x6w5v3b2a";

export type ClientApiCredentials = {
  apiKey: string;
  environment: "production";
  status: "active";
  createdAt: string;
  lastUsedLabel: string;
};

const DEFAULT_CREDENTIALS: ClientApiCredentials = {
  apiKey: DEFAULT_MOCK_API_KEY,
  environment: "production",
  status: "active",
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  lastUsedLabel: "Hace 12 minutos",
};

export type ClientApiWebhookConfig = {
  url: string;
  active: boolean;
  events: {
    delivered: boolean;
    failed: boolean;
    expired: boolean;
    rejected: boolean;
  };
};

const DEFAULT_WEBHOOK: ClientApiWebhookConfig = {
  url: "",
  active: false,
  events: {
    delivered: true,
    failed: true,
    expired: true,
    rejected: true,
  },
};

const API_ENDPOINTS = [
  {
    method: "POST",
    path: "/api/v1/sms/send",
    title: "Enviar SMS",
    description:
      "Envía un mensaje SMS a uno o varios destinatarios usando tu saldo disponible.",
  },
  {
    method: "GET",
    path: "/api/v1/balance",
    title: "Consultar balance",
    description: "Consulta el saldo SMS disponible para tu empresa.",
  },
  {
    method: "GET",
    path: "/api/v1/messages/{messageId}",
    title: "Estado de mensaje",
    description: "Revisa el estado de entrega de un mensaje enviado.",
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/dlr",
    title: "Webhook DLR",
    description:
      "Configura una URL para recibir reportes de entrega en tiempo real.",
  },
] as const;

function methodBadge(method: string): string {
  const cls = method === "POST" ? "badge-ok" : "badge-muted";
  return `<span class="badge ${cls}">${escapeHtml(method)}</span>`;
}

function apiPageStyles(): string {
  return `<style>
    .tv-api-page .tv-api-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 300px);
      gap: 1.25rem;
      align-items: start;
    }
    .tv-api-page .tv-api-main { display: flex; flex-direction: column; gap: 1.25rem; min-width: 0; }
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
    .tv-api-endpoint {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.75rem 1rem;
      align-items: start;
      padding: 0.85rem 1rem;
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      background: var(--tv-surface);
    }
    .tv-api-endpoint__path code {
      display: block;
      font-size: 0.82rem;
      margin-top: 0.25rem;
      word-break: break-all;
    }
    .tv-api-endpoint__desc {
      margin: 0.25rem 0 0;
      font-size: 0.82rem;
      color: var(--tv-muted);
      line-height: 1.4;
    }
    .tv-api-example-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.75rem;
    }
    .tv-api-example-tabs .tv-tab {
      cursor: pointer;
      border: 1px solid var(--tv-border);
      background: var(--tv-surface);
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--tv-muted);
    }
    .tv-api-example-tabs .tv-tab--active {
      border-color: var(--tv-primary);
      color: var(--tv-primary);
      background: rgba(0, 82, 204, 0.06);
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
    .tv-api-security-list {
      margin: 0;
      padding-left: 1.15rem;
      color: var(--tv-muted);
      font-size: 0.88rem;
      line-height: 1.55;
    }
    .tv-api-security-list li { margin-bottom: 0.5rem; }
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
    @media (max-width: 900px) {
      .tv-api-page .tv-api-layout { grid-template-columns: 1fr; }
      .tv-api-endpoint { grid-template-columns: 1fr; }
    }
  </style>`;
}

function buildExampleSnippets(apiKey: string): Record<"curl" | "javascript" | "php", string> {
  const key = apiKey;
  const curl = `curl -X POST ${API_BASE_URL}/api/v1/sms/send \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
  "to": "+56912345678",
  "message": "Tu código de verificación es 123456",
  "sender": "Telvoice"
}'`;

  const javascript = `const response = await fetch("${API_BASE_URL}/api/v1/sms/send", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${key}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    to: "+56912345678",
    message: "Tu código de verificación es 123456",
    sender: "Telvoice"
  })
});

const data = await response.json();`;

  const php = `$ch = curl_init("${API_BASE_URL}/api/v1/sms/send");

curl_setopt($ch, CURLOPT_HTTPHEADER, [
  "Authorization: Bearer ${key}",
  "Content-Type: application/json"
]);

curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
  "to" => "+56912345678",
  "message" => "Tu código de verificación es 123456",
  "sender" => "Telvoice"
]));

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);`;

  return { curl, javascript, php };
}

function renderEndpointsSection(): string {
  const rows = API_ENDPOINTS.map(
    (e) => `<article class="tv-api-endpoint">
      <div>${methodBadge(e.method)}</div>
      <div class="tv-api-endpoint__path">
        <strong>${escapeHtml(e.title)}</strong>
        <code>${escapeHtml(e.path)}</code>
        <p class="tv-api-endpoint__desc">${escapeHtml(e.description)}</p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-copy-text="${escapeHtml(e.path)}" data-copy-label="Ruta">Copiar</button>
    </article>`,
  ).join("");

  return `<section class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Endpoints principales</h2>
      <p class="tv-section-head__sub">Base URL: <code>${escapeHtml(API_BASE_URL)}</code></p>
    </header>
    <div class="tv-panel__body" style="display:flex;flex-direction:column;gap:0.65rem">${rows}</div>
  </section>`;
}

function renderCredentialsPanel(ctx: AppPageContext, creds: ClientApiCredentials): string {
  const companyLabel = ctx.company.name?.trim() || "Tu empresa";
  const companyId = ctx.company.id?.trim() || "—";

  return `<section class="tv-panel" id="tv-api-credentials-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Credenciales de acceso</h2>
      <p class="tv-section-head__sub">Clave de prueba para desarrollo. No es una credencial de producción real.</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-api-key-row">
        <span class="field-hint" style="margin:0">API Key</span>
        <code id="tv-api-key-display">${escapeHtml(creds.apiKey)}</code>
        <button type="button" class="btn btn-secondary btn-sm" id="tv-api-copy-key-btn">
          <span class="material-symbols-outlined" style="font-size:1rem" aria-hidden="true">content_copy</span>
          Copiar API Key
        </button>
        <button type="button" class="btn btn-ghost btn-sm" id="tv-api-regen-key-btn">Regenerar API Key</button>
      </div>
      <dl class="tv-api-meta-grid">
        <div><dt>Ambiente</dt><dd>Producción</dd></div>
        <div><dt>Estado</dt><dd><span class="badge badge-ok">Activa</span></dd></div>
        <div><dt>Empresa</dt><dd>${escapeHtml(companyLabel)}</dd></div>
        <div><dt>Company ID</dt><dd><code class="tv-code-sm">${escapeHtml(companyId)}</code></dd></div>
        <div><dt>Creada</dt><dd id="tv-api-created-at">${escapeHtml(formatDateShort(creds.createdAt))}</dd></div>
        <div><dt>Último uso</dt><dd id="tv-api-last-used">${escapeHtml(creds.lastUsedLabel)}</dd></div>
      </dl>
    </div>
  </section>`;
}

function renderExampleSection(apiKey: string): string {
  const snippets = buildExampleSnippets(apiKey);
  return `<section class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Ejemplo rápido</h2>
      <p class="tv-section-head__sub">Integra el envío de SMS en tu backend en minutos.</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-api-example-tabs" role="tablist" id="tv-api-example-tabs">
        <button type="button" class="tv-tab tv-tab--active" data-example="curl" aria-selected="true">cURL</button>
        <button type="button" class="tv-tab" data-example="javascript" aria-selected="false">JavaScript</button>
        <button type="button" class="tv-tab" data-example="php" aria-selected="false">PHP</button>
      </div>
      <div id="tv-api-example-code">${renderCodeBlock(snippets.curl)}</div>
      <button type="button" class="btn btn-secondary btn-sm" id="tv-api-copy-example-btn" style="margin-top:0.75rem">Copiar ejemplo</button>
      <template id="tv-api-snippet-curl">${renderCodeBlock(snippets.curl)}</template>
      <template id="tv-api-snippet-javascript">${renderCodeBlock(snippets.javascript)}</template>
      <template id="tv-api-snippet-php">${renderCodeBlock(snippets.php)}</template>
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

function renderSmppPanel(): string {
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
        <div><dt>Estado</dt><dd><span class="badge badge-warn">Bajo solicitud</span></dd></div>
      </dl>
      <button type="button" class="btn btn-secondary btn-sm" id="tv-api-smpp-request">Solicitar acceso SMPP</button>
    </div>
  </section>`;
}

function renderSecurityAside(): string {
  return `<aside class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Buenas prácticas</h2>
    </header>
    <div class="tv-panel__body">
      <ul class="tv-api-security-list">
        <li>No compartas tu API Key en frontend público.</li>
        <li>Usa variables de entorno en tu backend.</li>
        <li>Regenera tu API Key si sospechas exposición.</li>
        <li>Configura webhooks solo en dominios de confianza.</li>
      </ul>
    </div>
  </aside>`;
}

function renderApiScript(ctx: AppPageContext): string {
  const companyId = escapeHtml(ctx.company.id || "default");
  const credsJson = JSON.stringify(DEFAULT_CREDENTIALS).replace(/</g, "\\u003c");
  const webhookJson = JSON.stringify(DEFAULT_WEBHOOK).replace(/</g, "\\u003c");
  const defaultKey = DEFAULT_MOCK_API_KEY;

  return `<script>
(function () {
  var CRED_KEY = "telvoice_client_api_credentials_${companyId}";
  var WEBHOOK_KEY = "telvoice_client_api_webhook_${companyId}";
  var DEFAULT_CRED = ${credsJson};
  var DEFAULT_WEBHOOK = ${webhookJson};
  var DEFAULT_API_KEY = ${JSON.stringify(defaultKey)};

  var toast = document.getElementById("tv-api-toast");
  var keyDisplay = document.getElementById("tv-api-key-display");
  var exampleCode = document.getElementById("tv-api-example-code");
  var activeExample = "curl";

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

  function genApiKey() {
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var s = "tlv_live_";
    for (var i = 0; i < 20; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function loadCred() {
    try {
      var raw = localStorage.getItem(CRED_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.apiKey) return p;
      }
    } catch (e) {}
    return Object.assign({}, DEFAULT_CRED);
  }

  function saveCred(c) {
    try { localStorage.setItem(CRED_KEY, JSON.stringify(c)); } catch (e) {}
  }

  function loadWebhook() {
    try {
      var raw = localStorage.getItem(WEBHOOK_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return Object.assign({}, DEFAULT_WEBHOOK, { events: Object.assign({}, DEFAULT_WEBHOOK.events) });
  }

  function saveWebhook(w) {
    try { localStorage.setItem(WEBHOOK_KEY, JSON.stringify(w)); } catch (e) {}
  }

  function getSnippetHtml(lang) {
    var tpl = document.getElementById("tv-api-snippet-" + lang);
    return tpl ? tpl.innerHTML : "";
  }

  function updateExampleSnippets(apiKey) {
    ["curl", "javascript", "php"].forEach(function (lang) {
      var tpl = document.getElementById("tv-api-snippet-" + lang);
      if (!tpl || !tpl.content) return;
      var pre = tpl.content.querySelector("pre code");
      if (!pre) return;
      var text = pre.textContent || "";
      pre.textContent = text.replace(/tlv_live_[a-z0-9]+/g, apiKey);
    });
    if (exampleCode && activeExample) {
      exampleCode.innerHTML = getSnippetHtml(activeExample);
    }
  }

  function applyCredUI(c) {
    if (keyDisplay) keyDisplay.textContent = c.apiKey;
    var created = document.getElementById("tv-api-created-at");
    var lastUsed = document.getElementById("tv-api-last-used");
    if (created && c.createdAt) {
      try {
        created.textContent = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(c.createdAt));
      } catch (e) { created.textContent = c.createdAt; }
    }
    if (lastUsed) lastUsed.textContent = c.lastUsedLabel || "—";
    updateExampleSnippets(c.apiKey);
  }

  function applyWebhookUI(w) {
    var urlInput = document.getElementById("tv-api-webhook-url");
    var statusEl = document.getElementById("tv-api-webhook-status");
    if (urlInput) urlInput.value = w.url || "";
    if (statusEl) {
      if (w.active && w.url) {
        statusEl.className = "badge badge-ok";
        statusEl.textContent = "Activo";
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
    var w = loadWebhook();
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

  function isValidUrl(s) {
    try {
      var u = new URL(s);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch (e) { return false; }
  }

  var cred = loadCred();
  applyCredUI(cred);
  applyWebhookUI(loadWebhook());

  document.getElementById("tv-api-copy-header")?.addEventListener("click", function () {
    copyText(cred.apiKey, "API Key copiada.");
  });
  document.getElementById("tv-api-copy-key-btn")?.addEventListener("click", function () {
    copyText(cred.apiKey, "API Key copiada.");
  });

  document.getElementById("tv-api-regen-key-btn")?.addEventListener("click", function () {
    var modal = document.getElementById("tv-api-regen-modal");
    if (modal) modal.setAttribute("aria-hidden", "false");
  });

  document.getElementById("tv-api-regen-confirm")?.addEventListener("click", function () {
    cred.apiKey = genApiKey();
    cred.createdAt = new Date().toISOString();
    cred.lastUsedLabel = "Recién generada";
    saveCred(cred);
    applyCredUI(cred);
    document.getElementById("tv-api-regen-modal")?.setAttribute("aria-hidden", "true");
    showToast("API Key regenerada correctamente.");
  });

  document.querySelectorAll("[data-tv-api-modal-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      document.getElementById("tv-api-regen-modal")?.setAttribute("aria-hidden", "true");
      document.getElementById("tv-api-smpp-modal")?.setAttribute("aria-hidden", "true");
    });
  });

  document.querySelectorAll("#tv-api-example-tabs .tv-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      activeExample = tab.getAttribute("data-example") || "curl";
      document.querySelectorAll("#tv-api-example-tabs .tv-tab").forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("tv-tab--active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (exampleCode) exampleCode.innerHTML = getSnippetHtml(activeExample);
    });
  });

  document.getElementById("tv-api-copy-example-btn")?.addEventListener("click", function () {
    var pre = exampleCode && exampleCode.querySelector("pre code");
    copyText(pre ? pre.textContent : "", "Ejemplo copiado.");
  });

  document.querySelectorAll("[data-copy-text]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      copyText(btn.getAttribute("data-copy-text"), "Ruta copiada.");
    });
  });

  document.getElementById("tv-api-webhook-save")?.addEventListener("click", function () {
    var w = readWebhookFromForm();
    if (w.url && !isValidUrl(w.url)) {
      showToast("Ingresa una URL válida (http o https).", true);
      return;
    }
    saveWebhook(w);
    applyWebhookUI(w);
    showToast(w.url ? "Webhook guardado correctamente." : "Configuración guardada.");
  });

  document.getElementById("tv-api-webhook-test")?.addEventListener("click", function () {
    var w = readWebhookFromForm();
    if (!w.url || !isValidUrl(w.url)) {
      showToast("Debes ingresar una URL válida antes de enviar una prueba.", true);
      return;
    }
    saveWebhook(w);
    applyWebhookUI(w);
    showToast("Prueba enviada correctamente al webhook configurado.");
  });

  document.getElementById("tv-api-smpp-request")?.addEventListener("click", function () {
    var modal = document.getElementById("tv-api-smpp-modal");
    if (modal) modal.setAttribute("aria-hidden", "false");
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
          Esta acción reemplazará la API Key actual. Las integraciones existentes podrían dejar de funcionar.
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
        <button type="button" class="btn btn-primary" data-tv-api-modal-close>Entendido</button>
      </div>
    </div>
    <div class="tv-api-toast" id="tv-api-toast" role="status" aria-live="polite" aria-hidden="true"></div>`;
}

export function renderAppApiPage(ctx: AppPageContext): string {
  const balanceSms = fmtSms(ctx.balance?.availableSms ?? 0);
  const creds = DEFAULT_CREDENTIALS;

  const kpis = `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
    ${renderKpiCard({
      label: "Estado API",
      value: "Activa",
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
      actions: `
        <button type="button" class="btn btn-primary" id="tv-api-copy-header">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">content_copy</span>
          Copiar API Key
        </button>
        <a href="${escapeHtml(API_DOCS_URL)}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">menu_book</span>
          Ver documentación
        </a>
      `,
    })}
    ${kpis}
    <div class="tv-api-layout">
      <div class="tv-api-main">
        ${renderCredentialsPanel(ctx, creds)}
        ${renderEndpointsSection()}
        ${renderExampleSection(creds.apiKey)}
        ${renderWebhookPanel()}
        ${renderSmppPanel()}
      </div>
      ${renderSecurityAside()}
    </div>
    </div>
    ${renderModals()}
    ${renderApiScript(ctx)}`;

  return wrapAppPage(ctx, "api", "API", body);
}
