import type { AsmscApiResponse } from "../../../types/asmsc.js";
import { env } from "../../../config/env.js";
import { escapeHtml, formatJson } from "../../../utils/html.js";
import { getConfiguredDlrWebhookUrl } from "../../../utils/dlr-callback.js";
import { pickString } from "../../../utils/asmsc-response.js";
import { responseTextIncludesIpWhitelist } from "../../../utils/asmsc-hints.js";
import type { AdminSessionUser } from "../../../types/admin.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { MOCK_API_LOGS } from "../mock-data.js";
import { renderKpiCard } from "../components.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderCodeBlock,
  renderCollapsible,
  renderHttpBadge,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";

export function renderApiPageBody(options: {
  balanceResult: AsmscApiResponse | null;
  balanceError: string | null;
  publicIp: string | null;
}): string {
  const baseUrl = env.publicAppUrl || "https://agent.telvoice.cl";
  const dlrUrl = getConfiguredDlrWebhookUrl();
  const apiKeyMock = "tv_live_" + "••••••••••••••••" + "8f2a";
  const apiActive = options.balanceResult && !options.balanceError;

  const headerActions = `
    ${renderBtn("Copiar API Key", { variant: "secondary", icon: "content_copy", disabled: true, title: "Próximamente" })}
    ${renderBtn("Regenerar API Key", { variant: "ghost", disabled: true })}
    ${renderBtn("Solicitar activación", { variant: "secondary", disabled: true })}
    <a href="${escapeHtml(env.asmsc.baseUrl)}" target="_blank" rel="noopener" class="btn btn-secondary">Ver documentación</a>
  `;

  const kpis = `<div class="tv-kpi-grid">
    ${renderKpiCard({
      label: "Estado API",
      value: apiActive ? "Activa" : "Revisar",
      hint: apiActive ? "Conectividad aSMSC OK" : options.balanceError ?? "Pendiente verificación",
      icon: "cloud_done",
      variant: apiActive ? "success" : "warn",
    })}
    ${renderKpiCard({ label: "Webhooks", value: "2", hint: "DLR + respuestas (mock)", icon: "webhook" })}
    ${renderKpiCard({ label: "Requests 24h", value: "1.284", hint: "Mock analytics", icon: "monitoring" })}
    ${renderKpiCard({ label: "Errores 24h", value: "12", hint: "Mock · mayoría 401", icon: "error", variant: "danger" })}
  </div>`;

  const endpoints = [
    { name: "Enviar SMS", path: "POST /api/sms/send", status: "mock" },
    { name: "Consultar saldo", path: "GET /api/balance", status: "mock" },
    { name: "Estado de mensaje", path: "GET /api/sms/status/:id", status: "mock" },
    { name: "Listar campañas", path: "GET /api/campaigns", status: "mock" },
    { name: "Webhook DLR", path: dlrUrl, status: "live" },
    { name: "Webhook respuesta", path: `${baseUrl}/api/webhooks/sms/inbound`, status: "mock" },
  ]
    .map(
      (e) => `<div class="tv-endpoint-card">
        <span class="material-symbols-outlined" aria-hidden="true">link</span>
        <div>
          <strong>${escapeHtml(e.name)}</strong>
          <code>${escapeHtml(e.path)}</code>
          <span class="tv-tag tv-tag--${e.status === "live" ? "ok" : "muted"}">${e.status === "live" ? "En producción" : "Próximamente"}</span>
        </div>
      </div>`,
    )
    .join("");

  const logRows = MOCK_API_LOGS.map(
    (l) => `<tr>
      <td>${escapeHtml(l.date)}</td>
      <td><code>${escapeHtml(l.endpoint)}</code></td>
      <td>${escapeHtml(l.method)}</td>
      <td>${renderHttpBadge(l.http)}</td>
      <td>${escapeHtml(l.phone)}</td>
      <td>${escapeHtml(l.result)}</td>
      <td>${escapeHtml(String(l.ms))} ms</td>
    </tr>`,
  ).join("");

  let diagBody = "";
  if (options.balanceError) {
    diagBody = `<div class="alert alert-error">${escapeHtml(options.balanceError)}</div>`;
  } else if (options.balanceResult) {
    const record = options.balanceResult as Record<string, unknown>;
    const balanceAmount = pickString(record, "BalanceAmount", "balance_amount", "balance", "remarks");
    diagBody = `<p>Balance proveedor: <strong>${escapeHtml(balanceAmount ?? "—")}</strong></p>
      <pre style="max-height:200px;overflow:auto">${escapeHtml(formatJson(options.balanceResult))}</pre>`;
  }

  const ipWarning = options.balanceError && responseTextIncludesIpWhitelist(options.balanceError)
    ? `<div class="alert alert-error">IP no autorizada en aSMSC. Agrega <strong>${escapeHtml(options.publicIp ?? "tu IP")}</strong> en whitelist.</div>`
    : "";

  return `
    ${renderPageHeader({
      title: "API Telvoice",
      subtitle:
        "Integra el envío SMS de Telvoice en tu sistema, CRM, ecommerce, plataforma interna o agente automatizado.",
      actions: headerActions,
    })}
    ${kpis}
    <div class="tv-dash-grid tv-dash-grid--2">
      ${renderPanel(
        "Credenciales",
        `<dl class="tv-meta-list">
          <div><dt>API Key</dt><dd><code>${escapeHtml(apiKeyMock)}</code>
            ${renderBtn("Copiar", { variant: "ghost", disabled: true, title: "Mock" })}</dd></div>
          <div><dt>URL base</dt><dd><code>${escapeHtml(baseUrl)}</code></dd></div>
          <div><dt>Modo</dt><dd>Producción</dd></div>
          <div><dt>IPs autorizadas</dt><dd>${escapeHtml(options.publicIp ?? "—")} <span class="tv-tag tv-tag--warn">Editar en aSMSC</span></dd></div>
        </dl>`,
      )}
      ${renderPanel(
        "Ejemplo de request",
        renderCodeBlock(
          `POST /api/sms/send\n\n{\n  "to": "+56912345678",\n  "message": "Tu código de verificación es 4921",\n  "sender": "Telvoice"\n}`,
        ),
      )}
    </div>
    ${renderPanel("Endpoints disponibles", `<div class="tv-endpoint-grid">${endpoints}</div>`)}
    ${renderPanel(
      "Logs API",
      `<div class="table-wrap" style="padding:0">
        <table class="tv-table">
          <thead><tr>
            <th>Fecha</th><th>Endpoint</th><th>Método</th><th>HTTP</th><th>Número</th><th>Resultado</th><th>Tiempo</th>
          </tr></thead>
          <tbody>${logRows}</tbody>
        </table>
      </div>
      <p class="field-hint tv-mock-tag">Tabla mock · conectar logs reales en fase backend.</p>`,
    )}
    ${renderPanel(
      "Webhooks",
      `<dl class="tv-meta-list">
        <div><dt>DLR</dt><dd class="tv-meta-dd--truncate"><code>${escapeHtml(dlrUrl)}</code></dd></div>
        <div><dt>Respuestas entrantes</dt><dd><code>${escapeHtml(baseUrl)}/api/webhooks/sms/inbound</code> <span class="tv-tag tv-tag--muted">Mock</span></dd></div>
        <div><dt>Verificación</dt><dd><span class="tv-tag tv-tag--ok">Activo (DLR)</span></dd></div>
        <div><dt>Última notificación</dt><dd>Hace 4 min (mock)</dd></div>
      </dl>
      <div class="actions-row" style="margin-top:0.75rem">
        ${renderBtn("Probar webhook DLR", { href: "/admin/asmsc/diagnostics", variant: "secondary" })}
        <a href="/admin/settings" class="btn btn-ghost">Configuración</a>
      </div>`,
    )}
    ${renderCollapsible(
      "Diagnóstico técnico aSMSC (conexión actual)",
      `${ipWarning}${diagBody}
       <p class="field-hint">API ID: ${escapeHtml(env.asmsc.apiId || "—")} · Base: ${escapeHtml(env.asmsc.baseUrl)}</p>
       <a href="/admin/asmsc/balance" class="btn btn-secondary btn-sm">Consultar balance proveedor</a>`,
      false,
    )}
    ${renderAdminUiScript()}`;
}

export function renderApiPage(options: {
  admin: AdminSessionUser;
  balanceResult: AsmscApiResponse | null;
  balanceError: string | null;
  publicIp: string | null;
  smsBalance?: string;
}): string {
  return wrapAdminPage({
    admin: options.admin,
    title: "API Telvoice",
    activeNav: "api",
    body: renderApiPageBody(options),
    topbar: { smsBalance: options.smsBalance },
  });
}
