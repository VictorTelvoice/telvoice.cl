import type { ClientApiProductionStatus } from "../../types/client-api-production-status.js";
import { escapeHtml } from "../../utils/html.js";
import { renderCodeBlock } from "../admin-ui/page-kit.js";

export type ApiDocMode = "sandbox" | "production";

/** Placeholder sandbox — nunca usar API Keys reales del cliente. */
export const DOC_PLACEHOLDER_KEY_SANDBOX = "tlv_test_xxxxx";
export const DOC_PLACEHOLDER_KEY_PRODUCTION = "TU_API_KEY";
export const API_BASE_URL = "https://agent.telvoice.cl";

export const API_DOC_TITLE = "Documentación API Telvoice";

export type ApiDocContentOptions = {
  mode: ApiDocMode;
  /** Key enmascarada para referencia visual (sin secret). */
  keyMaskedHint?: string | null;
};

export function resolveApiDocMode(
  status:
    | Pick<ClientApiProductionStatus, "canUseProductionApi" | "hasProductionApprovedKey">
    | null
    | undefined,
): ApiDocMode {
  if (status?.canUseProductionApi === true && status?.hasProductionApprovedKey === true) {
    return "production";
  }
  return "sandbox";
}

export function buildApiDocContentOptions(
  status: ClientApiProductionStatus | null | undefined,
  keyMaskedHint?: string | null,
): ApiDocContentOptions {
  return {
    mode: resolveApiDocMode(status),
    keyMaskedHint: keyMaskedHint ?? null,
  };
}

function opts(options?: ApiDocContentOptions): ApiDocContentOptions {
  return options ?? { mode: "sandbox", keyMaskedHint: null };
}

function placeholderKey(mode: ApiDocMode): string {
  return mode === "production" ? DOC_PLACEHOLDER_KEY_PRODUCTION : DOC_PLACEHOLDER_KEY_SANDBOX;
}

export function getApiDocSubtitle(options?: ApiDocContentOptions): string {
  const { mode } = opts(options);
  return mode === "production"
    ? "API productiva para envío SMS"
    : "Sandbox API para integración SMS";
}

export const API_DOC_PAGE_SUBTITLE_SANDBOX =
  "Guía técnica para integrar tus sistemas con la API Telvoice en modo sandbox.";

export const API_DOC_PAGE_SUBTITLE_PRODUCTION =
  "Guía técnica para integrar tus sistemas con la API Telvoice en producción.";

export function getApiDocPageSubtitle(options?: ApiDocContentOptions): string {
  return opts(options).mode === "production"
    ? API_DOC_PAGE_SUBTITLE_PRODUCTION
    : API_DOC_PAGE_SUBTITLE_SANDBOX;
}

export function getApiDocStatusLine(options?: ApiDocContentOptions): string {
  const { mode } = opts(options);
  return mode === "production"
    ? "Producción activa — envío real habilitado"
    : "Sandbox / Pendiente de aprobación — envío real no habilitado";
}

export function getApiDocSummary(options?: ApiDocContentOptions): string {
  const { mode } = opts(options);
  if (mode === "production") {
    return "API Telvoice para integración SMS productiva. Autenticación Bearer con API Key live. Los envíos reales descuentan saldo de la wallet y generan registros consultables por API.";
  }
  return "API Telvoice para integración SMS en modo sandbox. Autenticación Bearer con API Key de prueba (tlv_test_). El envío real se habilita tras aprobación Telvoice.";
}

export function getApiDocLegalNote(options?: ApiDocContentOptions): string {
  const { mode } = opts(options);
  if (mode === "production") {
    return "Los envíos realizados con API Key productiva consumen saldo SMS real. Usa Idempotency-Key para evitar duplicados ante reintentos.";
  }
  return "El envío SMS real y el descuento de saldo no están habilitados en esta fase. Los mensajes creados por API se registran en modo sandbox. Solicita activación productiva desde soporte Telvoice.";
}

export type ApiDocScopeRow = { scope: string; use: string };
export type ApiDocErrorRow = { http: number; code: string; description: string };
export type ApiDocRateLimitBlock = { title: string; items: string[] };

export function getApiDocStatusItems(options?: ApiDocContentOptions): { label: string; value: string }[] {
  const { mode } = opts(options);
  if (mode === "production") {
    return [
      { label: "Autenticación", value: "API Key Bearer" },
      { label: "Ambiente disponible", value: "Producción" },
      { label: "Envío real", value: "Habilitado" },
      { label: "Descuento de saldo", value: "Habilitado" },
      { label: "DLR / estado de entrega", value: "Consultable por API" },
      { label: "Webhooks salientes", value: "Próximamente" },
      { label: "Producción", value: "Aprobada por Telvoice" },
    ];
  }
  return [
    { label: "Autenticación", value: "API Key Bearer" },
    { label: "Ambiente disponible", value: "Sandbox" },
    { label: "Envío real", value: "No habilitado" },
    { label: "Descuento de saldo", value: "No habilitado" },
    { label: "DLR / estado de entrega", value: "No habilitado en sandbox" },
    { label: "Webhooks salientes", value: "No habilitados" },
    { label: "Producción", value: "Pendiente de aprobación Telvoice" },
  ];
}

export function getApiDocScopeRows(options?: ApiDocContentOptions): ApiDocScopeRow[] {
  const { mode } = opts(options);
  if (mode === "production") {
    return [
      { scope: "balance:read", use: "Consultar saldo SMS" },
      { scope: "sms:send", use: "Enviar SMS productivos" },
      { scope: "messages:read", use: "Consultar mensajes creados por API" },
    ];
  }
  return [
    { scope: "balance:read", use: "Consultar saldo SMS" },
    { scope: "sms:send", use: "Crear mensajes sandbox" },
    { scope: "messages:read", use: "Consultar mensajes creados por API" },
  ];
}

const PRODUCTION_ERROR_ROWS: ApiDocErrorRow[] = [
  { http: 401, code: "MISSING_API_KEY", description: "Falta Authorization Bearer" },
  { http: 401, code: "INVALID_API_KEY", description: "API Key inválida" },
  { http: 403, code: "API_KEY_PAUSED", description: "Key pausada" },
  { http: 403, code: "API_KEY_REVOKED", description: "Key revocada" },
  { http: 403, code: "INSUFFICIENT_SCOPE", description: "La key no tiene el scope requerido" },
  { http: 403, code: "API_NOT_ENABLED", description: "API no habilitada en el rate plan" },
  { http: 403, code: "RATE_PLAN_NOT_ENABLED", description: "Rate plan no habilitado" },
  { http: 403, code: "PRODUCTION_KEY_NOT_APPROVED", description: "Key productiva sin aprobación" },
  { http: 403, code: "WALLET_INACTIVE", description: "Wallet inactiva" },
  { http: 402, code: "INSUFFICIENT_BALANCE", description: "Saldo SMS insuficiente" },
  { http: 400, code: "INVALID_DESTINATION", description: "Destino inválido (E.164)" },
  { http: 400, code: "MESSAGE_REQUIRED", description: "Falta el campo message" },
  { http: 409, code: "IDEMPOTENCY_CONFLICT", description: "Misma Idempotency-Key con payload distinto" },
  { http: 429, code: "RATE_LIMIT_EXCEEDED", description: "Se superó el límite de solicitudes" },
];

const SANDBOX_ERROR_ROWS: ApiDocErrorRow[] = [
  { http: 401, code: "MISSING_API_KEY", description: "Falta Authorization Bearer" },
  { http: 401, code: "INVALID_API_KEY", description: "API Key inválida" },
  { http: 403, code: "API_KEY_PAUSED", description: "Key pausada" },
  { http: 403, code: "API_KEY_REVOKED", description: "Key revocada" },
  { http: 403, code: "INSUFFICIENT_SCOPE", description: "La key no tiene el scope requerido" },
  { http: 403, code: "PRODUCTION_SEND_NOT_ENABLED", description: "Envío real aún no habilitado" },
  { http: 409, code: "IDEMPOTENCY_CONFLICT", description: "Misma Idempotency-Key con payload distinto" },
  { http: 429, code: "RATE_LIMIT_EXCEEDED", description: "Se superó el límite de solicitudes" },
];

export function getApiDocErrorRows(options?: ApiDocContentOptions): ApiDocErrorRow[] {
  return opts(options).mode === "production" ? PRODUCTION_ERROR_ROWS : SANDBOX_ERROR_ROWS;
}

export function getApiDocRateLimits(options?: ApiDocContentOptions): ApiDocRateLimitBlock[] {
  const production = {
    title: "Producción",
    items: ["120 requests/min por API Key", "10.000 requests/día por empresa"],
  };
  const sandbox = {
    title: "Sandbox",
    items: ["30 requests/min por API Key", "500 requests/día por empresa"],
  };
  return opts(options).mode === "production" ? [production, sandbox] : [sandbox, production];
}

export function getApiDocRecommendedFlow(options?: ApiDocContentOptions): string[] {
  const { mode } = opts(options);
  if (mode === "production") {
    return [
      "Crear o regenerar API Key productiva si no guardaste el secret.",
      "Copiar el secret una sola vez.",
      "Consultar saldo con GET /api/v1/balance.",
      "Enviar SMS real controlado con POST /api/v1/sms/send.",
      "Consultar el message_id.",
      "Revisar estado con GET /api/v1/messages/:id.",
      "Monitorear status y dlr_status.",
    ];
  }
  return [
    "Crear API Key sandbox.",
    "Copiarla una sola vez.",
    "Consultar saldo.",
    "Enviar mensaje sandbox con Idempotency-Key.",
    "Consultar el message_id.",
    "Revisar actividad reciente en /app/api.",
    "Solicitar activación productiva a soporte Telvoice.",
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

export function getApiDocCurrentStateBullets(options?: ApiDocContentOptions): string[] {
  const { mode } = opts(options);
  if (mode === "production") {
    return [
      "Envío real: habilitado.",
      "Descuento de saldo: habilitado.",
      "DLR / estado de entrega: consultable por API.",
      "Webhooks salientes al cliente: próximamente.",
      "Producción: aprobada por Telvoice.",
    ];
  }
  return [
    "Envío real: no habilitado.",
    "Descuento de saldo: no habilitado.",
    "DLR real: no habilitado.",
    "Webhooks salientes: no habilitados.",
    "Producción: pendiente de aprobación Telvoice.",
  ];
}

export function docSnippetAuthHeader(options?: ApiDocContentOptions): string {
  return `Authorization: Bearer ${placeholderKey(opts(options).mode)}`;
}

export function docSnippetBalance(options?: ApiDocContentOptions): string {
  const key = placeholderKey(opts(options).mode);
  return `curl -X GET "${API_BASE_URL}/api/v1/balance" \\
  -H "Authorization: Bearer ${key}"`;
}

export function docSnippetSend(options?: ApiDocContentOptions): string {
  const key = placeholderKey(opts(options).mode);
  const message =
    opts(options).mode === "production"
      ? "Mensaje de prueba Telvoice API"
      : "Mensaje de prueba sandbox";
  return `curl -X POST "${API_BASE_URL}/api/v1/sms/send" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-123-send-1" \\
  -d '{
  "to": "+56912345678",
  "message": "${message}",
  "sender": "Telvoice",
  "country": "CL",
  "external_reference": "order-123"
}'`;
}

export function docSnippetMessageDetail(options?: ApiDocContentOptions): string {
  const key = placeholderKey(opts(options).mode);
  return `curl -X GET "${API_BASE_URL}/api/v1/messages/<message_id>" \\
  -H "Authorization: Bearer ${key}"`;
}

export function docSnippetMessageList(options?: ApiDocContentOptions): string {
  const key = placeholderKey(opts(options).mode);
  const status = opts(options).mode === "production" ? "sent" : "sandbox_accepted";
  return `curl -X GET "${API_BASE_URL}/api/v1/messages?limit=20&status=${status}" \\
  -H "Authorization: Bearer ${key}"`;
}

export function getApiDocSendEndpointLabel(options?: ApiDocContentOptions): string {
  return opts(options).mode === "production"
    ? "POST /api/v1/sms/send — Enviar SMS productivo (scope sms:send)"
    : "POST /api/v1/sms/send — Enviar SMS sandbox (scope sms:send)";
}

export function getApiDocAuthNotes(options?: ApiDocContentOptions): string[] {
  const { mode, keyMaskedHint } = opts(options);
  const lines = [
    "Header requerido en cada solicitud (ver bloque siguiente).",
    "El secret completo solo se muestra una vez al crear o regenerar la key.",
  ];
  if (mode === "production" && keyMaskedHint) {
    lines.unshift(`Key productiva de referencia: ${keyMaskedHint}`);
  }
  return lines;
}

function methodBadge(method: string): string {
  const cls = method === "POST" ? "badge-ok" : "badge-muted";
  return `<span class="badge ${cls}">${escapeHtml(method)}</span>`;
}

function renderScopesTable(options?: ApiDocContentOptions): string {
  const rows = getApiDocScopeRows(options)
    .map(
      (r) =>
        `<tr><td><code>${escapeHtml(r.scope)}</code></td><td>${escapeHtml(r.use)}</td></tr>`,
    )
    .join("");
  const hint =
    opts(options).mode === "production"
      ? ""
      : `<p class="field-hint" style="margin:0.5rem 0 0">El scope <code>sms:send</code> no habilita envío real en esta fase.</p>`;
  return `<div class="tv-api-doc-table-wrap">
    <table class="tv-api-doc-table">
      <thead><tr><th>Scope</th><th>Uso</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>${hint}`;
}

function renderErrorsTable(options?: ApiDocContentOptions): string {
  const rows = getApiDocErrorRows(options)
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

function renderRateLimits(options?: ApiDocContentOptions): string {
  const blocks = getApiDocRateLimits(options)
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

function renderStatusList(options?: ApiDocContentOptions): string {
  const items = getApiDocStatusItems(options)
    .map(
      (i) =>
        `<li><dt>${escapeHtml(i.label)}</dt><dd>${escapeHtml(i.value)}</dd></li>`,
    )
    .join("");
  return `<dl class="tv-api-doc-status">${items}</dl>`;
}

function renderEndpointAccordions(options: ApiDocContentOptions, interactive: boolean): string {
  const copyBtn = (key: string, label: string) =>
    interactive
      ? `<div class="tv-api-doc-copy-row">
           <button type="button" class="btn btn-secondary btn-sm tv-api-docs-no-print" data-copy-doc="${key}">
             <span class="material-symbols-outlined" style="font-size:1rem" aria-hidden="true">content_copy</span>
             ${escapeHtml(label)}
           </button>
         </div>`
      : "";

  const sendTitle =
    opts(options).mode === "production"
      ? `${methodBadge("POST")} Enviar SMS productivo <code>/api/v1/sms/send</code>`
      : `${methodBadge("POST")} Enviar SMS sandbox <code>/api/v1/sms/send</code>`;
  const sendHint =
    opts(options).mode === "production"
      ? `<p class="field-hint" style="margin:0.75rem 0 0">Los envíos productivos descuentan saldo SMS real de tu wallet.</p>`
      : `<p class="field-hint" style="margin:0.75rem 0 0">En sandbox no se envía SMS real ni se descuenta saldo.</p>`;
  const sendCopyLabel =
    opts(options).mode === "production" ? "Copiar ejemplo envío productivo" : "Copiar ejemplo envío sandbox";

  return `
    <details class="tv-api-doc-accordion">
      <summary>${methodBadge("GET")} Consultar saldo <code>/api/v1/balance</code></summary>
      <div class="tv-api-doc-accordion__body">
        <div class="tv-api-doc-accordion__meta"><span class="badge badge-muted">Scope</span> <code>balance:read</code></div>
        ${renderCodeBlock(docSnippetBalance(options))}
        ${copyBtn("balance", "Copiar ejemplo balance")}
      </div>
    </details>
    <details class="tv-api-doc-accordion">
      <summary>${sendTitle}</summary>
      <div class="tv-api-doc-accordion__body">
        <div class="tv-api-doc-accordion__meta"><span class="badge badge-muted">Scope</span> <code>sms:send</code></div>
        ${renderCodeBlock(docSnippetSend(options))}
        ${sendHint}
        ${copyBtn("send", sendCopyLabel)}
      </div>
    </details>
    <details class="tv-api-doc-accordion">
      <summary>${methodBadge("GET")} Consultar mensaje <code>/api/v1/messages/:id</code></summary>
      <div class="tv-api-doc-accordion__body">
        <div class="tv-api-doc-accordion__meta"><span class="badge badge-muted">Scope</span> <code>messages:read</code></div>
        ${renderCodeBlock(docSnippetMessageDetail(options))}
        ${copyBtn("message", "Copiar ejemplo consultar mensaje")}
      </div>
    </details>
    <details class="tv-api-doc-accordion">
      <summary>${methodBadge("GET")} Listar mensajes <code>/api/v1/messages</code></summary>
      <div class="tv-api-doc-accordion__body">
        <div class="tv-api-doc-accordion__meta"><span class="badge badge-muted">Scope</span> <code>messages:read</code></div>
        ${renderCodeBlock(docSnippetMessageList(options))}
        ${copyBtn("list", "Copiar ejemplo listar mensajes")}
      </div>
    </details>`;
}

export function renderApiDocumentationBody(options?: {
  interactive?: boolean;
  doc?: ApiDocContentOptions;
}): string {
  const interactive = options?.interactive !== false;
  const doc = opts(options?.doc);
  const flowSteps = getApiDocRecommendedFlow(doc)
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  const idemBullets = getApiDocIdempotencyBullets()
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  const stateBullets = getApiDocCurrentStateBullets(doc)
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  const badge =
    doc.mode === "production"
      ? `<span class="badge badge-ok">Producción activa</span>`
      : `<span class="badge badge-warn">Sandbox / Pendiente</span>`;

  const templates = interactive
    ? `<template id="tv-api-doc-snippet-balance">${docSnippetBalance(doc)}</template>
       <template id="tv-api-doc-snippet-send">${docSnippetSend(doc)}</template>
       <template id="tv-api-doc-snippet-message">${docSnippetMessageDetail(doc)}</template>
       <template id="tv-api-doc-snippet-list">${docSnippetMessageList(doc)}</template>`
    : "";

  return `<article class="tv-api-doc-page">
    <div class="alert ${doc.mode === "production" ? "alert-success" : "alert-warn"}" role="status">${escapeHtml(getApiDocLegalNote(doc))}</div>

    <div class="tv-api-doc-block">
      <h3>A. Resumen</h3>
      <p class="field-hint" style="margin:0 0 0.75rem">${escapeHtml(getApiDocSummary(doc))}</p>
      ${badge}
    </div>

    <div class="tv-api-doc-block">
      <h3>Estado de la API</h3>
      ${renderStatusList(doc)}
    </div>

    <div class="tv-api-doc-block">
      <h3>B. Autenticación</h3>
      ${getApiDocAuthNotes(doc)
        .map((n) => `<p class="field-hint" style="margin:0 0 0.5rem">${escapeHtml(n)}</p>`)
        .join("")}
      ${renderCodeBlock(docSnippetAuthHeader(doc))}
    </div>

    <div class="tv-api-doc-block">
      <h3>C. Endpoints</h3>
      <p class="field-hint" style="margin:0 0 0.75rem">Base URL: <code>${escapeHtml(API_BASE_URL)}</code></p>
      ${renderEndpointAccordions(doc, interactive)}
    </div>

    <div class="tv-api-doc-block">
      <h3>D. Scopes</h3>
      ${renderScopesTable(doc)}
    </div>

    <div class="tv-api-doc-block">
      <h3>E. Errores comunes</h3>
      ${renderErrorsTable(doc)}
    </div>

    <div class="tv-api-doc-block">
      <h3>F. Rate limits</h3>
      ${renderRateLimits(doc)}
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
    .tv-api-doc-hero {
      text-align: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--tv-border);
    }
    .tv-api-doc-hero__logo {
      display: block;
      margin: 0 auto 0.85rem;
    }
    .tv-api-doc-hero__title {
      margin: 0 0 0.35rem;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--tv-text);
    }
    .tv-api-doc-hero__subtitle {
      margin: 0 0 1rem;
      font-size: 1rem;
      color: var(--tv-muted);
    }
    .tv-api-doc-hero__actions {
      justify-content: center;
    }
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

// Compatibilidad con imports legacy (sandbox por defecto).
export const DOC_PLACEHOLDER_KEY = DOC_PLACEHOLDER_KEY_SANDBOX;
export const SANDBOX_API_BASE_URL = API_BASE_URL;
export const API_DOC_SUBTITLE = getApiDocSubtitle();
export const API_DOC_PAGE_SUBTITLE = API_DOC_PAGE_SUBTITLE_SANDBOX;
export const API_DOC_LEGAL_NOTE = getApiDocLegalNote();
