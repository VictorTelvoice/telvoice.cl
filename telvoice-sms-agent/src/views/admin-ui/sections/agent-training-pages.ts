import type { AdminSessionUser } from "../../../types/admin.js";
import type { KnowledgeArticleRow } from "../../../types/knowledge.js";
import type { UnansweredQuestionRow } from "../../../services/agent/agentUnansweredService.js";
import type { UnansweredStats } from "../../../services/agent/agentUnansweredService.js";
import type {
  AgentFeedbackListItem,
  AgentFeedbackDetail,
  FeedbackStats,
} from "../../../services/agent/agentFeedbackService.js";
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
  feedbackStats?: FeedbackStats;
}): string {
  const s = options.stats;
  const fb = options.feedbackStats ?? {
    helpful: 0,
    notHelpful: 0,
    pendingReview: 0,
    convertedToArticle: 0,
    ignored: 0,
    total: 0,
  };
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
      <a href="/admin/agent-training/feedback?status=new" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Feedback pendiente</span>
        <span class="tv-kpi__value">${fb.pendingReview}</span>
      </a>
    </div>
    <div class="tv-kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin-top:1rem">
      <a href="/admin/agent-training/feedback?rating=not_helpful" class="tv-kpi" style="text-decoration:none;color:inherit">
        <span class="tv-kpi__label">Feedback negativo</span>
        <span class="tv-kpi__value">Revisar</span>
      </a>
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
  rows: AgentFeedbackListItem[];
  stats: FeedbackStats;
  filters: {
    rating?: "helpful" | "not_helpful" | "all";
    status?: string;
    channel?: string;
    companyId?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
  };
  successMessage?: string;
  error?: string;
}): string {
  const f = options.filters;
  const s = options.stats;
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
  const statusOpts = ["new", "reviewed", "converted_to_article", "ignored"].map(
    (st) =>
      `<option value="${st}"${f.status === st ? " selected" : ""}>${st}</option>`,
  ).join("");
  const ratingOpts = [
    ["", "Todos"],
    ["helpful", "Útil"],
    ["not_helpful", "No útil"],
  ]
    .map(
      ([v, label]) =>
        `<option value="${v}"${f.rating === v ? " selected" : ""}>${label}</option>`,
    )
    .join("");

  const tableRows = options.rows.length
    ? options.rows
        .map((r) => {
          const isNegative = r.rating != null && r.rating <= 2;
          const rowClass = isNegative ? ' style="background:#fff7f7"' : "";
          const question =
            ("user_question" in r && typeof r.user_question === "string" && r.user_question) ||
            (r.metadata &&
              typeof r.metadata.user_question === "string" &&
              r.metadata.user_question) ||
            "—";
          const answer =
            ("agent_response" in r && typeof r.agent_response === "string" && r.agent_response) ||
            (r.metadata &&
              typeof r.metadata.agent_response === "string" &&
              r.metadata.agent_response) ||
            "—";
          const ratingLabel =
            r.rating != null
              ? r.rating >= 4
                ? "👍 Útil"
                : r.rating <= 2
                  ? "👎 No útil"
                  : "—"
              : "—";
          return `<tr${rowClass}>
        <td>${escapeHtml(new Date(r.created_at).toLocaleString("es-CL"))}</td>
        <td><span class="tv-tag">${escapeHtml(r.channel)}</span></td>
        <td>${r.company_id ? `<code style="font-size:0.75rem">${escapeHtml(r.company_id.slice(0, 8))}…</code>` : "—"}</td>
        <td>${escapeHtml(r.user_id ?? "—")}</td>
        <td>${ratingLabel}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${escapeHtml(String(question).slice(0, 80))}${String(question).length > 80 ? "…" : ""}</td>
        <td>${escapeHtml(String(answer).slice(0, 80))}${String(answer).length > 80 ? "…" : ""}</td>
        <td>${escapeHtml(r.detected_intent ?? "—")}</td>
        <td>${r.confidence != null ? Number(r.confidence).toFixed(2) : "—"}</td>
        <td style="white-space:nowrap">
          <a class="btn btn-sm btn-primary" href="/admin/agent-training/feedback/${escapeHtml(r.id)}">Ver</a>
          <a class="btn btn-sm btn-secondary" href="/admin/agent-training/feedback/${escapeHtml(r.id)}/create-article">Artículo</a>
        </td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="11">Sin feedback con estos filtros.</td></tr>`;

  const body = `
    ${renderTelvoiceAgentHubBanner(TELVOICE_AGENT_LABELS.admin)}
    <div class="tv-page-head">
      <h1 class="tv-page-title">Feedback del agente</h1>
      <p class="tv-page-sub"><a href="/admin/agent-training">← Agente Telvoice</a></p>
    </div>
    ${successBlock}
    ${errorBlock}
    <div class="tv-kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:1rem">
      <div class="tv-kpi"><span class="tv-kpi__label">Útiles</span><span class="tv-kpi__value">${s.helpful}</span></div>
      <div class="tv-kpi"><span class="tv-kpi__label">No útiles</span><span class="tv-kpi__value">${s.notHelpful}</span></div>
      <div class="tv-kpi"><span class="tv-kpi__label">Pendientes</span><span class="tv-kpi__value">${s.pendingReview}</span></div>
      <div class="tv-kpi"><span class="tv-kpi__label">→ Artículos</span><span class="tv-kpi__value">${s.convertedToArticle}</span></div>
      <div class="tv-kpi"><span class="tv-kpi__label">Ignorados</span><span class="tv-kpi__value">${s.ignored}</span></div>
    </div>
    <div class="tv-panel" style="margin-bottom:1rem">
      <form method="get" action="/admin/agent-training/feedback" class="actions-row" style="margin:0;flex-wrap:wrap;gap:0.75rem">
        <div class="form-group" style="margin:0">
          <label for="rating">Rating</label>
          <select id="rating" name="rating">${ratingOpts}</select>
        </div>
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
          <label for="search">Buscar</label>
          <input id="search" name="search" value="${escapeHtml(f.search ?? "")}" placeholder="pregunta, comentario…" />
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
        <a href="/admin/agent-training/feedback" class="btn btn-ghost">Limpiar</a>
      </form>
    </div>
    <div class="tv-panel">
      <div class="tv-table-wrap">
        <table class="tv-table">
          <thead>
            <tr>
              <th>Fecha</th><th>Canal</th><th>Empresa</th><th>Usuario</th><th>Rating</th><th>Estado</th><th>Pregunta</th><th>Respuesta agente</th><th>Intent</th><th>Conf.</th><th>Acciones</th>
            </tr>
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

function feedbackSessionLink(channel: string, sessionId: string): string {
  if (channel === "landing") {
    return `/admin/web-agent/sessions?search=${encodeURIComponent(sessionId)}`;
  }
  if (channel === "telegram") {
    return `/admin/telegram/diagnostics`;
  }
  return `#`;
}

export function renderAgentTrainingFeedbackDetail(options: {
  admin: AdminSessionUser;
  detail: AgentFeedbackDetail;
  successMessage?: string;
  error?: string;
}): string {
  const d = options.detail;
  const isNegative = d.rating != null && d.rating <= 2;
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const messagesHtml = d.messages.length
    ? d.messages
        .map(
          (m) => `<div class="tv-msg tv-msg--${escapeHtml(m.role)}" style="margin:0.5rem 0;padding:0.65rem 0.85rem;border-radius:8px;background:${m.role === "user" ? "#eef2ff" : "#f8fafc"}">
        <strong>${m.role === "user" ? "Usuario" : "Agente"}</strong>
        <span class="field-hint" style="margin-left:0.5rem">${escapeHtml(new Date(m.created_at).toLocaleString("es-CL"))}</span>
        <p style="margin:0.35rem 0 0;white-space:pre-wrap">${escapeHtml(m.content)}</p>
      </div>`,
        )
        .join("")
    : `<p class="field-hint">Sin mensajes persistidos para esta sesión.</p>`;

  const proposedBlock = d.proposed_answer
    ? `<div class="tv-panel" style="margin-top:1rem;border-color:#86efac">
      <h3 style="margin:0 0 0.5rem">Respuesta correcta propuesta</h3>
      <pre style="white-space:pre-wrap;margin:0">${escapeHtml(d.proposed_answer)}</pre>
      <button type="button" class="btn btn-sm btn-ghost" onclick="navigator.clipboard.writeText(${JSON.stringify(d.proposed_answer)})">Copiar</button>
    </div>`
    : "";

  const body = `
    ${renderTelvoiceAgentHubBanner(TELVOICE_AGENT_LABELS.admin)}
    <div class="tv-page-head">
      <h1 class="tv-page-title">Feedback ${isNegative ? "👎" : "👍"}</h1>
      <p class="tv-page-sub"><a href="/admin/agent-training/feedback">← Feedback del agente</a></p>
    </div>
    ${successBlock}
    ${errorBlock}
    <div class="tv-panel" style="margin-bottom:1rem${isNegative ? ";border-left:4px solid #ef4444" : ""}">
      <p><strong>Fecha:</strong> ${escapeHtml(new Date(d.created_at).toLocaleString("es-CL"))}</p>
      <p><strong>Canal:</strong> ${escapeHtml(d.channel)} · <strong>Estado:</strong> ${statusBadge(d.status)}</p>
      <p><strong>Empresa:</strong> ${escapeHtml(d.company_name ?? d.company_id ?? "—")}</p>
      <p><strong>Usuario:</strong> ${escapeHtml(d.user_id ?? "—")} · <strong>Sesión:</strong> <code>${escapeHtml(d.session_id)}</code></p>
      <p><strong>Intent:</strong> ${escapeHtml(d.detected_intent ?? "—")} · <strong>Confianza:</strong> ${d.confidence != null ? Number(d.confidence).toFixed(2) : "—"}</p>
      <p><strong>Comentario usuario:</strong> ${escapeHtml(d.feedback_text ?? "—")}</p>
      ${d.knowledge_article_id ? `<p><a href="/admin/knowledge/${escapeHtml(d.knowledge_article_id)}/edit">Ver artículo vinculado</a></p>` : ""}
    </div>
    <div class="tv-panel" style="margin-bottom:1rem">
      <h3 style="margin:0 0 0.75rem">Pregunta y respuesta evaluadas</h3>
      <p><strong>Pregunta:</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(d.user_question ?? "—")}</p>
      <p><strong>Respuesta del agente:</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(d.agent_response ?? "—")}</p>
    </div>
    ${proposedBlock}
    <div class="actions-row" style="margin-bottom:1rem;flex-wrap:wrap">
      <a class="btn btn-secondary" href="${escapeHtml(feedbackSessionLink(d.channel, d.session_id))}">Ver conversación</a>
      <a class="btn btn-primary" href="/admin/agent-training/feedback/${escapeHtml(d.id)}/create-article">Crear artículo</a>
      <form method="post" action="/admin/agent-training/feedback/${escapeHtml(d.id)}/create-unanswered" style="display:inline">
        <button type="submit" class="btn btn-secondary">Crear pregunta sin respuesta</button>
      </form>
      <form method="post" action="/admin/agent-training/feedback/${escapeHtml(d.id)}/mark-reviewed" style="display:inline">
        <button type="submit" class="btn btn-secondary">Marcar revisado</button>
      </form>
      <form method="post" action="/admin/agent-training/feedback/${escapeHtml(d.id)}/ignore" style="display:inline" onsubmit="return confirm('¿Ignorar este feedback?');">
        <button type="submit" class="btn btn-ghost">Ignorar</button>
      </form>
      <form method="post" action="/admin/agent-training/feedback/${escapeHtml(d.id)}/backfill" style="display:inline">
        <button type="submit" class="btn btn-ghost">Sincronizar pregunta/respuesta</button>
      </form>
    </div>
    <p class="field-hint" style="margin:-0.5rem 0 1rem">Test de regresión: <code>npm run test:agent-feedback-cases</code> (casos derivados de feedback negativo).</p>
    <div class="tv-panel" style="margin-bottom:1rem">
      <h3 style="margin:0 0 0.75rem">Elaborar respuesta correcta</h3>
      <form method="post" action="/admin/agent-training/feedback/${escapeHtml(d.id)}/propose-answer">
        <div class="form-group">
          <label for="title">Título sugerido</label>
          <input id="title" name="title" value="${escapeHtml(d.user_question?.slice(0, 80) ?? "")}" />
        </div>
        <div class="form-group">
          <label for="category">Categoría</label>
          ${renderCategorySelect("soporte")}
        </div>
        <div class="form-group">
          <label for="keywords">Keywords (coma)</label>
          <input id="keywords" name="keywords" placeholder="sms, saldo, campaña" />
        </div>
        <div class="form-group">
          <label for="proposed_answer">Respuesta correcta</label>
          <textarea id="proposed_answer" name="proposed_answer" rows="8" required>${escapeHtml(d.proposed_answer ?? d.agent_response ?? "")}</textarea>
        </div>
        <div class="form-group">
          <label for="allowed_channels">Canales (coma)</label>
          <input id="allowed_channels" name="allowed_channels" value="${escapeHtml(d.channel === "landing" ? "landing, telegram" : d.channel === "web_client" ? "web_client, telegram" : d.channel)}" />
        </div>
        <div class="form-group">
          <label for="audience">Audiencia</label>
          <input id="audience" name="audience" value="${escapeHtml(d.channel === "landing" ? "public" : d.channel === "web_client" ? "customer" : d.channel === "admin" ? "internal" : "mixed")}" />
        </div>
        <div class="form-group">
          <label for="priority">Prioridad</label>
          <input type="number" id="priority" name="priority" value="5" min="0" max="100" />
        </div>
        <div class="form-group">
          <label for="admin_notes">Notas internas</label>
          <textarea id="admin_notes" name="admin_notes" rows="2">${escapeHtml(d.admin_notes ?? "")}</textarea>
        </div>
        <button type="submit" class="btn btn-primary">Guardar respuesta</button>
        <button type="submit" name="convert_to_article" value="1" class="btn btn-secondary">Guardar y crear artículo</button>
      </form>
    </div>
    <div class="tv-panel">
      <h3 style="margin:0 0 0.75rem">Conversación (${d.messages.length} mensajes)</h3>
      ${messagesHtml}
    </div>`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Detalle feedback",
    activeNav: "agent-training",
    body,
  });
}

export function renderAgentTrainingFeedbackCreateArticleForm(options: {
  admin: AdminSessionUser;
  detail: AgentFeedbackDetail;
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
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const body = `
    <div class="tv-page-head">
      <h1 class="tv-page-title">Crear artículo desde feedback</h1>
      <p class="tv-page-sub"><a href="/admin/agent-training/feedback/${escapeHtml(options.detail.id)}">← Detalle feedback</a></p>
    </div>
    <div class="tv-panel" style="margin-bottom:1rem">
      <p><strong>Pregunta:</strong> ${escapeHtml(options.detail.user_question ?? "—")}</p>
      <p class="field-hint">Canal: ${escapeHtml(options.detail.channel)} · Rating: ${options.detail.rating != null && options.detail.rating <= 2 ? "No útil" : "Útil"}</p>
    </div>
    ${errorBlock}
    <div class="tv-panel">
      <form method="post" action="/admin/agent-training/feedback/${escapeHtml(options.detail.id)}/create-article">
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
          <input id="allowed_channels" name="allowed_channels" value="${escapeHtml(val("allowed_channels", p.allowed_channels.join(", ")))}" />
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
          <label for="content">Contenido (respuesta correcta)</label>
          <textarea id="content" name="content" rows="10" required>${escapeHtml(val("content", p.content))}</textarea>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_active" value="1" checked /> Activo</label>
        </div>
        <button type="submit" class="btn btn-primary">Guardar artículo y marcar feedback</button>
      </form>
    </div>`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Artículo desde feedback",
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
