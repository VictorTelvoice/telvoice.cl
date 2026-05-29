import type { AdminSessionUser } from "../../../types/admin.js";
import type { KnowledgeArticleRow } from "../../../types/knowledge.js";
import type { UnansweredQuestionRow } from "../../../services/agent/agentUnansweredService.js";
import type { UnansweredStats } from "../../../services/agent/agentUnansweredService.js";
import type { AgentFeedbackRow } from "../../../services/agent/agentFeedbackService.js";
import {
  renderTelvoiceAgentHubBanner,
  TELVOICE_AGENT_LABELS,
} from "../../../components/agent/telvoice-agent-widget-ui.js";
import { escapeHtml } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";

const CHANNELS = ["telegram", "landing", "web_client", "admin"] as const;
const STATUSES = ["new", "reviewed", "ignored"] as const;

export function renderAgentTrainingHub(options: {
  admin: AdminSessionUser;
  stats: UnansweredStats;
  feedbackStats?: { helpful: number; notHelpful: number; total: number };
}): string {
  const s = options.stats;
  const fb = options.feedbackStats ?? { helpful: 0, notHelpful: 0, total: 0 };
  const body = `
    ${renderTelvoiceAgentHubBanner(TELVOICE_AGENT_LABELS.admin)}
    <div class="tv-page-head">
      <h1 class="tv-page-title">Agente Telvoice</h1>
      <p class="tv-page-sub">Entrenamiento continuo sin tocar código.</p>
    </div>
    <div class="tv-kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
      <a href="/admin/agent-training/unanswered?status=new" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Preguntas nuevas</span>
        <span class="tv-kpi__value">${s.newCount}</span>
      </a>
      <a href="/admin/agent-training/unanswered?status=reviewed" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Revisadas</span>
        <span class="tv-kpi__value">${s.reviewedCount}</span>
      </a>
      <a href="/admin/agent-training/unanswered?status=ignored" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Ignoradas</span>
        <span class="tv-kpi__value">${s.ignoredCount}</span>
      </a>
      <div class="tv-kpi">
        <span class="tv-kpi__label">Artículos desde preguntas</span>
        <span class="tv-kpi__value">${s.articlesFromQuestions}</span>
      </div>
      <a href="/admin/agent-training/feedback" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Feedback útil / no útil</span>
        <span class="tv-kpi__value">${fb.helpful} / ${fb.notHelpful}</span>
      </a>
    </div>
    <div class="tv-kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin-top:1rem">
      <a href="/admin/agent-training/unanswered" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Preguntas sin respuesta</span>
        <span class="tv-kpi__value">Revisar</span>
      </a>
      <a href="/admin/knowledge" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Base conocimiento</span>
        <span class="tv-kpi__value">Artículos</span>
      </a>
      <a href="/admin/web-agent/sessions" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Conversaciones web</span>
        <span class="tv-kpi__value">Landing</span>
      </a>
      <a href="/admin/telegram/diagnostics" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Telegram</span>
        <span class="tv-kpi__value">Diagnóstico</span>
      </a>
    </div>`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Agente Telvoice",
    activeNav: "agent-training",
    body,
  });
}

function statusBadge(status: string): string {
  const cls =
    status === "new"
      ? "tv-tag tv-tag--warn"
      : status === "ignored"
        ? "tv-tag tv-tag--muted"
        : "tv-tag tv-tag--ok";
  return `<span class="${cls}">${escapeHtml(status)}</span>`;
}

export function renderAgentTrainingUnansweredList(options: {
  admin: AdminSessionUser;
  rows: UnansweredQuestionRow[];
  filters: {
    status?: string;
    channel?: string;
    detected_intent?: string;
    date_from?: string;
    date_to?: string;
  };
  successMessage?: string;
  error?: string;
}): string {
  const f = options.filters;
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const channelOpts = CHANNELS.map(
    (c) =>
      `<option value="${c}"${f.channel === c ? " selected" : ""}>${c}</option>`,
  ).join("");
  const statusOpts = STATUSES.map(
    (s) =>
      `<option value="${s}"${f.status === s ? " selected" : ""}>${s}</option>`,
  ).join("");

  const tableRows = options.rows.length
    ? options.rows
        .map((r) => {
          const dupCount =
            r.metadata &&
            typeof r.metadata === "object" &&
            typeof (r.metadata as { count?: number }).count === "number"
              ? (r.metadata as { count: number }).count
              : null;
          const dupHint =
            dupCount && dupCount > 1
              ? ` <span class="field-hint">(×${dupCount})</span>`
              : "";
          return `<tr>
        <td>${escapeHtml(new Date(r.created_at).toLocaleString("es-CL"))}</td>
        <td><span class="tv-tag">${escapeHtml(r.channel)}</span></td>
        <td>${escapeHtml(r.question.slice(0, 100))}${r.question.length > 100 ? "…" : ""}${dupHint}</td>
        <td>${escapeHtml(r.detected_intent ?? "—")}</td>
        <td>${r.confidence != null ? Number(r.confidence).toFixed(2) : "—"}</td>
        <td>${r.company_id ? `<code style="font-size:0.75rem">${escapeHtml(r.company_id.slice(0, 8))}…</code>` : "—"}</td>
        <td>${statusBadge(r.status)}</td>
        <td style="white-space:nowrap">
          <a class="btn btn-sm btn-primary" href="/admin/agent-training/unanswered/${escapeHtml(r.id)}/create-article">Crear artículo</a>
          <form method="post" action="/admin/agent-training/unanswered/${escapeHtml(r.id)}/mark-reviewed" style="display:inline;margin-left:0.25rem">
            <button type="submit" class="btn btn-sm btn-secondary">Revisada</button>
          </form>
          <form method="post" action="/admin/agent-training/unanswered/${escapeHtml(r.id)}/ignore" style="display:inline;margin-left:0.25rem" onsubmit="return confirm('¿Marcar como ignorada?');">
            <button type="submit" class="btn btn-sm btn-ghost">Ignorar</button>
          </form>
        </td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="8">Sin resultados con estos filtros.</td></tr>`;

  const body = `
    ${renderTelvoiceAgentHubBanner(TELVOICE_AGENT_LABELS.admin)}
    <div class="tv-page-head">
      <h1 class="tv-page-title">Preguntas sin respuesta</h1>
      <p class="tv-page-sub"><a href="/admin/agent-training">← Agente Telvoice</a></p>
    </div>
    ${successBlock}
    ${errorBlock}
    <div class="tv-panel" style="margin-bottom:1rem">
      <p class="field-hint" style="margin:0 0 0.75rem">
        <strong>Ejemplos para entrenar (comercial):</strong>
        quiero comprar mensajes · necesito comprar más sms ·
        quiero una bolsa de mensajes · cuánto cuesta 30000 mensajes ·
        necesito mensajes para mi empresa
      </p>
      <form method="get" action="/admin/agent-training/unanswered" class="actions-row" style="margin:0;flex-wrap:wrap;gap:0.75rem">
        <div class="form-group" style="margin:0">
          <label for="status">Estado</label>
          <select id="status" name="status">
            <option value="">Todos</option>
            ${statusOpts}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label for="channel">Canal</label>
          <select id="channel" name="channel">
            <option value="">Todos</option>
            ${channelOpts}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label for="detected_intent">Intención</label>
          <input id="detected_intent" name="detected_intent" value="${escapeHtml(f.detected_intent ?? "")}" placeholder="unknown, commercial…" />
        </div>
        <div class="form-group" style="margin:0">
          <label for="date_from">Desde</label>
          <input type="date" id="date_from" name="date_from" value="${escapeHtml(f.date_from ?? "")}" />
        </div>
        <div class="form-group" style="margin:0">
          <label for="date_to">Hasta</label>
          <input type="date" id="date_to" name="date_to" value="${escapeHtml(f.date_to ?? "")}" />
        </div>
        <button type="submit" class="btn btn-secondary">Filtrar</button>
        <a href="/admin/agent-training/unanswered" class="btn btn-ghost">Limpiar</a>
      </form>
    </div>
    <div class="tv-panel">
      <div class="tv-table-wrap">
        <table class="tv-table">
          <thead>
            <tr>
              <th>Fecha</th><th>Canal</th><th>Pregunta</th><th>Intención</th><th>Conf.</th><th>Empresa</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Sin respuesta",
    activeNav: "agent-training",
    body,
  });
}

function renderCategorySelect(selected: string): string {
  const cats = [
    "soporte",
    "comercial",
    "dlr",
    "saldo",
    "sms",
    "panel_cliente",
    "estrategia",
    "telegram",
    "api",
    "errores",
  ];
  const opts = cats
    .map(
      (c) =>
        `<option value="${c}"${c === selected ? " selected" : ""}>${c}</option>`,
    )
    .join("");
  return `<select id="category" name="category" required>${opts}</select>`;
}

export function renderAgentTrainingCreateArticleForm(options: {
  admin: AdminSessionUser;
  unanswered: UnansweredQuestionRow;
  prefill: {
    title: string;
    category: string;
    keywords: string[];
    content: string;
    allowed_channels: string[];
    audience: string;
    priority: number;
  };
  error?: string;
  values?: Record<string, unknown>;
}): string {
  const p = options.prefill;
  const v = options.values ?? {};
  const val = (field: string, fallback: string): string => {
    if (v[field] !== undefined && v[field] !== null) {
      return String(v[field]);
    }
    return fallback;
  };
  const channelsVal = val(
    "allowed_channels",
    p.allowed_channels.join(", "),
  );
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const body = `
    <div class="tv-page-head">
      <h1 class="tv-page-title">Crear artículo desde pregunta</h1>
      <p class="tv-page-sub"><a href="/admin/agent-training/unanswered">← Preguntas sin respuesta</a></p>
    </div>
    <div class="tv-panel" style="margin-bottom:1rem">
      <p><strong>Pregunta original:</strong> ${escapeHtml(options.unanswered.question)}</p>
      <p class="field-hint">Canal: ${escapeHtml(options.unanswered.channel)} · Intención: ${escapeHtml(options.unanswered.detected_intent ?? "—")} · Confianza: ${options.unanswered.confidence != null ? Number(options.unanswered.confidence).toFixed(2) : "—"}</p>
    </div>
    ${errorBlock}
    <div class="tv-panel">
      <form method="post" action="/admin/agent-training/unanswered/${escapeHtml(options.unanswered.id)}/create-article">
        <div class="form-group">
          <label for="title">Título</label>
          <input id="title" name="title" value="${escapeHtml(val("title", p.title))}" required />
        </div>
        <div class="form-group">
          <label for="category">Categoría</label>
          ${renderCategorySelect(val("category", p.category))}
        </div>
        <div class="form-group">
          <label for="keywords">Keywords (coma)</label>
          <input id="keywords" name="keywords" value="${escapeHtml(val("keywords", p.keywords.join(", ")))}" />
        </div>
        <div class="form-group">
          <label for="allowed_channels">Canales permitidos (coma)</label>
          <input id="allowed_channels" name="allowed_channels" value="${escapeHtml(channelsVal)}" placeholder="telegram, landing, web_client" />
        </div>
        <div class="form-group">
          <label for="audience">Audiencia</label>
          <input id="audience" name="audience" value="${escapeHtml(val("audience", p.audience))}" />
        </div>
        <div class="form-group">
          <label for="priority">Prioridad</label>
          <input type="number" id="priority" name="priority" value="${escapeHtml(val("priority", String(p.priority)))}" min="0" max="100" />
        </div>
        <div class="form-group">
          <label for="content">Contenido (respuesta del agente)</label>
          <textarea id="content" name="content" rows="10" required>${escapeHtml(val("content", p.content))}</textarea>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_active" value="1" checked /> Activo</label>
        </div>
        <button type="submit" class="btn btn-primary">Guardar artículo y marcar revisada</button>
      </form>
    </div>`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Crear artículo",
    activeNav: "agent-training",
    body,
  });
}

export function renderAgentTrainingFeedbackList(options: {
  admin: AdminSessionUser;
  rows: AgentFeedbackRow[];
}): string {
  const tableRows = options.rows.length
    ? options.rows
        .map(
          (r) => `<tr>
        <td>${escapeHtml(new Date(r.created_at).toLocaleString("es-CL"))}</td>
        <td><span class="tv-tag">${escapeHtml(r.channel)}</span></td>
        <td>${escapeHtml(r.session_id.slice(0, 24))}</td>
        <td>${r.rating != null ? (r.rating >= 4 ? "👍" : "👎") : "—"}</td>
        <td>${escapeHtml(r.feedback_text ?? "—")}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="5">Sin feedback registrado.</td></tr>`;

  const body = `
    ${renderTelvoiceAgentHubBanner(TELVOICE_AGENT_LABELS.admin)}
    <div class="tv-page-head">
      <h1 class="tv-page-title">Feedback del agente</h1>
      <p class="tv-page-sub"><a href="/admin/agent-training">← Agente Telvoice</a></p>
    </div>
    <div class="tv-panel">
      <div class="tv-table-wrap">
        <table class="tv-table">
          <thead>
            <tr><th>Fecha</th><th>Canal</th><th>Sesión</th><th>Rating</th><th>Comentario</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Feedback agente",
    activeNav: "agent-training",
    body,
  });
}

export function knowledgeSourceUnansweredBadge(
  article: KnowledgeArticleRow,
): string {
  const id = article.source_unanswered_question_id;
  if (!id) {
    return "";
  }
  return `<a href="/admin/agent-training/unanswered?status=reviewed" class="tv-tag" title="Creado desde entrenamiento">desde pregunta</a>`;
}
