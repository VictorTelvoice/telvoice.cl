import { env } from "../../../config/env.js";
import { escapeHtml } from "../../../utils/html.js";
import type { AdminSessionUser } from "../../../types/admin.js";
import type { ClientTelegramUserRow } from "../../../types/database.js";
import type { KnowledgeArticleRow } from "../../../types/knowledge.js";
import { getTelegramRuntimeStatus } from "../../../services/telegram/runtime.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { MOCK_BOT_ACTIONS } from "../mock-data.js";
import { statusBadge } from "../badges.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderCollapsible,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";

export function renderBotPageBody(options: {
  admin: AdminSessionUser;
  clientName: string;
  telegramUsers: ClientTelegramUserRow[];
  getMeOk: boolean;
  knowledgeTableOk: boolean;
  knowledgeActiveCount: number;
  testResult?: string | null;
  testError?: string | null;
  formError?: string | null;
  diagnosticsExtraHtml?: string;
}): string {
  const runtime = getTelegramRuntimeStatus();
  const bot = runtime.botInfo;
  const botUser = bot?.username ? `@${bot.username}` : "—";
  const active = options.getMeOk && Boolean(env.telegram.botToken);

  const headerActions = `
    ${renderBtn("Conectar Telegram", { href: "/admin/clients/test/telegram-users", variant: "primary", icon: "link" })}
    ${bot?.username ? `<a href="https://t.me/${escapeHtml(bot.username)}" target="_blank" rel="noopener" class="btn btn-secondary">Abrir bot</a>` : renderBtn("Abrir bot", { disabled: true })}
    <a href="mailto:soporte@telvoice.cl" class="btn btn-ghost">Hablar con soporte</a>
  `;

  const quickActions = [
    { label: "Crear campaña", icon: "campaign", href: "/admin/sms/send-test" },
    { label: "Revisar saldo", icon: "account_balance_wallet", href: "/admin/clients/test/credit" },
    { label: "Subir contactos", icon: "upload", href: "/admin/leads" },
    { label: "Ver errores", icon: "error", href: "/admin/inbox" },
    { label: "Crear plantilla", icon: "description", href: "/admin/knowledge" },
    { label: "Solicitar soporte", icon: "support_agent", href: "mailto:soporte@telvoice.cl" },
    { label: "Activar API", icon: "api", href: "/admin/asmsc/diagnostics" },
    { label: "Comprar más SMS", icon: "shopping_cart", href: "/admin/products" },
  ]
    .map(
      (a) => `<a href="${escapeHtml(a.href)}" class="tv-bot-chip">
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(a.icon)}</span>
        ${escapeHtml(a.label)}
      </a>`,
    )
    .join("");

  const tips = [
    "Tienes contactos duplicados en tu última carga.",
    "Tu campaña anterior tuvo una tasa de entrega del 96,4%.",
    "Puedes mejorar el mensaje usando una plantilla transaccional.",
    "Activa webhook DLR para recibir estados de entrega en tu sistema.",
  ]
    .map(
      (t) => `<div class="tv-tip-card">
        <span class="material-symbols-outlined" aria-hidden="true">lightbulb</span>
        <p>${escapeHtml(t)}</p>
      </div>`,
    )
    .join("");

  const historyRows = MOCK_BOT_ACTIONS.map(
    (a) => `<tr>
      <td>${escapeHtml(a.date)}</td>
      <td>${escapeHtml(a.action)}</td>
      <td>${escapeHtml(a.result)}</td>
      <td>${escapeHtml(a.channel)}</td>
      <td>${statusBadge(a.status === "ok" ? "ok" : a.status === "warn" ? "pending" : "failed")}</td>
    </tr>`,
  ).join("");

  const testOk = options.testResult
    ? `<div class="alert alert-success">${escapeHtml(options.testResult)}</div>`
    : "";
  const testErr = options.testError
    ? `<div class="alert alert-error">${escapeHtml(options.testError)}</div>`
    : "";
  const formErr = options.formError
    ? `<div class="alert alert-error">${escapeHtml(options.formError)}</div>`
    : "";

  const usersCount = options.telegramUsers.length;

  return `
    ${renderPageHeader({
      title: "Agente Telvoice",
      subtitle:
        "Tu asistente para preparar campañas, revisar contactos, consultar saldo, resolver errores y conectar Telvoice con Telegram.",
      actions: headerActions,
    })}
    <div class="tv-kpi-grid" style="margin-bottom:1.25rem">
      <article class="tv-kpi tv-kpi--${active ? "success" : "warn"}">
        <div class="tv-kpi__head">
          <span class="material-symbols-outlined tv-kpi__icon">smart_toy</span>
          <span class="tv-kpi__label">Estado del bot</span>
        </div>
        <div class="tv-kpi__value">${active ? "Activo" : "Revisar"}</div>
        <p class="tv-kpi__hint">${escapeHtml(botUser)}</p>
      </article>
      <article class="tv-kpi tv-kpi--primary">
        <div class="tv-kpi__head">
          <span class="material-symbols-outlined tv-kpi__icon">forum</span>
          <span class="tv-kpi__label">Canal</span>
        </div>
        <div class="tv-kpi__value">Telegram</div>
        <p class="tv-kpi__hint">Modo ${escapeHtml(env.telegram.mode)}</p>
      </article>
      <article class="tv-kpi tv-kpi--default">
        <div class="tv-kpi__head">
          <span class="material-symbols-outlined tv-kpi__icon">schedule</span>
          <span class="tv-kpi__label">Última interacción</span>
        </div>
        <div class="tv-kpi__value">Hace 12 min</div>
        <p class="tv-kpi__hint">Mock · conectar analytics</p>
      </article>
      <article class="tv-kpi tv-kpi--default">
        <div class="tv-kpi__head">
          <span class="material-symbols-outlined tv-kpi__icon">group</span>
          <span class="tv-kpi__label">Usuarios autorizados</span>
        </div>
        <div class="tv-kpi__value">${escapeHtml(String(usersCount))}</div>
        <p class="tv-kpi__hint">${escapeHtml(options.clientName)}</p>
      </article>
    </div>
    <div class="tv-bot-layout">
      <div class="tv-panel tv-bot-chat">
        <header class="tv-section-head">
          <h2 class="tv-section-head__title">Chat del agente</h2>
          <p class="tv-section-head__sub">Interfaz preparada · respuestas conectadas vía Telegram en producción</p>
        </header>
        <div class="tv-panel__body tv-bot-chat__body">
          <div class="tv-chat-msg tv-chat-msg--bot">
            <span class="tv-chat-msg__avatar">TV</span>
            <div class="tv-chat-msg__bubble">
              Hola, soy tu Agente Telvoice. Puedo ayudarte a enviar campañas, revisar contactos, consultar saldo, preparar plantillas o revisar errores de entrega.
            </div>
          </div>
          <div class="tv-chat-msg tv-chat-msg--user">
            <div class="tv-chat-msg__bubble">¿Cuánto saldo SMS tengo disponible?</div>
          </div>
          <div class="tv-chat-msg tv-chat-msg--bot">
            <span class="tv-chat-msg__avatar">TV</span>
            <div class="tv-chat-msg__bubble">Tienes saldo activo en cliente prueba. Usa <strong>Revisar saldo</strong> o el panel de crédito para el detalle exacto.</div>
          </div>
        </div>
        <div class="tv-bot-quick">${quickActions}</div>
        <form class="tv-bot-compose" onsubmit="return false">
          <input type="text" placeholder="Escribe a tu agente…" disabled />
          <button type="button" class="btn btn-primary" disabled title="Usa Telegram para chat en vivo">Enviar</button>
        </form>
      </div>
      <aside class="tv-bot-aside">
        ${renderPanel("Recomendaciones", `<div class="tv-tips-grid">${tips}</div>`)}
        ${renderPanel(
          "Historial del agente",
          `<div class="table-wrap" style="padding:0">
            <table class="tv-table tv-table--compact">
              <thead><tr><th>Fecha</th><th>Acción</th><th>Resultado</th><th>Canal</th><th>Estado</th></tr></thead>
              <tbody>${historyRows}</tbody>
            </table>
          </div>`,
        )}
      </aside>
    </div>
    ${renderCollapsible(
      "Herramientas técnicas Telegram",
      `${testOk}${testErr}${formErr}
       <form method="post" action="/admin/telegram/diagnostics/test" class="tv-form-inline">
         <div class="form-group" style="margin:0;flex:1">
           <label for="chat_id">Enviar prueba a chat_id</label>
           <input id="chat_id" name="chat_id" required pattern="[0-9]+" placeholder="123456789" />
         </div>
         <button type="submit" class="btn btn-primary">Enviar test</button>
       </form>
       <p class="field-hint"><a href="/admin/telegram/test-intent" class="row-link">Probar intenciones del bot →</a></p>
       ${options.diagnosticsExtraHtml ?? ""}`,
      false,
    )}
    ${renderAdminUiScript()}`;
}

export function renderBotPage(options: {
  admin: AdminSessionUser;
  clientName: string;
  telegramUsers: ClientTelegramUserRow[];
  getMeOk: boolean;
  knowledgeTableOk: boolean;
  knowledgeActiveCount: number;
  knowledgeRecent?: KnowledgeArticleRow[];
  testResult?: string | null;
  testError?: string | null;
  formError?: string | null;
  smsBalance?: string;
  diagnosticsExtraHtml?: string;
}): string {
  return wrapAdminPage({
    admin: options.admin,
    title: "Agente Telvoice",
    activeNav: "bot",
    body: renderBotPageBody(options),
    topbar: { smsBalance: options.smsBalance },
  });
}
