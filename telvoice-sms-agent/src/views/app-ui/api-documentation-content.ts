import { escapeHtml } from "../../utils/html.js";
import { renderCodeBlock } from "../admin-ui/page-kit.js";

/** Placeholder fijo — nunca usar API Keys reales del cliente en documentación. */
export const DOC_PLACEHOLDER_KEY = "tlv_test_xxxxx";
export const SANDBOX_API_BASE_URL = "https://agent.telvoice.cl";

export const API_DOC_TITLE = "Documentación API Telvoice";
export const API_DOC_SUBTITLE = "Sandbox API para integración SMS";
export const API_DOC_PAGE_SUBTITLE =
  "Guía técnica para integrar tus sistemas con la API Telvoice en modo sandbox.";

export const API_DOC_LEGAL_NOTE =
  "El envío SMS real y el descuento de saldo no están habilitados en esta fase. Los mensajes creados por API se registran en modo sandbox.";

export type ApiDocScopeRow = { scope: string; use: string };
export type ApiDocErrorRow = { http: number; code: string; description: string };
export type ApiDocRateLimitBlock = { title: string; items: string[] };

export function getApiDocStatusItems(): { label: string; value: string }[] {
  return [
    { label: "Autenticación", value: "API Key Bearer" },
    { label: "Ambiente disponible", value: "Sandbox" },
    { label: "Envío real", value: "No habilitado" },
    { label: "Descuento de saldo", value: "No habilitado" },
    { label: "Webhooks reales", value: "No habilitados" },
    { label: "Producción", value: "Bajo aprobación Telvoice" },
  ];
}

export function getApiDocScopeRows(): ApiDocScopeRow[] {
  return [
    { scope: "balance:read", use: "Consultar saldo SMS" },
    { scope: "sms:send", use: "Crear mensajes sandbox" },
    { scope: "messages:read", use: "Consultar mensajes creados por API" },
  ];
}

export function getApiDocErrorRows(): ApiDocErrorRow[] {
  return [
    { http: 401, code: "MISSING_API_KEY", description: "Falta Authorization Bearer" },
    { http: 401, code: "INVALID_API_KEY", description: "API Key inválida" },
    { http: 403, code: "API_KEY_PAUSED", description: "Key pausada" },
    { http: 403, code: "API_KEY_REVOKED", description: "Key revocada" },
    { http: 403, code: "INSUFFICIENT_SCOPE", description: "La key no tiene el scope requerido" },
    { http: 403, code: "PRODUCTION_SEND_NOT_ENABLED", description: "Envío real aún no habilitado" },
    { http: 409, code: "IDEMPOTENCY_CONFLICT", description: "Misma Idempotency-Key con payload distinto" },
    { http: 429, code: "RATE_LIMIT_EXCEEDED", description: "Se superó el límite de solicitudes" },
  ];
}

export function getApiDocRateLimits(): ApiDocRateLimitBlock[] {
  return [
    {
      title: "Sandbox",
      items: ["30 requests/min por API Key", "500 requests/día por empresa"],
    },
    {
      title: "Producción",
      items: ["120 requests/min por API Key", "10.000 requests/día por empresa"],
    },
  ];
}

export function getApiDocRecommendedFlow(): string[] {
  return [
    "Crear API Key sandbox.",
    "Copiarla una sola vez.",
    "Consultar saldo.",
    "Enviar mensaje sandbox con Idempotency-Key.",
    "Consultar el message_id.",
    "Revisar actividad reciente en /app/api.",
  ];
}

export function getApiDocIdempotencyBullets(): string[] {
  return [
    "Misma key + mismo payload: devuelve el mismo mensaje.",
    "Misma key + payload distinto: error 409.",
    "Máximo 120 caracteres.",
    "Recomendado para evitar duplicados ante reintentos.",
  ];
}

export function getApiDocCurrentStateBullets(): string[] {
  return [
    "Envío real: no habilitado.",
    "Descuento de saldo: no habilitado.",
    "Webhooks reales: no habilitados.",
    "DLR real: no habilitado.",
    "Producción: bajo aprobación Telvoice.",
  ];
}

export function docSnippetBalance(): string {
  return `curl -H "Authorization: Bearer ${DOC_PLACEHOLDER_KEY}" \\
  ${SANDBOX_API_BASE_URL}/api/v1/balance`;
}

export function docSnippetSend(): string {
  return `curl -X POST ${SANDBOX_API_BASE_URL}/api/v1/sms/send \\
  -H "Authorization: Bearer ${DOC_PLACEHOLDER_KEY}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-123-send-1" \\
  -d '{
  "to": "+56912345678",
  "message": "Mensaje de prueba sandbox",
  "sender": "Telvoice",
  "country": "CL",
  "external_reference": "order-123"
}'`;
}

export function docSnippetMessageDetail(): string {
  return `curl -H "Authorization: Bearer ${DOC_PLACEHOLDER_KEY}" \\
  ${SANDBOX_API_BASE_URL}/api/v1/messages/<message_id>`;
}

export function docSnippetMessageList(): string {
  return `curl -H "Authorization: Bearer ${DOC_PLACEHOLDER_KEY}" \\
  "${SANDBOX_API_BASE_URL}/api/v1/messages?limit=20&status=sandbox_accepted"`;
}

export function docSnippetAuthHeader(): string {
  return `Authorization: Bearer ${DOC_PLACEHOLDER_KEY}`;
}

function methodBadge(method: string): string {
  const cls = method === "POST" ? "badge-ok" : "badge-muted";
  return `<span class="badge ${cls}">${escapeHtml(method)}</span>`;
}

function renderScopesTable(): string {
  const rows = getApiDocScopeRows()
    .map(
      (r) =>
        `<tr><td><code>${escapeHtml(r.scope)}</code></td><td>${escapeHtml(r.use)}</td></tr>`,
    )
    .join("");
  return `<div class="tv-api-doc-table-wrap">
    <table class="tv-api-doc-table">
      <thead><tr><th>Scope</th><th>Uso</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <p class="field-hint" style="margin:0.5rem 0 0">El scope <code>sms:send</code> no habilita envío real en esta fase.</p>`;
}

function renderErrorsTable(): string {
  const rows = getApiDocErrorRows()
    .map(
      (r) =>
        `<tr><td>${r.http}</td><td><code>${escapeHtml(r.code)}</code></td><td>${escapeHtml(r.description)}</td></tr>`,
    )
    .join("");
  return `<div class="tv-api-doc-table-wrap">
    <table class="tv-api-doc-table">
      <thead><tr><th>HTTP</th><th>Código</th><th>Descripción</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderRateLimits(): string {
  const blocks = getApiDocRateLimits()
    .map(
      (b) => `<div>
        <h4>${escapeHtml(b.title)}</h4>
        <ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      </div>`,
    )
    .join("");
  return `<div class="tv-api-doc-limits">${blocks}</div>
    <p class="field-hint" style="margin:0">Los límites pueden ser ajustados por Telvoice para clientes de alto volumen.</p>`;
}

function renderStatusList(): string {
  const items = getApiDocStatusItems()
    .map(
      (i) =>
        `<li><dt>${escapeHtml(i.label)}</dt><dd>${escapeHtml(i.value)}</dd></li>`,
    )
    .join("");
  return `<dl class="tv-api-doc-status">${items}</dl>`;
}

function renderEndpointAccordions(interactive: boolean): string {
  const copyBtn = (key: string, label: string) =>
    interactive
      ? `<div class="tv-api-doc-copy-row">
           <button type="button" class="btn btn-secondary btn-sm tv-api-docs-no-print" data-copy-doc="${key}">
             <span class="material-symbols-outlined" style="font-size:1rem" aria-hidden="true">content_copy</span>
             ${escapeHtml(label)}
           </button>
         </div>`
      : "";

  return `
    <details class="tv-api-doc-accordion">
      <summary>${methodBadge("GET")} Consultar saldo <code>/api/v1/balance</code></summary>
      <div class="tv-api-doc-accordion__body">
        <div class="tv-api-doc-accordion__meta"><span class="badge badge-muted">Scope</span> <code>balance:read</code></div>
        ${renderCodeBlock(docSnippetBalance())}
        ${copyBtn("balance", "Copiar ejemplo balance")}
      </div>
    </details>
    <details class="tv-api-doc-accordion">
      <summary>${methodBadge("POST")} Enviar SMS sandbox <code>/api/v1/sms/send</code></summary>
      <div class="tv-api-doc-accordion__body">
        <div class="tv-api-doc-accordion__meta"><span class="badge badge-muted">Scope</span> <code>sms:send</code></div>
        ${renderCodeBlock(docSnippetSend())}
        <p class="field-hint" style="margin:0.75rem 0 0">En sandbox no se envía SMS real ni se descuenta saldo.</p>
        ${copyBtn("send", "Copiar ejemplo envío sandbox")}
      </div>
    </details>
    <details class="tv-api-doc-accordion">
      <summary>${methodBadge("GET")} Consultar mensaje <code>/api/v1/messages/:id</code></summary>
      <div class="tv-api-doc-accordion__body">
        <div class="tv-api-doc-accordion__meta"><span class="badge badge-muted">Scope</span> <code>messages:read</code></div>
        ${renderCodeBlock(docSnippetMessageDetail())}
        ${copyBtn("message", "Copiar ejemplo consultar mensaje")}
      </div>
    </details>
    <details class="tv-api-doc-accordion">
      <summary>${methodBadge("GET")} Listar mensajes <code>/api/v1/messages</code></summary>
      <div class="tv-api-doc-accordion__body">
        <div class="tv-api-doc-accordion__meta"><span class="badge badge-muted">Scope</span> <code>messages:read</code></div>
        ${renderCodeBlock(docSnippetMessageList())}
        ${copyBtn("list", "Copiar ejemplo listar mensajes")}
      </div>
    </details>`;
}

export function renderApiDocumentationBody(options?: { interactive?: boolean }): string {
  const interactive = options?.interactive !== false;
  const flowSteps = getApiDocRecommendedFlow()
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  const idemBullets = getApiDocIdempotencyBullets()
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  const stateBullets = getApiDocCurrentStateBullets()
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");

  const templates = interactive
    ? `<template id="tv-api-doc-snippet-balance">${docSnippetBalance()}</template>
       <template id="tv-api-doc-snippet-send">${docSnippetSend()}</template>
       <template id="tv-api-doc-snippet-message">${docSnippetMessageDetail()}</template>
       <template id="tv-api-doc-snippet-list">${docSnippetMessageList()}</template>`
    : "";

  return `<article class="tv-api-doc-page">
    <div class="alert alert-warn" role="status">${escapeHtml(API_DOC_LEGAL_NOTE)}</div>

    <div class="tv-api-doc-block">
      <h3>A. Resumen</h3>
      <p class="field-hint" style="margin:0 0 0.75rem">
        API Telvoice para integrar envío y consulta de mensajes SMS desde tus sistemas. Actualmente operativa en modo sandbox.
      </p>
      <span class="badge badge-ok">Sandbox activo</span>
    </div>

    <div class="tv-api-doc-block">
      <h3>Estado de la API</h3>
      ${renderStatusList()}
    </div>

    <div class="tv-api-doc-block">
      <h3>B. Autenticación</h3>
      <p class="field-hint" style="margin:0 0 0.75rem">Header requerido en cada solicitud:</p>
      ${renderCodeBlock(docSnippetAuthHeader())}
      <p class="field-hint" style="margin:0.75rem 0 0">
        La API Key completa solo se muestra una vez al crearla. Después solo podrás verla enmascarada.
      </p>
    </div>

    <div class="tv-api-doc-block">
      <h3>C. Endpoints</h3>
      <p class="field-hint" style="margin:0 0 0.75rem">Base URL sandbox: <code>${escapeHtml(SANDBOX_API_BASE_URL)}</code></p>
      ${renderEndpointAccordions(interactive)}
    </div>

    <div class="tv-api-doc-block">
      <h3>D. Scopes</h3>
      ${renderScopesTable()}
    </div>

    <div class="tv-api-doc-block">
      <h3>E. Errores comunes</h3>
      ${renderErrorsTable()}
    </div>

    <div class="tv-api-doc-block">
      <h3>F. Rate limits</h3>
      ${renderRateLimits()}
    </div>

    <div class="tv-api-doc-block">
      <h3>G. Idempotency-Key</h3>
      <ul class="tv-api-security-list" style="margin:0">${idemBullets}</ul>
    </div>

    <div class="tv-api-doc-block">
      <h3>H. Flujo recomendado</h3>
      <ol class="tv-api-doc-steps">${flowSteps}</ol>
    </div>

    <div class="tv-api-doc-block tv-api-doc-block--print-break">
      <h3>I. Estado actual</h3>
      <ul class="tv-api-security-list" style="margin:0">${stateBullets}</ul>
    </div>
    ${templates}
  </article>`;
}

export function apiDocumentationStyles(): string {
  return `<style>
    .tv-api-doc-page { max-width: 920px; }
    .tv-api-doc-page .tv-api-doc-status {
      display: grid;
      gap: 0.65rem;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.88rem;
    }
    .tv-api-doc-page .tv-api-doc-status li {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 0.5rem;
      align-items: baseline;
    }
    .tv-api-doc-page .tv-api-doc-status dt {
      margin: 0;
      font-weight: 600;
      color: var(--tv-text);
      min-width: 10rem;
    }
    .tv-api-doc-page .tv-api-doc-status dd {
      margin: 0;
      color: var(--tv-muted);
      flex: 1;
    }
    .tv-api-doc-block {
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--tv-border);
    }
    .tv-api-doc-block:first-of-type { margin-top: 0; padding-top: 0; border-top: none; }
    .tv-api-doc-block h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      font-weight: 600;
    }
    .tv-api-doc-accordion {
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      background: var(--tv-surface);
      margin-bottom: 0.65rem;
      overflow: hidden;
    }
    .tv-api-doc-accordion summary {
      cursor: pointer;
      padding: 0.85rem 1rem;
      font-weight: 600;
      font-size: 0.9rem;
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    .tv-api-doc-accordion summary::-webkit-details-marker { display: none; }
    .tv-api-doc-accordion summary::after {
      content: "expand_more";
      font-family: "Material Symbols Outlined";
      margin-left: auto;
      color: var(--tv-muted);
      font-size: 1.25rem;
    }
    .tv-api-doc-accordion[open] summary::after { content: "expand_less"; }
    .tv-api-doc-accordion__body {
      padding: 0 1rem 1rem;
      border-top: 1px solid var(--tv-border);
    }
    .tv-api-doc-accordion__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.75rem;
      font-size: 0.82rem;
    }
    .tv-api-doc-table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin: 0.75rem 0;
    }
    .tv-api-doc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      min-width: 280px;
    }
    .tv-api-doc-table th,
    .tv-api-doc-table td {
      padding: 0.55rem 0.65rem;
      text-align: left;
      border-bottom: 1px solid var(--tv-border);
      vertical-align: top;
    }
    .tv-api-doc-table th {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--tv-muted);
      font-weight: 600;
    }
    .tv-api-doc-table code { font-size: 0.78rem; }
    .tv-api-doc-steps {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.88rem;
      line-height: 1.6;
      color: var(--tv-muted);
    }
    .tv-api-doc-steps li { margin-bottom: 0.4rem; }
    .tv-api-doc-copy-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }
    .tv-api-doc-limits {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 0.75rem 0;
    }
    .tv-api-doc-limits h4 { margin: 0 0 0.35rem; font-size: 0.85rem; }
    .tv-api-doc-limits ul {
      margin: 0;
      padding-left: 1.1rem;
      font-size: 0.85rem;
      color: var(--tv-muted);
    }
    .tv-api-docs-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
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
    @media print {
      .tv-sidebar,
      .tv-topbar,
      .tv-overlay,
      .tv-api-docs-actions,
      .tv-api-docs-no-print,
      .tv-api-doc-copy-row,
      .logout-form,
      .tv-btn-buy-sms,
      .tv-topbar__icon-btn {
        display: none !important;
      }
      .tv-app { display: block !important; }
      .tv-main { margin: 0 !important; width: 100% !important; }
      .tv-content { padding: 0 !important; max-width: none !important; }
      .tv-api-doc-accordion { break-inside: avoid; }
      .tv-api-doc-accordion summary::after { display: none; }
      .tv-api-doc-accordion__body { display: block !important; border-top: none; padding-top: 0; }
      .tv-api-doc-block--print-break { break-before: page; }
      pre, code { font-size: 9pt !important; white-space: pre-wrap !important; word-break: break-word; }
      body { font-size: 11pt; color: #000; background: #fff; }
      .alert { border: 1px solid #ccc; background: #f8f8f8; color: #333; }
    }
  </style>`;
}
