import type { AsmscApiResponse } from "../types/asmsc.js";
import type {
  BalanceLedgerRow,
  BalanceRow,
  ClientTelegramUserRow,
  SmsDlrEventRow,
  SmsMessageRow,
} from "../types/database.js";
import type {
  CommercialQuoteResult,
  PublicLeadRow,
  PublicLeadStatus,
  SmsPricingTierRow,
  SmsProductRow,
} from "../types/commercial.js";
import {
  KNOWLEDGE_CATEGORIES,
  type KnowledgeArticleRow,
} from "../types/knowledge.js";
import { formatClp } from "../utils/clp-format.js";
import { TELEGRAM_USER_ROLES } from "../utils/telegram-user-validation.js";
import type { SmsMessageStats } from "../services/smsMessageService.js";
import type { AdminSessionUser } from "../types/admin.js";
import type { SendTestResult } from "../services/sms.service.js";
import {
  KNOWLEDGE_TEST_EXAMPLES,
  type KnowledgeSimulationResult,
} from "../services/telegramKnowledge.js";
import type {
  TelegramIntentRoute,
  TelegramIntentSimulationResult,
} from "../services/telegramIntentService.js";
import type { TestClientBundle } from "../services/clientService.js";
import { pickString } from "../utils/asmsc-response.js";
import {
  getAsmscRemarksHint,
  isProviderStatusFailed,
  responseTextIncludesIpWhitelist,
} from "../utils/asmsc-hints.js";
import { env } from "../config/env.js";
import {
  extractCallbackUrlFromSubmitResponse,
  getConfiguredDlrWebhookUrl,
  isAwaitingDlr,
} from "../utils/dlr-callback.js";
import {
  maskConnectionUrl,
  maskSupabaseUrl,
  maskTelegramAllowedUserIds,
} from "../utils/mask-secret.js";
import { getTelegramRuntimeStatus } from "../services/telegram/runtime.js";
import { escapeHtml, formatDate, formatJson } from "../utils/html.js";
import { wrapAdminPage } from "./admin-ui/admin-page-wrap.js";
import { renderDashboardBody } from "./admin-ui/dashboard-page.js";
import { renderApiPage } from "./admin-ui/sections/api-page.js";
import { renderBotPage } from "./admin-ui/sections/bot-page.js";
import { renderInboxPage } from "./admin-ui/sections/inbox-page.js";
import { renderSendSmsPageBody } from "./admin-ui/sections/send-sms-page.js";
import { renderLayout, statusBadge } from "./layout.js";

import type { AsmscBalanceSummary } from "../utils/asmsc-balance-summary.js";
export type { AsmscBalanceSummary };

export interface SendTestFormValues {
  phonenumber: string;
  textmessage: string;
  sender_id: string;
  sms_type: string;
  encoding: string;
}

export function renderDashboardPage(options: {
  admin: AdminSessionUser;
  serviceOk: boolean;
  testClient: TestClientBundle | null;
  balance: BalanceRow | null;
  messages: SmsMessageRow[];
  stats: SmsMessageStats | null;
  asmscBalance: AsmscBalanceSummary | null;
  supabaseConfigured: boolean;
  configWarning?: string | null;
  successMessage?: string | null;
  dlrWebhookUrl?: string;
  dashboardSnapshot?: import("../types/adminDashboard.js").AdminDashboardSnapshot | null;
}): string {
  const smsBalance = String(options.balance?.available_units ?? "1,2M");
  const routesOk = options.serviceOk && options.supabaseConfigured;

  return renderLayout({
    title: "Dashboard Superadmin",
    body: renderDashboardBody(options),
    adminName: options.admin.name,
    showNav: true,
    activeNav: "dashboard",
    topbar: {
      smsBalance,
      routesOk,
      routesLabel: routesOk ? "Red global OK" : "Red: revisar",
      companyName: "telvoice · superadmin",
    },
  });
}

export function renderMessageDetailPage(options: {
  admin: AdminSessionUser;
  message: SmsMessageRow;
  clientName: string;
  dlrEvents: SmsDlrEventRow[];
  showSimulateDlr?: boolean;
  simulated?: "delivered" | "failed" | null;
}): string {
  const m = options.message;
  const callbackUsed =
    extractCallbackUrlFromSubmitResponse(m.raw_submit_response) ??
    getConfiguredDlrWebhookUrl();
  const awaitingDlr = isAwaitingDlr(m.status, m.delivered_at);

  const simulatedBlock =
    options.simulated === "delivered"
      ? `<div class="alert alert-success">DLR Delivered simulado aplicado (solo desarrollo).</div>`
      : options.simulated === "failed"
        ? `<div class="alert alert-warn">DLR Failed simulado aplicado (solo desarrollo).</div>`
        : "";

  const dlrWaitBlock = awaitingDlr
    ? `<div class="alert alert-warn">
        <strong>Esperando DLR.</strong> aSMSC debe hacer POST al callback cuando el operador confirme entrega.
      </div>`
    : m.delivered_at
      ? `<div class="alert alert-success">Entregado — ${formatDate(m.delivered_at)}</div>`
      : m.status === "failed"
        ? `<div class="alert alert-error">Estado final: failed</div>`
        : "";

  const simulateBlock = options.showSimulateDlr
    ? `<div class="dlr-actions">
        <form method="post" action="/admin/messages/${escapeHtml(m.id)}/simulate-dlr">
          <button type="submit" class="btn btn-secondary">Simular DLR Delivered</button>
        </form>
        <form method="post" action="/admin/messages/${escapeHtml(m.id)}/simulate-dlr-failed">
          <button type="submit" class="btn btn-danger">Simular DLR Failed</button>
        </form>
      </div>`
    : "";

  const meta = `
    <dl class="meta-grid">
      <div class="meta-item"><dt>ID interno</dt><dd>${escapeHtml(m.id)}</dd></div>
      <div class="meta-item"><dt>UID</dt><dd>${escapeHtml(m.uid)}</dd></div>
      <div class="meta-item"><dt>Cliente</dt><dd>${escapeHtml(options.clientName)}</dd></div>
      <div class="meta-item"><dt>Número destino</dt><dd>${escapeHtml(m.phonenumber)}</dd></div>
      <div class="meta-item"><dt>Sender ID</dt><dd>${escapeHtml(m.sender_id)}</dd></div>
      <div class="meta-item"><dt>SMS type</dt><dd>${escapeHtml(m.sms_type)}</dd></div>
      <div class="meta-item"><dt>Encoding</dt><dd>${escapeHtml(m.encoding)}</dd></div>
      <div class="meta-item"><dt>Segmentos estimados</dt><dd>${escapeHtml(m.estimated_parts)}</dd></div>
      <div class="meta-item"><dt>Provider message ID</dt><dd>${escapeHtml(m.provider_message_id ?? "—")}</dd></div>
      <div class="meta-item"><dt>Provider status</dt><dd>${statusBadge(m.provider_status)}</dd></div>
      <div class="meta-item"><dt>Estado interno</dt><dd>${statusBadge(m.status)}</dd></div>
      <div class="meta-item"><dt>DLR status</dt><dd>${escapeHtml(m.dlr_status ?? "—")}</dd></div>
      <div class="meta-item"><dt>ClientCost</dt><dd>${escapeHtml(m.client_cost ?? "—")}</dd></div>
      <div class="meta-item"><dt>ErrorCode</dt><dd>${escapeHtml(m.error_code ?? "—")}</dd></div>
      <div class="meta-item"><dt>ErrorDescription</dt><dd>${escapeHtml(m.error_description ?? "—")}</dd></div>
      <div class="meta-item"><dt>Callback URL envío</dt><dd style="word-break:break-all">${escapeHtml(callbackUsed)}</dd></div>
      <div class="meta-item"><dt>Fecha creación</dt><dd>${formatDate(m.created_at)}</dd></div>
      <div class="meta-item"><dt>Fecha envío</dt><dd>${formatDate(m.sent_at)}</dd></div>
      <div class="meta-item"><dt>Fecha entrega</dt><dd>${formatDate(m.delivered_at)}</dd></div>
      <div class="meta-item"><dt>Remarks</dt><dd>${escapeHtml(m.remarks ?? "—")}</dd></div>
    </dl>
    <div class="message-box"><strong>Mensaje completo</strong><br>${escapeHtml(m.textmessage)}</div>`;

  const dlrRows = options.dlrEvents
    .map((e) => {
      const raw = e.raw_payload as Record<string, unknown>;
      const remarks = pickString(raw, "Remarks", "remarks");
      return `<tr>
        <td>${formatDate(e.received_at)}</td>
        <td>${escapeHtml(e.dlr_status ?? "—")}</td>
        <td>${escapeHtml(e.error_code ?? "—")}</td>
        <td>${escapeHtml(e.error_description ?? "—")}</td>
        <td>${escapeHtml(e.client_cost ?? "—")}</td>
        <td>${escapeHtml(remarks ?? "—")}</td>
        <td>${escapeHtml(e.provider_message_id ?? "—")}</td>
      </tr>`;
    })
    .join("");

  const dlrEventDetails = options.dlrEvents
    .map(
      (e, i) => `<h3>Evento DLR #${i + 1} — ${formatDate(e.received_at)}</h3>
      <pre>${escapeHtml(formatJson(e.raw_payload))}</pre>`,
    )
    .join("");

  const body = `
    <p><a href="/admin" class="row-link">← Dashboard</a></p>
    <h1>Detalle SMS</h1>
    ${simulatedBlock}
    ${dlrWaitBlock}
    ${simulateBlock}
    <div class="card">${meta}</div>
    <h2>raw_submit_response</h2>
    <pre>${escapeHtml(formatJson(m.raw_submit_response ?? {}))}</pre>
    <h2>raw_dlr_payload</h2>
    <pre>${escapeHtml(formatJson(m.raw_dlr_payload ?? {}))}</pre>
    <h2>Historial DLR (${options.dlrEvents.length})</h2>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead><tr>
          <th>Fecha</th><th>DLR status</th><th>ErrorCode</th><th>ErrorDescription</th>
          <th>ClientCost</th><th>Remarks</th><th>Provider message ID</th>
        </tr></thead>
        <tbody>${dlrRows || '<tr><td colspan="7">Sin eventos DLR.</td></tr>'}</tbody>
      </table>
    </div>
    ${dlrEventDetails}`;

  return renderLayout({
    title: "Detalle SMS",
    body,
    adminName: options.admin.name,
    showNav: true,
  });
}

function telegramUserDisplayName(user: ClientTelegramUserRow): string {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  if (user.telegram_username) {
    return `@${user.telegram_username}`;
  }
  return "—";
}

function renderTelegramUserRoleSelect(selected: string): string {
  const options = TELEGRAM_USER_ROLES.map(
    (role) =>
      `<option value="${role}"${selected === role ? " selected" : ""}>${escapeHtml(role)}</option>`,
  );
  return `<select id="role" name="role" required>${options.join("")}</select>`;
}

function renderTelegramUsersTable(
  users: ClientTelegramUserRow[],
  options?: { showTestButton?: boolean },
): string {
  const rows = users
    .map((u) => {
      const testBtn =
        options?.showTestButton && u.is_active
          ? `<form method="post" action="/admin/clients/test/telegram-users/${escapeHtml(u.id)}/test" style="display:inline;margin-right:0.35rem">
              <button type="submit" class="btn btn-primary btn-sm">Enviar test</button>
            </form>`
          : "";
      const actions = `
        ${testBtn}
        <a href="/admin/clients/test/telegram-users/${escapeHtml(u.id)}/edit" class="btn btn-secondary btn-sm">Editar</a>
        ${
          u.is_active
            ? `<form method="post" action="/admin/clients/test/telegram-users/${escapeHtml(u.id)}/deactivate" style="display:inline;margin-left:0.35rem">
                <button type="submit" class="btn btn-ghost btn-sm">Desactivar</button>
              </form>`
            : ""
        }
        <form method="post" action="/admin/clients/test/telegram-users/${escapeHtml(u.id)}/delete" style="display:inline;margin-left:0.35rem" onsubmit="return confirm('¿Eliminar este usuario Telegram?');">
          <button type="submit" class="btn btn-danger btn-sm">Eliminar</button>
        </form>`;

      return `<tr>
        <td>${escapeHtml(u.telegram_user_id)}</td>
        <td>${escapeHtml(u.telegram_chat_id ?? "—")}</td>
        <td>${escapeHtml(u.telegram_username ? `@${u.telegram_username}` : "—")}</td>
        <td>${escapeHtml(telegramUserDisplayName(u))}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>${u.is_active ? statusBadge("active") : statusBadge("inactive")}</td>
        <td style="white-space:nowrap">${actions}</td>
      </tr>`;
    })
    .join("");

  const colspan = 7;

  return `
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead>
          <tr>
            <th>Telegram User ID</th><th>Chat ID</th><th>Username</th>
            <th>Nombre</th><th>Rol</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${colspan}">Sin usuarios Telegram registrados.</td></tr>`}</tbody>
      </table>
    </div>`;
}

export function renderTestClientPage(options: {
  admin: AdminSessionUser;
  bundle: TestClientBundle;
  balance: BalanceRow | null;
  telegramUsers: ClientTelegramUserRow[];
  successMessage?: string | null;
  telegramTestResult?: string | null;
  telegramTestError?: string | null;
}): string {
  const c = options.bundle.client;
  const a = options.bundle.sms_account;
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";
  const testOk = options.telegramTestResult
    ? `<div class="alert alert-success">${escapeHtml(options.telegramTestResult)}</div>`
    : "";
  const testErr = options.telegramTestError
    ? `<div class="alert alert-error">${escapeHtml(options.telegramTestError)}</div>`
    : "";

  const telegramSection = `
    <h2>Usuarios Telegram autorizados</h2>
    <p class="subtitle">Usuarios en <code>client_telegram_users</code>. Usa <strong>Enviar test</strong> para verificar que el bot puede escribirte en Telegram.</p>
    ${testOk}
    ${testErr}
    ${renderTelegramUsersTable(options.telegramUsers, { showTestButton: true })}
    <div class="actions-row" style="margin-top:1rem">
      <a href="/admin/clients/test/telegram-users" class="btn btn-primary">Agregar usuario Telegram</a>
    </div>`;

  const body = `
    <h1>Cliente de prueba</h1>
    <p class="subtitle">${escapeHtml(c.company_name)}</p>
    ${successBlock}
    <div class="card">
      <dl class="meta-grid">
        <div class="meta-item"><dt>ID</dt><dd>${escapeHtml(c.id)}</dd></div>
        <div class="meta-item"><dt>Email</dt><dd>${escapeHtml(c.email ?? "—")}</dd></div>
        <div class="meta-item"><dt>Estado</dt><dd>${statusBadge(c.status)}</dd></div>
        <div class="meta-item"><dt>Creado</dt><dd>${formatDate(c.created_at)}</dd></div>
      </dl>
    </div>
    <h2>Cuenta SMS aSMSC</h2>
    <div class="card">
      <dl class="meta-grid">
        <div class="meta-item"><dt>Provider</dt><dd>${escapeHtml(a.provider)}</dd></div>
        <div class="meta-item"><dt>API ID</dt><dd>${escapeHtml(a.api_id)}</dd></div>
        <div class="meta-item"><dt>API Password</dt><dd>[redacted]</dd></div>
        <div class="meta-item"><dt>Default sender</dt><dd>${escapeHtml(a.default_sender_id ?? "—")}</dd></div>
        <div class="meta-item"><dt>Estado cuenta</dt><dd>${statusBadge(a.status)}</dd></div>
      </dl>
    </div>
    <h2>Saldo CL</h2>
    ${
      options.balance
        ? `<div class="grid">
            <div class="card"><div class="label">Disponible</div><div class="value">${escapeHtml(options.balance.available_units)}</div></div>
            <div class="card"><div class="label">Reservado</div><div class="value">${escapeHtml(options.balance.reserved_units)}</div></div>
            <div class="card"><div class="label">Consumido</div><div class="value">${escapeHtml(options.balance.consumed_units)}</div></div>
          </div>`
        : `<p class="subtitle">Sin registro de balance.</p>`
    }
    ${telegramSection}`;

  return renderLayout({
    title: "Cliente prueba",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "client",
  });
}

function renderTelegramUserCreateForm(options?: {
  error?: string;
  values?: Record<string, unknown>;
}): string {
  const v = options?.values ?? {};
  const val = (field: string, fallback = ""): string => {
    if (v[field] !== undefined && v[field] !== null) {
      return String(v[field]);
    }
    return fallback;
  };
  const isActive =
    v.is_active === undefined
      ? true
      : v.is_active === "1" ||
        v.is_active === "on" ||
        v.is_active === true;
  const errorBlock = options?.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  return `
    <h2 id="agregar">Agregar usuario Telegram</h2>
    ${errorBlock}
    <div class="card">
      <form method="post" action="/admin/clients/test/telegram-users">
        <div class="form-group">
          <label for="telegram_user_id">Telegram User ID *</label>
          <input id="telegram_user_id" name="telegram_user_id" value="${escapeHtml(val("telegram_user_id"))}" required pattern="[0-9]+" inputmode="numeric" placeholder="123456789" />
          <p class="field-hint">Solo dígitos. Obtén tu ID con @userinfobot en Telegram.</p>
        </div>
        <div class="form-group">
          <label for="telegram_chat_id">Telegram Chat ID</label>
          <input id="telegram_chat_id" name="telegram_chat_id" value="${escapeHtml(val("telegram_chat_id"))}" pattern="[0-9]*" inputmode="numeric" />
        </div>
        <div class="form-group">
          <label for="telegram_username">Username</label>
          <input id="telegram_username" name="telegram_username" value="${escapeHtml(val("telegram_username"))}" placeholder="sin @" />
        </div>
        <div class="form-group">
          <label for="first_name">Nombre</label>
          <input id="first_name" name="first_name" value="${escapeHtml(val("first_name"))}" />
        </div>
        <div class="form-group">
          <label for="last_name">Apellido</label>
          <input id="last_name" name="last_name" value="${escapeHtml(val("last_name"))}" />
        </div>
        <div class="form-group">
          <label for="role">Rol</label>
          ${renderTelegramUserRoleSelect(val("role", "operator"))}
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_active" value="1"${isActive ? " checked" : ""} /> Activo</label>
        </div>
        <div class="form-group">
          <label for="notes">Notas</label>
          <textarea id="notes" name="notes" rows="3">${escapeHtml(val("notes"))}</textarea>
        </div>
        <button type="submit" class="btn btn-primary">Agregar usuario</button>
      </form>
    </div>`;
}

export function renderTelegramUsersListPage(options: {
  admin: AdminSessionUser;
  clientName: string;
  users: ClientTelegramUserRow[];
  successMessage?: string;
  error?: string;
  formError?: string;
  formValues?: Record<string, unknown>;
}): string {
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const body = `
    <p><a href="/admin/clients/test" class="row-link">← Cliente de prueba</a></p>
    <h1>Usuarios Telegram autorizados</h1>
    <p class="subtitle">Cliente ${escapeHtml(options.clientName)} — tabla client_telegram_users</p>
    ${successBlock}
    ${errorBlock}
    <h2>Lista autorizada</h2>
    ${renderTelegramUsersTable(options.users)}
    ${renderTelegramUserCreateForm({ error: options.formError, values: options.formValues })}`;

  return renderLayout({
    title: "Usuarios Telegram",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "client",
  });
}

export function renderTelegramUserFormPage(options: {
  admin: AdminSessionUser;
  clientName: string;
  mode: "create" | "edit";
  user?: ClientTelegramUserRow;
  error?: string;
  values?: Record<string, unknown>;
}): string {
  const isEdit = options.mode === "edit";
  const u = options.user;
  const v = options.values ?? {};

  const val = (field: keyof ClientTelegramUserRow | string, fallback = ""): string => {
    if (v[field] !== undefined && v[field] !== null) {
      return String(v[field]);
    }
    if (u && field in u) {
      const raw = u[field as keyof ClientTelegramUserRow];
      return raw === null || raw === undefined ? fallback : String(raw);
    }
    return fallback;
  };

  const isActive =
    v.is_active !== undefined
      ? v.is_active === "1" || v.is_active === "on" || v.is_active === true
      : u?.is_active ?? true;

  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const userIdField = isEdit
    ? `<div class="form-group">
        <label>Telegram User ID</label>
        <input value="${escapeHtml(u!.telegram_user_id)}" disabled />
        <p class="field-hint">No se puede cambiar el user_id al editar.</p>
      </div>`
    : `<div class="form-group">
        <label for="telegram_user_id">Telegram User ID *</label>
        <input id="telegram_user_id" name="telegram_user_id" value="${escapeHtml(val("telegram_user_id"))}" required pattern="[0-9]+" inputmode="numeric" placeholder="123456789" />
        <p class="field-hint">Solo dígitos. Obtén tu ID con @userinfobot en Telegram.</p>
      </div>`;

  const body = `
    <p><a href="/admin/clients/test/telegram-users" class="row-link">← Usuarios Telegram</a></p>
    <h1>${isEdit ? "Editar usuario Telegram" : "Agregar usuario Telegram"}</h1>
    <p class="subtitle">Cliente ${escapeHtml(options.clientName)}</p>
    ${errorBlock}
    <div class="card">
      <form method="post" action="${isEdit ? `/admin/clients/test/telegram-users/${escapeHtml(u!.id)}/edit` : "/admin/clients/test/telegram-users"}">
        ${userIdField}
        <div class="form-group">
          <label for="telegram_chat_id">Telegram Chat ID</label>
          <input id="telegram_chat_id" name="telegram_chat_id" value="${escapeHtml(val("telegram_chat_id"))}" pattern="[0-9]*" inputmode="numeric" />
        </div>
        <div class="form-group">
          <label for="telegram_username">Username</label>
          <input id="telegram_username" name="telegram_username" value="${escapeHtml(val("telegram_username"))}" placeholder="sin @" />
        </div>
        <div class="form-group">
          <label for="first_name">Nombre</label>
          <input id="first_name" name="first_name" value="${escapeHtml(val("first_name"))}" />
        </div>
        <div class="form-group">
          <label for="last_name">Apellido</label>
          <input id="last_name" name="last_name" value="${escapeHtml(val("last_name"))}" />
        </div>
        <div class="form-group">
          <label for="role">Rol</label>
          ${renderTelegramUserRoleSelect(val("role", "operator"))}
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_active" value="1"${isActive ? " checked" : ""} /> Activo</label>
        </div>
        <div class="form-group">
          <label for="notes">Notas</label>
          <textarea id="notes" name="notes" rows="3">${escapeHtml(val("notes"))}</textarea>
        </div>
        <button type="submit" class="btn btn-primary">${isEdit ? "Guardar cambios" : "Agregar usuario"}</button>
      </form>
    </div>`;

  return renderLayout({
    title: isEdit ? "Editar Telegram" : "Agregar Telegram",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "client",
  });
}

export function renderSendTestFormPage(options: {
  admin: AdminSessionUser;
  error?: string;
  values?: Partial<SendTestFormValues>;
  smsBalance?: string;
}): string {
  return wrapAdminPage({
    admin: options.admin,
    title: "Enviar SMS",
    activeNav: "send",
    body: renderSendSmsPageBody({
      error: options.error,
      values: options.values,
      smsBalance: options.smsBalance,
    }),
    topbar: options.smsBalance ? { smsBalance: options.smsBalance } : undefined,
  });
}

export function renderInboxPageWrapper(options: {
  admin: AdminSessionUser;
  messages?: SmsMessageRow[];
  smsBalance?: string;
}): string {
  return renderInboxPage(options);
}

export function renderSendTestResultPage(options: {
  admin: AdminSessionUser;
  result: SendTestResult;
}): string {
  const r = options.result;
  const failed = isProviderStatusFailed(r.provider_status) || r.status === "failed";
  const remarksHint = getAsmscRemarksHint(r.remarks);

  const statusAlert = failed
    ? `<div class="alert alert-error">
        <strong>El SMS fue rechazado por aSMSC. No se envió al operador.</strong>
        ${r.remarks ? `<br><span style="margin-top:0.5rem;display:block">Proveedor: ${escapeHtml(r.remarks)}</span>` : ""}
        ${remarksHint ? `<br><span style="margin-top:0.5rem;display:block">${escapeHtml(remarksHint)}</span>` : ""}
      </div>`
    : `<div class="alert alert-success">El mensaje fue aceptado por aSMSC y guardado en Supabase.</div>`;

  const title = failed ? "SMS rechazado por aSMSC" : "SMS enviado";

  const body = `
    <p><a href="/admin" class="row-link">← Volver al dashboard</a></p>
    <h1>${title}</h1>
    ${statusAlert}
    <div class="card">
      <dl class="meta-grid">
        <div class="meta-item"><dt>ID interno</dt><dd>${escapeHtml(r.internal_message_id)}</dd></div>
        <div class="meta-item"><dt>UID</dt><dd>${escapeHtml(r.uid)}</dd></div>
        <div class="meta-item"><dt>Provider message ID</dt><dd>${escapeHtml(r.provider_message_id ?? "—")}</dd></div>
        <div class="meta-item"><dt>Provider status</dt><dd>${statusBadge(r.provider_status)}</dd></div>
        <div class="meta-item"><dt>Estado interno</dt><dd>${statusBadge(r.status)}</dd></div>
        <div class="meta-item"><dt>Remarks</dt><dd>${escapeHtml(r.remarks ?? "—")}</dd></div>
      </dl>
    </div>
    <div class="actions-row" style="margin-top:1.5rem">
      <a href="/admin/messages/${escapeHtml(r.internal_message_id)}" class="btn btn-primary">Ver detalle del SMS</a>
      <a href="/admin/sms/send-test" class="btn btn-secondary">Enviar otro</a>
      <a href="/admin" class="btn btn-ghost">Dashboard</a>
    </div>
    <h2>Respuesta del proveedor</h2>
    <pre>${escapeHtml(formatJson(r.provider_response))}</pre>`;

  return renderLayout({
    title: "Resultado SMS",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "send",
  });
}

export function renderCreditFormPage(options: {
  admin: AdminSessionUser;
  clientName: string;
  currentBalance: BalanceRow | null;
  error?: string;
  successMessage?: string | null;
}): string {
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";

  const balanceCards = options.currentBalance
    ? `<div class="grid" style="margin-bottom:1.25rem">
        <div class="card"><div class="label">Disponible (${escapeHtml(options.currentBalance.country_code)})</div><div class="value">${escapeHtml(options.currentBalance.available_units)}</div></div>
        <div class="card"><div class="label">Reservado</div><div class="value">${escapeHtml(options.currentBalance.reserved_units)}</div></div>
        <div class="card"><div class="label">Consumido</div><div class="value">${escapeHtml(options.currentBalance.consumed_units)}</div></div>
      </div>`
    : `<p class="subtitle">Sin saldo registrado para este país. Se creará al acreditar.</p>`;

  const body = `
    <p><a href="/admin" class="row-link">← Dashboard</a> · <a href="/admin/clients/test/ledger" class="row-link">Ver movimientos</a></p>
    <h1>Cargar saldo de prueba</h1>
    <p class="subtitle">Cliente ${escapeHtml(options.clientName)} — movement_type: manual_adjustment</p>
    ${successBlock}
    ${errorBlock}
    <h2>Saldo actual</h2>
    ${balanceCards}
    <div class="card">
      <form method="post" action="/admin/clients/test/credit">
        <div class="form-group">
          <label for="country_code">País (country_code)</label>
          <input id="country_code" name="country_code" value="${escapeHtml(options.currentBalance?.country_code ?? "CL")}" required />
        </div>
        <div class="form-group">
          <label for="units">Unidades a acreditar</label>
          <input id="units" name="units" type="number" min="1" value="1000" required />
        </div>
        <div class="form-group">
          <label for="description">Descripción</label>
          <input id="description" name="description" value="Crédito manual de prueba" />
        </div>
        <button type="submit" class="btn btn-primary">Acreditar saldo</button>
      </form>
    </div>`;

  return renderLayout({
    title: "Cargar saldo",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "credit",
  });
}

export function renderLedgerPage(options: {
  admin: AdminSessionUser;
  clientName: string;
  entries: BalanceLedgerRow[];
}): string {
  const rows = options.entries
    .map(
      (e) => `<tr>
        <td>${formatDate(e.created_at)}</td>
        <td>${escapeHtml(e.movement_type)}</td>
        <td>${escapeHtml(e.country_code)}</td>
        <td>${escapeHtml(e.units)}</td>
        <td>${escapeHtml(e.description ?? "—")}</td>
        <td>${escapeHtml([e.reference_type, e.reference_id].filter(Boolean).join(" / ") || "—")}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <p><a href="/admin" class="row-link">← Dashboard</a> · <a href="/admin/clients/test/credit" class="row-link">Cargar saldo</a></p>
    <h1>Movimientos de saldo</h1>
    <p class="subtitle">Cliente ${escapeHtml(options.clientName)} — balance_ledger</p>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Tipo de movimiento</th><th>País</th>
            <th>Unidades</th><th>Descripción</th><th>Referencia</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6">Sin movimientos registrados.</td></tr>'}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Movimientos de saldo",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "credit",
  });
}

export function renderSettingsPage(options: { admin: AdminSessionUser }): string {
  const body = `
    <h1>Configuración</h1>
    <p class="subtitle">Solo lectura — secretos y contraseñas no se muestran.</p>
    <div class="card">
      <dl class="meta-grid">
        <div class="meta-item"><dt>NODE_ENV</dt><dd>${escapeHtml(env.nodeEnv)}</dd></div>
        <div class="meta-item"><dt>PUBLIC_APP_URL</dt><dd>${escapeHtml(env.publicAppUrl || "—")}</dd></div>
        <div class="meta-item"><dt>PUBLIC_WEBHOOK_BASE_URL</dt><dd style="word-break:break-all">${escapeHtml(env.publicWebhookBaseUrl || "—")}</dd></div>
        <div class="meta-item"><dt>Callback DLR</dt><dd style="word-break:break-all">${escapeHtml(getConfiguredDlrWebhookUrl())}</dd></div>
        <div class="meta-item"><dt>ASMSC_BASE_URL</dt><dd>${escapeHtml(env.asmsc.baseUrl)}</dd></div>
        <div class="meta-item"><dt>ASMSC_API_ID</dt><dd>${escapeHtml(env.asmsc.apiId || "(no configurado)")}</dd></div>
        <div class="meta-item"><dt>ASMSC_DEFAULT_SENDER_ID</dt><dd>${escapeHtml(env.asmsc.defaultSenderId || "—")}</dd></div>
        <div class="meta-item"><dt>ASMSC_DEFAULT_SMS_TYPE</dt><dd>${escapeHtml(env.asmsc.defaultSmsType)}</dd></div>
        <div class="meta-item"><dt>SUPABASE_URL</dt><dd style="word-break:break-all">${escapeHtml(maskSupabaseUrl(env.supabase.url) || "—")}</dd></div>
        <div class="meta-item"><dt>DATABASE_URL</dt><dd>${escapeHtml(maskConnectionUrl(env.databaseUrl))}</dd></div>
        <div class="meta-item"><dt>SUPERADMIN_EMAIL</dt><dd>${escapeHtml(env.admin.superadminEmail || "—")}</dd></div>
      </dl>
    </div>
    <h2 style="margin-top:2rem">Telegram</h2>
    <div class="card">
      <dl class="meta-grid">
        <div class="meta-item"><dt>TELEGRAM_BOT_TOKEN</dt><dd>${env.telegram.botToken ? "configurado" : "no configurado"}</dd></div>
        <div class="meta-item"><dt>TELEGRAM_MODE</dt><dd>${escapeHtml(env.telegram.mode)}</dd></div>
        <div class="meta-item"><dt>TELEGRAM_ALLOWED_USER_IDS (.env)</dt><dd>${escapeHtml(maskTelegramAllowedUserIds(env.telegram.allowedUserIds))}</dd></div>
        <div class="meta-item"><dt>TELEGRAM_WEBHOOK_PATH</dt><dd>${escapeHtml(env.telegram.webhookPath)}</dd></div>
      </dl>
      <p class="field-hint" style="margin-top:0.75rem">
        Los usuarios Telegram autorizados por cliente se administran desde
        <a href="/admin/clients/test" class="row-link">Cliente prueba</a> →
        <a href="/admin/clients/test/telegram-users" class="row-link">Usuarios Telegram autorizados</a>.
      </p>
      <p class="field-hint"><a href="/admin/telegram/diagnostics" class="row-link">Diagnóstico Telegram →</a></p>
    </div>
    <p class="field-hint">No expuestos: ASMSC_API_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, SESSION_SECRET, TELEGRAM_BOT_TOKEN.</p>`;

  return renderLayout({
    title: "Configuración",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "settings",
  });
}

export function renderAsmscBalancePage(options: {
  admin: AdminSessionUser;
  provider: AsmscApiResponse;
  error?: string;
}): string {
  if (options.error) {
    const body = `
      <p><a href="/admin" class="row-link">← Volver al dashboard</a></p>
      <h1>Balance aSMSC</h1>
      <div class="alert alert-error">${escapeHtml(options.error)}</div>`;
    return renderLayout({
      title: "Balance aSMSC",
      body,
      adminName: options.admin.name,
      showNav: true,
      activeNav: "diagnostics",
    });
  }

  const record = options.provider as Record<string, unknown>;
  const balanceAmount = pickString(
    record,
    "BalanceAmount",
    "balance_amount",
    "balance",
  );
  const currencyCode = pickString(
    record,
    "CurrenceCode",
    "CurrencyCode",
    "currency_code",
  );

  const ipWarning = responseTextIncludesIpWhitelist(
    JSON.stringify(options.provider),
  )
    ? `<div class="alert alert-error">La IP pública del servidor no está autorizada en aSMSC. Agrega la IP en API → Add Whitelist IP.</div>`
    : "";

  const body = `
    <p><a href="/admin" class="row-link">← Volver al dashboard</a></p>
    <h1>Balance aSMSC (proveedor)</h1>
    ${ipWarning}
    <div class="grid" style="margin-bottom:1.5rem">
      <div class="card">
        <div class="label">BalanceAmount</div>
        <div class="value">${escapeHtml(balanceAmount ?? "—")}</div>
      </div>
      <div class="card">
        <div class="label">CurrenceCode</div>
        <div class="value">${escapeHtml(currencyCode ?? "—")}</div>
      </div>
    </div>
    <h2>Respuesta completa</h2>
    <pre>${escapeHtml(formatJson(options.provider))}</pre>`;

  return renderLayout({
    title: "Balance aSMSC",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "diagnostics",
  });
}

export function renderAsmscDiagnosticsPage(options: {
  admin: AdminSessionUser;
  balanceResult: AsmscApiResponse | null;
  balanceError: string | null;
  publicIp: string | null;
  smsBalance?: string;
}): string {
  return renderApiPage({
    admin: options.admin,
    balanceResult: options.balanceResult,
    balanceError: options.balanceError,
    publicIp: options.publicIp,
    smsBalance: options.smsBalance,
  });
}

export function renderTelegramDiagnosticsPage(options: {
  admin: AdminSessionUser;
  clientName: string;
  telegramUsers: ClientTelegramUserRow[];
  getMeOk: boolean;
  knowledgeTableOk: boolean;
  knowledgeActiveCount: number;
  knowledgeRecent: KnowledgeArticleRow[];
  testResult?: string | null;
  testError?: string | null;
  formError?: string | null;
}): string {
  const runtime = getTelegramRuntimeStatus();
  const tokenStatus = env.telegram.botToken ? "configurado" : "no configurado";
  const bot = runtime.botInfo;
  const getMeStatus = options.getMeOk && bot ? "OK" : "Error / no disponible";

  const botBlock = bot
    ? `<div class="grid">
        <div class="card"><div class="label">Estado getMe()</div><div class="value">${escapeHtml(getMeStatus)}</div></div>
        <div class="card"><div class="label">Bot ID</div><div class="value">${escapeHtml(bot.id)}</div></div>
        <div class="card"><div class="label">Username</div><div class="value">@${escapeHtml(bot.username ?? "—")}</div></div>
        <div class="card"><div class="label">Nombre del bot</div><div class="value">${escapeHtml(bot.first_name)}</div></div>
      </div>`
    : `<p class="subtitle">getMe() falló. Verifica TELEGRAM_BOT_TOKEN y que el servidor esté en ejecución con TELEGRAM_MODE=polling.</p>`;

  const errorBlock = runtime.lastError
    ? `<div class="alert alert-error">${escapeHtml(runtime.lastError)}</div>`
    : `<div class="alert alert-success">Sin errores recientes en runtime Telegram.</div>`;

  const diagnosticsExtra = `
    <div class="card" style="margin-top:1rem">
      <dl class="meta-grid">
        <div class="meta-item"><dt>TELEGRAM_BOT_TOKEN</dt><dd>${escapeHtml(tokenStatus)}</dd></div>
        <div class="meta-item"><dt>TELEGRAM_MODE</dt><dd>${escapeHtml(env.telegram.mode)}</dd></div>
        <div class="meta-item"><dt>Polling activo</dt><dd>${runtime.pollingActive ? "sí" : "no"}</dd></div>
      </dl>
    </div>
    <h3 style="margin-top:1rem">getMe()</h3>
    ${botBlock}
    <h3>Último error</h3>
    ${errorBlock}
    <h3>Base de conocimiento</h3>
    <p>Artículos activos: ${escapeHtml(options.knowledgeActiveCount)} · Tabla ${options.knowledgeTableOk ? "OK" : "error"}</p>
    <h3>Usuarios Telegram — ${escapeHtml(options.clientName)}</h3>
    ${renderTelegramUsersTable(options.telegramUsers, { showTestButton: true })}`;

  return renderBotPage({
    admin: options.admin,
    clientName: options.clientName,
    telegramUsers: options.telegramUsers,
    getMeOk: options.getMeOk,
    knowledgeTableOk: options.knowledgeTableOk,
    knowledgeActiveCount: options.knowledgeActiveCount,
    testResult: options.testResult,
    testError: options.testError,
    formError: options.formError,
    diagnosticsExtraHtml: diagnosticsExtra,
  });
}

function renderKnowledgeCategorySelect(selected: string): string {
  const options = KNOWLEDGE_CATEGORIES.map(
    (cat) =>
      `<option value="${cat}"${selected === cat ? " selected" : ""}>${escapeHtml(cat)}</option>`,
  );
  return `<select id="category" name="category" required>${options.join("")}</select>`;
}

export function renderKnowledgeListPage(options: {
  admin: AdminSessionUser;
  articles: KnowledgeArticleRow[];
  searchQuery?: string;
  successMessage?: string;
  error?: string;
}): string {
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const rows = options.articles
    .map(
      (a) => {
        const fromQ = a.source_unanswered_question_id
          ? `<a href="/admin/agent-training/unanswered" class="tv-tag" title="Desde entrenamiento">desde pregunta</a>`
          : "";
        return `<tr>
        <td>${escapeHtml(a.title)} ${fromQ}</td>
        <td>${escapeHtml(a.category)}</td>
        <td>${escapeHtml((a.keywords ?? []).join(", ") || "—")}</td>
        <td>${a.is_active ? statusBadge("active") : statusBadge("inactive")}</td>
        <td style="white-space:nowrap">
          <a href="/admin/knowledge/${escapeHtml(a.id)}/edit" class="btn btn-secondary btn-sm">Editar</a>
          <form method="post" action="/admin/knowledge/${escapeHtml(a.id)}/delete" style="display:inline;margin-left:0.35rem" onsubmit="return confirm('¿Eliminar este artículo?');">
            <button type="submit" class="btn btn-danger btn-sm">Eliminar</button>
          </form>
        </td>
      </tr>`;
      },
    )
    .join("");

  const body = `
    <h1>Base de conocimiento Telvoice</h1>
    <p class="subtitle">Contenido que usa el bot Telegram para responder preguntas operativas y comerciales.</p>
    ${successBlock}
    ${errorBlock}
    <div class="actions-row">
      <a href="/admin/knowledge/new" class="btn btn-primary">Nuevo artículo</a>
      <a href="/admin/knowledge/test" class="btn btn-secondary">Probar base Telvoice</a>
    </div>
    <div class="card" style="margin-bottom:1.25rem">
      <form method="get" action="/admin/knowledge" class="actions-row" style="margin:0;align-items:flex-end">
        <div class="form-group" style="flex:1;margin:0">
          <label for="q">Buscar</label>
          <input id="q" name="q" value="${escapeHtml(options.searchQuery ?? "")}" placeholder="dlr, submitted, ip whitelist..." />
        </div>
        <button type="submit" class="btn btn-secondary">Buscar</button>
        ${options.searchQuery ? `<a href="/admin/knowledge" class="btn btn-ghost">Limpiar</a>` : ""}
      </form>
    </div>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead>
          <tr><th>Título</th><th>Categoría</th><th>Keywords</th><th>Estado</th><th>Acciones</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5">Sin artículos. Crea el primero o ejecuta la migración 004.</td></tr>'}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Base Telvoice",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "knowledge",
  });
}

export function renderKnowledgeFormPage(options: {
  admin: AdminSessionUser;
  mode: "create" | "edit";
  article?: KnowledgeArticleRow;
  error?: string;
  values?: Record<string, unknown>;
}): string {
  const isEdit = options.mode === "edit";
  const a = options.article;
  const v = options.values ?? {};

  const val = (field: string, fallback = ""): string => {
    if (v[field] !== undefined && v[field] !== null) {
      return String(v[field]);
    }
    if (a && field in a) {
      const raw = a[field as keyof KnowledgeArticleRow];
      if (field === "keywords" && Array.isArray(raw)) {
        return raw.join(", ");
      }
      return raw === null || raw === undefined ? fallback : String(raw);
    }
    return fallback;
  };

  const isActive =
    v.is_active !== undefined
      ? v.is_active === "1" || v.is_active === "on" || v.is_active === true
      : (a?.is_active ?? true);

  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const body = `
    <p><a href="/admin/knowledge" class="row-link">← Base Telvoice</a></p>
    <h1>${isEdit ? "Editar artículo" : "Nuevo artículo"}</h1>
    ${errorBlock}
    <div class="card">
      <form method="post" action="${isEdit ? `/admin/knowledge/${escapeHtml(a!.id)}/edit` : "/admin/knowledge"}">
        <div class="form-group">
          <label for="title">Título</label>
          <input id="title" name="title" value="${escapeHtml(val("title"))}" required />
        </div>
        <div class="form-group">
          <label for="category">Categoría</label>
          ${renderKnowledgeCategorySelect(val("category", "sms"))}
        </div>
        <div class="form-group">
          <label for="keywords">Keywords (separadas por coma)</label>
          <input id="keywords" name="keywords" value="${escapeHtml(val("keywords"))}" placeholder="dlr, submitted, localhost" />
        </div>
        <div class="form-group">
          <label for="content">Contenido</label>
          <textarea id="content" name="content" rows="8" required>${escapeHtml(val("content"))}</textarea>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_active" value="1"${isActive ? " checked" : ""} /> Activo</label>
        </div>
        <button type="submit" class="btn btn-primary">${isEdit ? "Guardar" : "Crear artículo"}</button>
      </form>
    </div>`;

  return renderLayout({
    title: isEdit ? "Editar artículo" : "Nuevo artículo",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "knowledge",
  });
}

export function renderKnowledgeTestPage(options: {
  admin: AdminSessionUser;
  question?: string;
  error?: string;
  simulation?: KnowledgeSimulationResult;
}): string {
  const question = options.question ?? "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const examplesList = KNOWLEDGE_TEST_EXAMPLES.map(
    (example) =>
      `<li><a href="/admin/knowledge/test?q=${encodeURIComponent(example)}" class="row-link">${escapeHtml(example)}</a></li>`,
  ).join("");

  let resultBlock = "";
  const sim = options.simulation;
  if (sim) {
    const best = sim.results[0];
    const candidatesBlock =
      sim.candidates.length > 0
        ? `<h3>Candidatos evaluados (score)</h3>
          <div class="card table-wrap" style="padding:0;margin-bottom:1rem">
            <table>
              <thead>
                <tr><th>Título</th><th>Categoría</th><th>Score</th></tr>
              </thead>
              <tbody>${sim.candidates
                .map(
                  (r) => `<tr>
                    <td>${escapeHtml(r.article.title)}</td>
                    <td>${escapeHtml(r.article.category)}</td>
                    <td>${escapeHtml(String(r.score))}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>
          </div>`
        : "";

    if (!best) {
      const thresholdHint = sim.belowThreshold
        ? `<p class="field-hint">El mejor candidato no alcanzó el umbral mínimo de score (10). El bot no respondería con un artículo incorrecto.</p>`
        : "";
      resultBlock = `
        <h2>Resultado</h2>
        <div class="alert alert-warn">${escapeHtml(sim.telegramReply)}</div>
        <dl class="meta-grid">
          <div class="meta-item"><dt>Pregunta</dt><dd>${escapeHtml(sim.question)}</dd></div>
          <div class="meta-item"><dt>Resultado elegido</dt><dd>— (sin coincidencia suficiente)</dd></div>
        </dl>
        ${thresholdHint}
        ${candidatesBlock}`;
    } else {
      const related = sim.results.slice(1);
      const relatedBlock =
        related.length > 0
          ? `<h3>Artículos relacionados (con score)</h3>
            <div class="card table-wrap" style="padding:0">
              <table>
                <thead>
                  <tr><th>Título</th><th>Categoría</th><th>Score</th></tr>
                </thead>
                <tbody>${related
                  .map(
                    (r) => `<tr>
                      <td>${escapeHtml(r.article.title)}</td>
                      <td>${escapeHtml(r.article.category)}</td>
                      <td>${escapeHtml(String(r.score))}</td>
                    </tr>`,
                  )
                  .join("")}</tbody>
              </table>
            </div>`
          : "";

      resultBlock = `
        <h2>Resultado</h2>
        <dl class="meta-grid">
          <div class="meta-item"><dt>Pregunta</dt><dd>${escapeHtml(sim.question)}</dd></div>
          <div class="meta-item"><dt>Resultado elegido</dt><dd>${escapeHtml(best.article.title)}</dd></div>
          <div class="meta-item"><dt>Score</dt><dd>${escapeHtml(String(best.score))}</dd></div>
          <div class="meta-item"><dt>Categoría</dt><dd>${escapeHtml(best.article.category)}</dd></div>
          <div class="meta-item"><dt>Keywords</dt><dd>${escapeHtml((best.article.keywords ?? []).join(", ") || "—")}</dd></div>
        </dl>
        ${relatedBlock}
        <h3>Mensaje final que enviaría Telegram</h3>
        <div class="message-box">${escapeHtml(sim.telegramReply)}</div>
        ${candidatesBlock}`;
    }
  }

  const body = `
    <p><a href="/admin/knowledge" class="row-link">← Base Telvoice</a></p>
    <h1>Probar base Telvoice</h1>
    <p class="subtitle">Simula cómo respondería el bot Telegram usando la misma búsqueda y formato de mensaje (sin IA externa).</p>
    ${errorBlock}
    <div class="card">
      <form method="post" action="/admin/knowledge/test">
        <div class="form-group">
          <label for="question">Pregunta</label>
          <textarea id="question" name="question" rows="3" required placeholder="Ej: qué significa submitted">${escapeHtml(question)}</textarea>
        </div>
        <button type="submit" class="btn btn-primary">Probar respuesta</button>
      </form>
    </div>
    <h2>Ejemplos sugeridos</h2>
    <ul class="subtitle" style="margin-top:0">${examplesList}</ul>
    ${resultBlock}`;

  return renderLayout({
    title: "Probar base Telvoice",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "knowledge-test",
  });
}

export function renderProductsListPage(options: {
  admin: AdminSessionUser;
  products: SmsProductRow[];
  successMessage?: string;
  error?: string;
}): string {
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const rows = options.products
    .map(
      (p) => `<tr>
        <td>${escapeHtml(p.product_name)}</td>
        <td>${escapeHtml(p.country_code)}</td>
        <td>${p.sms_quantity.toLocaleString("es-CL")}</td>
        <td>${formatClp(p.price_amount)} + IVA</td>
        <td>$${escapeHtml(String(p.unit_price))}</td>
        <td>${p.is_featured ? statusBadge("active") : "—"}</td>
        <td>${p.is_active ? statusBadge("active") : statusBadge("inactive")}</td>
        <td>${p.checkout_url ? "sí" : "—"}</td>
        <td><a href="/admin/products/${escapeHtml(p.id)}/edit" class="btn btn-secondary btn-sm">Editar</a></td>
      </tr>`,
    )
    .join("");

  const body = `
    <h1>Productos SMS Telvoice.cl</h1>
    <p class="subtitle">Catálogo comercial Chile — precios publicados y links MercadoPago.</p>
    <p class="field-hint">API pública: <code>GET /api/public/products</code> · <code>POST /api/public/quote</code></p>
    ${successBlock}
    ${errorBlock}
    <div class="actions-row">
      <a href="/admin/calculator" class="btn btn-primary">Calculadora Telvoice.cl</a>
      <a href="/admin/products/new" class="btn btn-secondary">Nuevo producto</a>
      <a href="/admin/leads" class="btn btn-secondary">Ver leads</a>
    </div>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead>
          <tr><th>Producto</th><th>País</th><th>SMS</th><th>Precio</th><th>Unit.</th><th>Destacado</th><th>Estado</th><th>Checkout</th><th></th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="9">Sin productos. Ejecuta migración 006.</td></tr>'}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Productos SMS",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "products",
  });
}

export function renderProductFormPage(options: {
  admin: AdminSessionUser;
  mode: "create" | "edit";
  product?: SmsProductRow;
  error?: string;
  values?: Record<string, unknown>;
}): string {
  const p = options.product;
  const v = options.values ?? {};
  const val = (field: string, fallback = ""): string => {
    if (v[field] !== undefined && v[field] !== null) {
      return String(v[field]);
    }
    if (p && field in p) {
      const raw = p[field as keyof SmsProductRow];
      return raw === null || raw === undefined ? fallback : String(raw);
    }
    return fallback;
  };

  const isFeatured =
    v.is_featured !== undefined
      ? v.is_featured === "1" || v.is_featured === "on"
      : (p?.is_featured ?? false);
  const isActive =
    v.is_active !== undefined
      ? v.is_active === "1" || v.is_active === "on" || v.is_active === true
      : (p?.is_active ?? true);
  const productType = val("product_type", p?.product_type ?? "sms_bundle");

  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const body = `
    <p><a href="/admin/products" class="row-link">← Productos SMS</a></p>
    <h1>${options.mode === "edit" ? "Editar producto" : "Nuevo producto"}</h1>
    ${errorBlock}
    <div class="card">
      <form method="post" action="${options.mode === "edit" ? `/admin/products/${escapeHtml(p!.id)}/edit` : "/admin/products"}">
        <div class="form-group">
          <label for="product_name">Nombre</label>
          <input id="product_name" name="product_name" value="${escapeHtml(val("product_name"))}" required />
        </div>
        <div class="grid">
          <div class="form-group">
            <label for="country_code">Código país</label>
            <input id="country_code" name="country_code" value="${escapeHtml(val("country_code", "CL"))}" />
          </div>
          <div class="form-group">
            <label for="country_name">País</label>
            <input id="country_name" name="country_name" value="${escapeHtml(val("country_name", "Chile"))}" />
          </div>
        </div>
        <div class="form-group">
          <label for="description">Descripción</label>
          <textarea id="description" name="description" rows="2">${escapeHtml(val("description"))}</textarea>
        </div>
        <div class="grid">
          <div class="form-group">
            <label for="sms_quantity">Cantidad SMS</label>
            <input id="sms_quantity" name="sms_quantity" type="number" min="1" value="${escapeHtml(val("sms_quantity", "1000"))}" required />
          </div>
          <div class="form-group">
            <label for="price_amount">Precio CLP (+ IVA)</label>
            <input id="price_amount" name="price_amount" type="number" min="0" value="${escapeHtml(val("price_amount", "0"))}" required />
          </div>
          <div class="form-group">
            <label for="unit_price">Precio unitario CLP</label>
            <input id="unit_price" name="unit_price" type="number" min="0" step="0.01" value="${escapeHtml(val("unit_price", "10"))}" required />
          </div>
        </div>
        <div class="form-group">
          <label for="checkout_url">Checkout URL (MercadoPago)</label>
          <input id="checkout_url" name="checkout_url" type="url" value="${escapeHtml(val("checkout_url"))}" placeholder="https://..." />
        </div>
        <div class="form-group">
          <label for="product_type">Tipo</label>
          <select id="product_type" name="product_type">
            <option value="sms_bundle"${productType === "sms_bundle" ? " selected" : ""}>sms_bundle</option>
            <option value="custom_quote"${productType === "custom_quote" ? " selected" : ""}>custom_quote</option>
          </select>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_featured" value="1"${isFeatured ? " checked" : ""} /> Destacado</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_active" value="1"${isActive ? " checked" : ""} /> Activo</label>
        </div>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </form>
    </div>`;

  return renderLayout({
    title: options.mode === "edit" ? "Editar producto" : "Nuevo producto",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "products",
  });
}

export function renderLeadsListPage(options: {
  admin: AdminSessionUser;
  leads: PublicLeadRow[];
  filterStatus?: PublicLeadStatus;
  successMessage?: string;
}): string {
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";

  const rows = options.leads
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.name ?? l.company ?? "—")}</td>
        <td>${escapeHtml(l.email ?? "—")}</td>
        <td>${escapeHtml(l.phone ?? "—")}</td>
        <td>${l.requested_quantity?.toLocaleString("es-CL") ?? "—"}</td>
        <td>${escapeHtml(l.source)}</td>
        <td>${statusBadge(l.status)}</td>
        <td>${escapeHtml(new Date(l.created_at).toLocaleString("es-CL"))}</td>
        <td>
          <form method="post" action="/admin/leads/${escapeHtml(l.id)}/status" style="display:inline">
            <select name="status" onchange="this.form.submit()">
              <option value="new"${l.status === "new" ? " selected" : ""}>new</option>
              <option value="contacted"${l.status === "contacted" ? " selected" : ""}>contacted</option>
              <option value="closed"${l.status === "closed" ? " selected" : ""}>closed</option>
            </select>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  const body = `
    <h1>Leads comerciales</h1>
    <p class="subtitle">Solicitudes desde Telegram y landing (Telvoice.cl).</p>
    <p class="field-hint">API: <code>POST /api/public/lead</code></p>
    ${successBlock}
    <div class="actions-row">
      <a href="/admin/products" class="btn btn-secondary">Productos SMS</a>
      <a href="/admin/leads" class="btn btn-ghost">Todos</a>
      <a href="/admin/leads?status=new" class="btn btn-ghost">Nuevos</a>
    </div>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead>
          <tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>SMS</th><th>Origen</th><th>Estado</th><th>Fecha</th><th>Cambiar</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="8">Sin leads registrados.</td></tr>'}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Leads comerciales",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "leads",
  });
}

export function renderCalculatorTestPage(options: {
  admin: AdminSessionUser;
  tiers: SmsPricingTierRow[];
  allTiers?: SmsPricingTierRow[];
  isSuperAdmin?: boolean;
  quantity?: number;
  quote?: CommercialQuoteResult | null;
  error?: string;
  successMessage?: string;
}): string {
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";
  const successBlock = options.successMessage
    ? `<div class="alert alert-ok">${escapeHtml(options.successMessage)}</div>`
    : "";

  const displayTiers = options.allTiers ?? options.tiers;
  const canEdit = options.isSuperAdmin === true;

  const tierRowsReadonly =
    options.tiers.length > 0
      ? options.tiers
          .map(
            (t) => `<tr>
            <td>${escapeHtml(t.label)}</td>
            <td>${t.min_quantity.toLocaleString("es-CL")}</td>
            <td>$${escapeHtml(String(t.unit_price))} + IVA</td>
            <td>${t.is_active ? statusBadge("active") : statusBadge("inactive")}</td>
            <td>—</td>
          </tr>`,
          )
          .join("")
      : `<tr><td colspan="5">Sin tramos activos en BD — se usa fallback temporal.</td></tr>`;

  const tierRowsEditable = displayTiers
    .map(
      (t) => `<tr data-tier-id="${escapeHtml(t.id)}">
        <td><input type="text" class="tier-label" value="${escapeHtml(t.label)}" ${canEdit ? "" : "disabled"} /></td>
        <td><input type="number" class="tier-min-sms" min="1000" step="1000" value="${t.min_quantity}" ${canEdit ? "" : "disabled"} style="max-width:7rem" /></td>
        <td><input type="number" class="tier-unit-price" min="0.01" step="0.01" value="${escapeHtml(String(t.unit_price))}" ${canEdit ? "" : "disabled"} style="max-width:5rem" /> <span class="field-hint">+ IVA</span></td>
        <td>
          <label><input type="checkbox" class="tier-active" ${t.is_active ? "checked" : ""} ${canEdit ? "" : "disabled"} /> ${t.is_active ? "Activo" : "Inactivo"}</label>
        </td>
        <td>${canEdit ? `<button type="button" class="btn btn-secondary btn-sm tier-save-btn" data-tier-id="${escapeHtml(t.id)}">Guardar</button>` : "—"}</td>
      </tr>`,
    )
    .join("");

  let resultBlock = "";
  if (options.quote) {
    const q = options.quote;
    const roundedNote =
      q.was_rounded && q.requested_quantity !== q.quoted_quantity
        ? `<div class="meta-item"><dt>Cantidad facturable</dt><dd>${q.quoted_quantity.toLocaleString("es-CL")} SMS</dd></div>`
        : "";
    resultBlock = `
      <h2>Resultado de cotización</h2>
      <dl class="meta-grid">
        <div class="meta-item"><dt>Cantidad solicitada</dt><dd>${q.requested_quantity.toLocaleString("es-CL")} SMS</dd></div>
        ${roundedNote}
        <div class="meta-item"><dt>Tramo aplicado</dt><dd>${escapeHtml(q.tier_label)}</dd></div>
        <div class="meta-item"><dt>Precio unitario</dt><dd>$${q.unit_price} + IVA</dd></div>
        <div class="meta-item"><dt>Subtotal neto</dt><dd>${formatClp(q.subtotal)}</dd></div>
        <div class="meta-item"><dt>IVA 19%</dt><dd>${formatClp(q.iva)}</dd></div>
        <div class="meta-item"><dt>Total</dt><dd>${formatClp(q.total_with_iva)}</dd></div>
      </dl>`;
  }

  const editControls = canEdit
    ? `<div class="actions-row" style="margin-bottom:1rem">
        <button type="button" id="pricing-edit-btn" class="btn btn-secondary">Editar precios</button>
        <button type="button" id="pricing-new-tier-btn" class="btn btn-secondary" hidden>Nuevo tramo</button>
        <button type="button" id="pricing-save-all-btn" class="btn btn-primary" hidden>Guardar cambios</button>
        <button type="button" id="pricing-cancel-btn" class="btn btn-secondary" hidden>Cancelar</button>
      </div>
      <div id="pricing-edit-alert" class="alert" hidden></div>`
    : `<p class="field-hint">Solo superadmin puede editar tramos de precio.</p>`;

  const pricingScript = canEdit
    ? `<script>
(function () {
  var editBtn = document.getElementById("pricing-edit-btn");
  var newBtn = document.getElementById("pricing-new-tier-btn");
  var saveAllBtn = document.getElementById("pricing-save-all-btn");
  var cancelBtn = document.getElementById("pricing-cancel-btn");
  var alertEl = document.getElementById("pricing-edit-alert");
  var tbody = document.getElementById("pricing-tiers-tbody");
  var editMode = false;
  var pendingRows = [];

  function showAlert(msg, ok) {
    if (!alertEl) return;
    alertEl.hidden = false;
    alertEl.className = "alert " + (ok ? "alert-ok" : "alert-error");
    alertEl.textContent = msg;
  }

  function setEditMode(on) {
    editMode = on;
    if (editBtn) editBtn.hidden = on;
    if (newBtn) newBtn.hidden = !on;
    if (saveAllBtn) saveAllBtn.hidden = !on;
    if (cancelBtn) cancelBtn.hidden = !on;
    document.querySelectorAll("#pricing-tiers-table .tier-label, #pricing-tiers-table .tier-min-sms, #pricing-tiers-table .tier-unit-price, #pricing-tiers-table .tier-active").forEach(function (el) {
      el.disabled = !on;
    });
    document.querySelectorAll(".tier-save-btn").forEach(function (btn) {
      btn.hidden = !on;
    });
  }

  function rowData(tr) {
    return {
      id: tr.getAttribute("data-tier-id") || "",
      label: tr.querySelector(".tier-label").value.trim(),
      min_sms: Number(tr.querySelector(".tier-min-sms").value),
      unit_price: Number(tr.querySelector(".tier-unit-price").value),
      active: tr.querySelector(".tier-active").checked,
    };
  }

  async function saveTier(data, isNew) {
    var url = isNew ? "/api/admin/sms-pricing-tiers" : "/api/admin/sms-pricing-tiers/" + encodeURIComponent(data.id);
    var method = isNew ? "POST" : "PATCH";
    var body = {
      label: data.label,
      min_sms: data.min_sms,
      unit_price: data.unit_price,
      active: data.active,
      is_active: data.active,
    };
    var res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    var json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || "Error al guardar tramo.");
    }
    return json.tier;
  }

  if (editBtn) {
    editBtn.addEventListener("click", function () { setEditMode(true); });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () { window.location.reload(); });
  }
  if (newBtn && tbody) {
    newBtn.addEventListener("click", function () {
      var tr = document.createElement("tr");
      tr.setAttribute("data-tier-id", "new-" + Date.now());
      tr.innerHTML = '<td><input type="text" class="tier-label" value="Desde X SMS" /></td>' +
        '<td><input type="number" class="tier-min-sms" min="1000" step="1000" value="1000" style="max-width:7rem" /></td>' +
        '<td><input type="number" class="tier-unit-price" min="0.01" step="0.01" value="10" style="max-width:5rem" /> <span class="field-hint">+ IVA</span></td>' +
        '<td><label><input type="checkbox" class="tier-active" checked /> Activo</label></td>' +
        '<td><button type="button" class="btn btn-secondary btn-sm tier-save-btn">Guardar</button></td>';
      tbody.appendChild(tr);
    });
  }
  document.querySelectorAll(".tier-save-btn").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var tr = btn.closest("tr");
      if (!tr) return;
      if (!confirm("¿Confirmas actualizar los precios SMS? Estos valores impactarán el landing, el panel cliente y las cotizaciones públicas.")) return;
      try {
        var data = rowData(tr);
        var isNew = !data.id || data.id.startsWith("new-");
        var saved = await saveTier(data, isNew);
        tr.setAttribute("data-tier-id", saved.id);
        showAlert("Precios actualizados correctamente. Los cambios ya están disponibles para landing, panel y cotizador público.", true);
        setTimeout(function () { window.location.reload(); }, 1200);
      } catch (err) {
        showAlert(err.message || String(err), false);
      }
    });
  });
  if (saveAllBtn && tbody) {
    saveAllBtn.addEventListener("click", async function () {
      if (!confirm("¿Confirmas actualizar los precios SMS? Estos valores impactarán el landing, el panel cliente y las cotizaciones públicas.")) return;
      var rows = Array.from(tbody.querySelectorAll("tr"));
      try {
        for (var i = 0; i < rows.length; i++) {
          var data = rowData(rows[i]);
          var isNew = !data.id || data.id.startsWith("new-");
          await saveTier(data, isNew);
        }
        showAlert("Precios actualizados correctamente. Los cambios ya están disponibles para landing, panel y cotizador público.", true);
        setTimeout(function () { window.location.reload(); }, 1200);
      } catch (err) {
        showAlert(err.message || String(err), false);
      }
    });
  }
})();
</script>`
    : "";

  const body = `
    <h1>Calculadora Telvoice.cl</h1>
    <p class="subtitle">Cotización Chile por tramos — múltiplos de 1.000 SMS. Fuente única: <code>sms_pricing_tiers</code>.</p>
    ${successBlock}
    ${errorBlock}
    <div class="card" style="margin-bottom:1.25rem">
      <form method="post" action="/admin/calculator" class="actions-row" style="margin:0;align-items:flex-end">
        <div class="form-group" style="flex:1;margin:0">
          <label for="quantity">Cantidad SMS</label>
          <input id="quantity" name="quantity" type="number" min="1" step="1" value="${options.quantity !== undefined ? escapeHtml(String(options.quantity)) : ""}" placeholder="Ej: 30000, 12500" required />
        </div>
        <button type="submit" class="btn btn-primary">Cotizar</button>
      </form>
      <p class="field-hint">Ejemplos: 30000 → tramo 15k · 12500 → redondea a 13000</p>
    </div>
    ${resultBlock}
    <h2>Tramos (sms_pricing_tiers)</h2>
    ${editControls}
    <div class="card table-wrap" style="padding:0">
      <table id="pricing-tiers-table">
        <thead><tr><th>Etiqueta</th><th>Desde SMS</th><th>Precio unitario</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody id="pricing-tiers-tbody">${canEdit ? tierRowsEditable : tierRowsReadonly}</tbody>
      </table>
    </div>
    ${pricingScript}`;

  return renderLayout({
    title: "Calculadora Telvoice.cl",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "calculator",
  });
}

export function renderWebAgentLeadsPage(options: {
  admin: AdminSessionUser;
  leads: import("../services/webAgentAdminService.js").WebAgentLeadRow[];
}): string {
  const rows = options.leads
    .map(
      (l) => `<tr>
        <td>${new Date(l.created_at).toLocaleString("es-CL")}</td>
        <td>${escapeHtml(l.name ?? "—")}</td>
        <td>${escapeHtml(l.company ?? "—")}</td>
        <td>${escapeHtml(l.email ?? "—")}</td>
        <td>${escapeHtml(l.phone ?? "—")}</td>
        <td>${l.requested_quantity?.toLocaleString("es-CL") ?? "—"}</td>
        <td>${escapeHtml(l.use_case ?? l.message ?? "—")}</td>
        <td>${escapeHtml(l.status)}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <h1>Leads — agente web</h1>
    <p class="subtitle">Capturas desde el chat flotante Telvoice.cl</p>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead><tr><th>Fecha</th><th>Nombre</th><th>Empresa</th><th>Email</th><th>Teléfono</th><th>SMS</th><th>Uso</th><th>Estado</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8">Sin leads (ejecuta migración 009_web_agent).</td></tr>'}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Web agent leads",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "web-leads",
  });
}

export function renderWebAgentSessionsPage(options: {
  admin: AdminSessionUser;
  sessions: import("../services/webAgentAdminService.js").WebAgentSessionRow[];
}): string {
  const rows = options.sessions
    .map(
      (s) => `<tr>
        <td>${new Date(s.updated_at).toLocaleString("es-CL")}</td>
        <td>${escapeHtml(s.page_url ?? "—")}</td>
        <td>${escapeHtml(s.lead_capture_step ?? "—")}</td>
        <td>${s.message_count ?? 0}</td>
        <td><code>${escapeHtml(s.id.slice(0, 8))}…</code></td>
      </tr>`,
    )
    .join("");

  const body = `
    <h1>Sesiones — agente web</h1>
    <p class="subtitle">Conversaciones del widget flotante</p>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead><tr><th>Última actividad</th><th>Página</th><th>Paso lead</th><th>Mensajes</th><th>Sesión</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Sin sesiones.</td></tr>'}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Web agent sesiones",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "web-sessions",
  });
}

export function renderWebAgentQuotesPage(options: {
  admin: AdminSessionUser;
  quotes: import("../services/webAgentAdminService.js").WebAgentQuoteRow[];
}): string {
  const rows = options.quotes
    .map(
      (q) => `<tr>
        <td>${new Date(q.created_at).toLocaleString("es-CL")}</td>
        <td>${q.requested_quantity.toLocaleString("es-CL")}</td>
        <td>${q.quoted_quantity.toLocaleString("es-CL")}</td>
        <td>$${q.unit_price}</td>
        <td>${formatClp(q.subtotal)}</td>
        <td>${formatClp(q.iva)}</td>
        <td>${formatClp(q.total_with_iva)}</td>
        <td>${escapeHtml(q.tier_label)}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <h1>Cotizaciones — agente web</h1>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead><tr><th>Fecha</th><th>Solicitada</th><th>Cotizada</th><th>$/SMS</th><th>Neto</th><th>IVA</th><th>Total</th><th>Tramo</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8">Sin cotizaciones.</td></tr>'}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Web agent cotizaciones",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "web-quotes",
  });
}

export function renderPricingTiersPage(options: {
  admin: AdminSessionUser;
  tiers: SmsPricingTierRow[];
  successMessage?: string;
  error?: string;
}): string {
  const successBlock = options.successMessage
    ? `<div class="alert alert-ok">${escapeHtml(options.successMessage)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const rows = options.tiers
    .map(
      (t) => `<tr>
        <td>${escapeHtml(t.label)}</td>
        <td>${t.min_quantity.toLocaleString("es-CL")}</td>
        <td>
          <form method="post" action="/admin/pricing-tiers/${escapeHtml(t.id)}/edit" class="actions-row" style="margin:0">
            <input name="label" value="${escapeHtml(t.label)}" style="max-width:12rem" />
            <input name="unit_price" type="number" step="0.01" value="${escapeHtml(String(t.unit_price))}" style="max-width:5rem" />
            <input name="sort_order" type="number" value="${t.sort_order}" style="max-width:4rem" />
            <label><input type="checkbox" name="is_active" value="1" ${t.is_active ? "checked" : ""} /> Activo</label>
            <button type="submit" class="btn btn-secondary btn-sm">Guardar</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  const body = `
    <h1>Tramos de precio (sms_pricing_tiers)</h1>
    <p class="subtitle">Usados por calculadora, API y agente web. Chile (CL).</p>
    ${successBlock}${errorBlock}
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead><tr><th>Etiqueta</th><th>Desde SMS</th><th>Editar</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3">Sin tramos en BD.</td></tr>'}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Tramos precio",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "pricing-tiers",
  });
}

export function renderTelegramIntentTestPage(options: {
  admin: AdminSessionUser;
  phrase?: string;
  simulation?: TelegramIntentSimulationResult;
  error?: string;
  builtInTests: { input: string; expectedRoute: TelegramIntentRoute; expectedQuantity?: number }[];
}): string {
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  let resultBlock = "";
  if (options.simulation) {
    const s = options.simulation;
    const matchLabel =
      s.testCaseMatch === null
        ? "—"
        : s.testCaseMatch
          ? statusBadge("active")
          : statusBadge("error");
    resultBlock = `
      <h2>Resultado</h2>
      <dl class="meta-grid">
        <div class="meta-item"><dt>Texto original</dt><dd>${escapeHtml(s.originalText)}</dd></div>
        <div class="meta-item"><dt>Texto normalizado</dt><dd>${escapeHtml(s.normalizedText)}</dd></div>
        <div class="meta-item"><dt>Intención</dt><dd>${escapeHtml(s.route)}</dd></div>
        <div class="meta-item"><dt>Comando operativo</dt><dd>${escapeHtml(s.operationalCommand ?? "—")}</dd></div>
        <div class="meta-item"><dt>Cantidad detectada</dt><dd>${s.detectedQuantity?.toLocaleString("es-CL") ?? "—"}</dd></div>
        <div class="meta-item"><dt>Caso de prueba</dt><dd>${matchLabel}</dd></div>
      </dl>
      ${s.commercial ? `<p class="field-hint">Comercial: ${escapeHtml(s.commercial.kind)} · más SMS: ${s.commercial.wantsMoreSms ? "sí" : "no"}</p>` : ""}
      <h3>Respuesta que enviaría el bot</h3>
      <div class="message-box">${escapeHtml(s.replyPreview)}</div>`;
  }

  const builtInRows = options.builtInTests
    .map(
      (t) => `<tr>
        <td><code>${escapeHtml(t.input)}</code></td>
        <td>${escapeHtml(t.expectedRoute)}</td>
        <td>${t.expectedQuantity?.toLocaleString("es-CL") ?? "—"}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <p><a href="/admin/telegram/diagnostics" class="row-link">← Diagnóstico Telegram</a></p>
    <h1>Probar intención del bot</h1>
    <p class="subtitle">Prioridad: operativo → comercial → capabilities → knowledge → fallback. Sin enviar mensajes reales a Telegram.</p>
    ${errorBlock}
    <div class="card">
      <form method="post" action="/admin/telegram/test-intent">
        <div class="form-group">
          <label for="phrase">Frase del usuario</label>
          <input id="phrase" name="phrase" value="${escapeHtml(options.phrase ?? "")}" placeholder="hola, quiero comprar más sms" required />
        </div>
        <button type="submit" class="btn btn-primary">Analizar intención</button>
      </form>
    </div>
    ${resultBlock}
    <h2>Casos de prueba internos</h2>
    <div class="card table-wrap" style="padding:0">
      <table>
        <thead><tr><th>Entrada</th><th>Ruta esperada</th><th>Cantidad</th></tr></thead>
        <tbody>${builtInRows}</tbody>
      </table>
    </div>`;

  return renderLayout({
    title: "Probar intención Telegram",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "telegram",
  });
}
