import type { Request, Response } from "express";
import { listUnansweredQuestions } from "../services/agent/agentUnansweredService.js";
import { escapeHtml } from "../utils/html.js";
import { wrapAdminPage } from "../views/admin-ui/admin-page-wrap.js";

export async function getAdminAgentUnanswered(
  req: Request,
  res: Response,
): Promise<void> {
  const rows = await listUnansweredQuestions(80);

  const tableRows = rows.length
    ? rows
        .map(
          (r) => `<tr>
        <td>${escapeHtml(new Date(r.created_at).toLocaleString("es-CL"))}</td>
        <td><span class="tv-tag">${escapeHtml(r.channel)}</span></td>
        <td>${escapeHtml(r.question.slice(0, 120))}${r.question.length > 120 ? "…" : ""}</td>
        <td>${escapeHtml(r.detected_intent ?? "—")}</td>
        <td>${r.confidence != null ? Number(r.confidence).toFixed(2) : "—"}</td>
        <td><a class="btn btn-sm btn-primary" href="/admin/knowledge/new?from_unanswered=${encodeURIComponent(r.id)}&title=${encodeURIComponent(r.question.slice(0, 80))}">Crear artículo</a></td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6">Sin preguntas pendientes.</td></tr>`;

  const body = `
    <div class="tv-page-head">
      <h1 class="tv-page-title">Agente Telvoice — Preguntas sin respuesta</h1>
      <p class="tv-page-sub">Entrenamiento continuo desde Agent Core (todos los canales).</p>
    </div>
    <div class="tv-panel">
      <div class="tv-table-wrap">
        <table class="tv-table">
          <thead>
            <tr>
              <th>Fecha</th><th>Canal</th><th>Pregunta</th><th>Intención</th><th>Conf.</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
    <p class="field-hint" style="margin-top:1rem">
      También: <a href="/admin/knowledge">Base de conocimiento</a> ·
      <a href="/admin/telegram/test-intent">Pruebas de intención Telegram</a>
    </p>`;

  res.type("html").send(
    wrapAdminPage({
      admin: req.adminUser!,
      title: "Agente — Sin respuesta",
      activeNav: "agent-training",
      body,
    }),
  );
}

export async function getAdminAgentHub(
  req: Request,
  res: Response,
): Promise<void> {
  const body = `
    <div class="tv-page-head">
      <h1 class="tv-page-title">Agente Telvoice</h1>
      <p class="tv-page-sub">Núcleo unificado: panel, Telegram, landing y admin.</p>
    </div>
    <div class="tv-kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
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

  res.type("html").send(
    wrapAdminPage({
      admin: req.adminUser!,
      title: "Agente Telvoice",
      activeNav: "agent-training",
      body,
    }),
  );
}
