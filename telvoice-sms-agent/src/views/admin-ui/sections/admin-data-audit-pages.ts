import type { AdminSessionUser } from "../../../types/admin.js";
import type {
  AuditSummary,
  AuditGenerateJobStatus,
  CleanupDryRunResult,
  ClientPurchaseAuditReport,
  ProtectedClientBundle,
} from "../../../types/adminDataAudit.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { renderBtn, renderPageHeader, renderPanel } from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

export type AdminDataAuditPageOpts = {
  admin: AdminSessionUser;
  smsBalance?: string;
  flash?: string;
  error?: string;
};

function alertHtml(flash?: string, error?: string): string {
  const parts: string[] = [];
  if (flash) {
    parts.push(`<div class="alert alert-success">${escapeHtml(flash)}</div>`);
  }
  if (error) {
    parts.push(`<div class="alert alert-danger">${escapeHtml(error)}</div>`);
  }
  return parts.join("");
}

function renderSummaryKpis(summary: AuditSummary): string {
  const fc = summary.flagCounts;
  return `<div class="tv-kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(10rem,1fr));gap:0.75rem;margin-bottom:1rem">
    ${renderKpiCard({ label: "Empresas", value: String(summary.totalCompanies), icon: "business" })}
    ${renderKpiCard({ label: "Clientes reales", value: String(summary.totalRealClients), icon: "verified_user", variant: "success" })}
    ${renderKpiCard({ label: "Órdenes reales", value: String(summary.totalRealOrders), icon: "shopping_cart", variant: "success" })}
    ${renderKpiCard({ label: "Órdenes QA", value: String(summary.totalQaOrders), icon: "science", variant: "warn" })}
    ${renderKpiCard({ label: "Wallets reales", value: String(summary.totalRealWallets), icon: "account_balance_wallet" })}
    ${renderKpiCard({ label: "SMS reales", value: String(summary.totalRealMessages), icon: "forum", variant: "success" })}
    ${renderKpiCard({ label: "SMS QA", value: String(summary.totalQaMessages), icon: "bug_report", variant: "warn" })}
    ${renderKpiCard({ label: "Huérfanos", value: String(summary.totalOrphans), icon: "link_off", variant: "danger" })}
    ${renderKpiCard({ label: "Revisión pendiente", value: String(summary.totalReviewRequired), icon: "pending", variant: "warn" })}
    ${renderKpiCard({ label: "Flags total", value: String(summary.totalFlags), icon: "flag" })}
    ${renderKpiCard({ label: "Protegidos", value: String(summary.totalProtected), icon: "shield", variant: "success" })}
  </div>
  <p class="field-hint">Clasificación flags: PROD_REAL ${fc.PROD_REAL} · PROD_INTERNAL ${fc.PROD_INTERNAL} · QA_TEST ${fc.QA_TEST} · DEMO_SEED ${fc.DEMO_SEED} · ORPHAN ${fc.ORPHAN} · REVIEW_REQUIRED ${fc.REVIEW_REQUIRED}${summary.totalArchived ? ` · archivados ${summary.totalArchived}` : ""}</p>
  <p class="field-hint">Última auditoría: ${summary.lastAuditAt ? escapeHtml(formatDate(summary.lastAuditAt)) : "— (ejecuta «Generar auditoría»)"}</p>`;
}

function renderGenerationStatusPanel(status: AuditGenerateJobStatus): string {
  if (status.running) {
    return `<div class="alert alert-info" style="margin-bottom:1rem">Generación de auditoría <strong>en curso</strong>${status.startedAt ? ` desde ${escapeHtml(formatDate(status.startedAt))}` : ""}. Refresca la página para ver el avance.</div>`;
  }
  if (status.lastError) {
    return `<div class="alert alert-danger" style="margin-bottom:1rem">Última generación falló: ${escapeHtml(status.lastError)}${status.finishedAt ? ` (${escapeHtml(formatDate(status.finishedAt))})` : ""}</div>`;
  }
  if (status.lastResult) {
    return `<div class="alert alert-success" style="margin-bottom:1rem">Última generación OK: ${status.lastResult.inserted} flags clasificados${status.finishedAt ? ` · ${escapeHtml(formatDate(status.finishedAt))}` : ""}</div>`;
  }
  return "";
}

function renderProtectedBlock(bundle: ProtectedClientBundle): string {
  const companyName = bundle.company?.name ? String(bundle.company.name) : "—";
  const order = bundle.orders[0];
  const wallet = bundle.wallets[0];
  return renderPanel(
    "Datos protegidos — cliente real",
    `<div class="alert alert-success" style="margin-bottom:0.75rem">
        <strong>${escapeHtml(bundle.fullName ?? "Arturo Aguilar")}</strong> ·
        <code>${escapeHtml(bundle.email)}</code> · TalkChile
        <span class="badge badge-success" style="margin-left:0.5rem">PROD_REAL</span>
      </div>
      <dl class="meta-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:0.5rem 1rem;margin:0">
        <div><dt class="field-hint">Empresa</dt><dd>${escapeHtml(companyName)}</dd></div>
        <div><dt class="field-hint">Orden</dt><dd><code>${order?.id ? escapeHtml(String(order.id).slice(0, 8)) : "—"}</code> ${order ? escapeHtml(`${order.payment_status}/${order.credit_status}`) : ""}</dd></div>
        <div><dt class="field-hint">Wallet</dt><dd>${wallet ? `${wallet.available_sms} disp. / ${wallet.consumed_sms} consumidos` : "—"}</dd></div>
        <div><dt class="field-hint">Emails</dt><dd>${bundle.emailCount} (billing + transaccionales)</dd></div>
        <div><dt class="field-hint">SMS enviados</dt><dd>${bundle.messageCount}</dd></div>
        <div><dt class="field-hint">DLR</dt><dd>${bundle.deliveryEvents.length} evento(s)</dd></div>
      </dl>
      <p style="margin:0.75rem 0 0">
        <a href="/admin/data-cleanup/client-audit?email=${encodeURIComponent(bundle.email)}">Ver auditoría completa del cliente →</a>
      </p>`,
  );
}

function renderCandidatesTable(
  title: string,
  rows: Array<{ entity_type: string; entity_id: string; classification: string; reason: string | null; confidence?: number }>,
): string {
  if (rows.length === 0) {
    return renderPanel(title, `<p class="field-hint">Sin registros en esta categoría.</p>`);
  }
  const trs = rows
    .map(
      (r) => `<tr>
        <td><code>${escapeHtml(r.entity_type)}</code></td>
        <td><code>${escapeHtml(String(r.entity_id).slice(0, 12))}</code></td>
        <td><span class="badge badge-warn">${escapeHtml(r.classification)}</span></td>
        <td>${escapeHtml(r.reason ?? "—")}</td>
        <td>${r.confidence != null ? escapeHtml(String(r.confidence)) : "—"}</td>
      </tr>`,
    )
    .join("");
  return renderPanel(
    title,
    `<div class="table-wrap"><table class="table table-sm">
      <thead><tr><th>Tipo</th><th>ID</th><th>Clasificación</th><th>Motivo</th><th>Conf.</th></tr></thead>
      <tbody>${trs}</tbody>
    </table></div>`,
  );
}

function renderDryRunPanel(dry: CleanupDryRunResult | null): string {
  if (!dry) {
    return renderPanel(
      "Dry-run limpieza",
      `<p class="field-hint">Ejecuta «Dry-run limpieza» para ver qué se archivaría o eliminaría. No modifica datos.</p>`,
    );
  }
  const archiveRows = dry.archiveCandidates
    .slice(0, 40)
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.entityType)}</td><td><code>${escapeHtml(r.entityId.slice(0, 12))}</code></td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.classification)}</td></tr>`,
    )
    .join("");
  const deleteRows = dry.hardDeleteCandidates
    .slice(0, 40)
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.entityType)}</td><td><code>${escapeHtml(r.entityId.slice(0, 12))}</code></td><td>${escapeHtml(r.table)}</td><td>${escapeHtml(r.classification)}</td></tr>`,
    )
    .join("");
  return renderPanel(
    "Resultado dry-run",
    `<p>Archivar: <strong>${dry.archiveCandidates.length}</strong> · Hard delete: <strong>${dry.hardDeleteCandidates.length}</strong> · Protegidos omitidos: ${dry.skippedProtected} · Baja confianza: ${dry.skippedLowConfidence}</p>
      <h3 class="tv-section-head__title" style="font-size:0.95rem">Archivo lógico (muestra)</h3>
      <div class="table-wrap"><table class="table table-sm"><thead><tr><th>Tipo</th><th>ID</th><th>Acción</th><th>Clase</th></tr></thead><tbody>${archiveRows || "<tr><td colspan=4>—</td></tr>"}</tbody></table></div>
      <h3 class="tv-section-head__title" style="font-size:0.95rem;margin-top:1rem">Hard delete (muestra)</h3>
      <div class="table-wrap"><table class="table table-sm"><thead><tr><th>Tipo</th><th>ID</th><th>Tabla</th><th>Clase</th></tr></thead><tbody>${deleteRows || "<tr><td colspan=4>—</td></tr>"}</tbody></table></div>`,
  );
}

export function renderAdminDataCleanupPage(
  opts: AdminDataAuditPageOpts,
  ctx: {
    summary: AuditSummary;
    protectedBundle: ProtectedClientBundle;
    candidates: Array<{
      entity_type: string;
      entity_id: string;
      classification: string;
      reason: string | null;
      confidence: number;
    }>;
    dryRun: CleanupDryRunResult | null;
    generationStatus: AuditGenerateJobStatus;
  },
): string {
  const generateDisabled = ctx.generationStatus.running;
  const body = `
    ${renderSuperadminBanner()}
    ${alertHtml(opts.flash, opts.error)}
    ${renderGenerationStatusPanel(ctx.generationStatus)}
    ${renderPageHeader({
      title: "Limpieza de datos",
      subtitle: "Auditoría y archivado seguro · Operación interna Telvoice",
    })}
    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem">
      <form method="post" action="/admin/data-cleanup/generate">${renderBtn("Generar auditoría", { type: "submit", variant: "primary", icon: "fact_check", disabled: generateDisabled })}</form>
      <form method="post" action="/admin/data-cleanup/dry-run">${renderBtn("Dry-run limpieza", { type: "submit", variant: "secondary", icon: "preview" })}</form>
    </div>
    ${renderSummaryKpis(ctx.summary)}
    ${renderProtectedBlock(ctx.protectedBundle)}
    ${renderCandidatesTable("Candidatos a limpieza (QA / demo / huérfanos)", ctx.candidates)}
    ${renderDryRunPanel(ctx.dryRun)}
    ${renderPanel(
      "Aplicar limpieza",
      `<div class="alert alert-warn">Solo archiva o elimina registros <strong>no protegidos</strong> con clasificación QA/demo/huérfano. Nunca toca <code>protected=true</code>.</div>
        <form method="post" action="/admin/data-cleanup/apply" style="max-width:28rem;margin-top:0.75rem">
          <label class="field-label">Confirmación (escribe exactamente)</label>
          <input type="text" name="confirmation" class="input" placeholder="LIMPIAR SOLO DATOS QA" required autocomplete="off" style="width:100%;margin-bottom:0.5rem" />
          ${renderBtn("Aplicar limpieza", { type: "submit", variant: "primary", icon: "delete_sweep" })}
        </form>`,
    )}
  `;
  return wrapAdminPage({
    admin: opts.admin,
    title: "Limpieza de datos",
    body,
    activeNav: "data-cleanup",
  });
}

export function renderAdminClientAuditPage(
  opts: AdminDataAuditPageOpts,
  report: ClientPurchaseAuditReport,
): string {
  const statusBadge = report.ok
    ? `<span class="badge badge-success">OK</span>`
    : `<span class="badge badge-warn">Revisar</span>`;
  const issuesHtml =
    report.issues.length > 0
      ? `<ul>${report.issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      : `<p class="field-hint">Sin incidencias detectadas.</p>`;
  const timelineRows = report.timeline
    .map(
      (t) =>
        `<tr><td>${escapeHtml(formatDate(t.at))}</td><td>${escapeHtml(t.kind)}</td><td>${escapeHtml(t.label)}</td><td>${escapeHtml(t.detail ?? "")}</td></tr>`,
    )
    .join("");
  const pay = report.payment;
  const body = `
    ${renderSuperadminBanner()}
    ${alertHtml(opts.flash, opts.error)}
    ${renderPageHeader({
      title: "Auditoría de compra",
      subtitle: `${report.email} ${statusBadge}`,
      actions: renderBtn("Volver", { href: "/admin/data-cleanup", variant: "ghost" }),
    })}
    ${renderPanel(
      "Resumen de integridad",
      `<dl class="meta-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(12rem,1fr));gap:0.5rem">
        <div><dt class="field-hint">Crédito duplicado</dt><dd>${pay.duplicateCredits ? "⚠ Sí" : "No"} (${pay.purchaseCreditCount})</dd></div>
        <div><dt class="field-hint">Invoice duplicada</dt><dd>${pay.duplicateInvoices ? "⚠ Sí" : "No"} (${pay.invoiceCount})</dd></div>
        <div><dt class="field-hint">Email comprobante dup.</dt><dd>${pay.duplicateReceiptEmails ? "⚠ Sí" : "No"} (${pay.receiptEmailCount})</dd></div>
        <div><dt class="field-hint">MP notificaciones</dt><dd>${pay.mercadoPagoNotificationCount}${pay.duplicateMercadoPagoNotifications ? " ⚠" : ""}</dd></div>
        <div><dt class="field-hint">Idempotencia OK</dt><dd>${pay.idempotencyOk ? "Sí" : "No"}</dd></div>
        <div><dt class="field-hint">Wallet 1 crédito</dt><dd>${pay.walletCreditedOnce ? "Sí" : "No"}</dd></div>
        <div><dt class="field-hint">Cliente activo</dt><dd>${pay.clientActivated ? "Sí" : "No"}</dd></div>
      </dl>
      <h3 style="font-size:0.95rem;margin:1rem 0 0.35rem">Incidencias</h3>
      ${issuesHtml}`,
    )}
    ${renderPanel(
      "Timeline compra → SMS",
      `<div class="table-wrap"><table class="table table-sm">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Evento</th><th>Detalle</th></tr></thead>
        <tbody>${timelineRows || "<tr><td colspan=4>—</td></tr>"}</tbody>
      </table></div>`,
    )}
    ${renderPanel(
      "Órdenes",
      `<pre style="font-size:0.75rem;overflow:auto">${escapeHtml(JSON.stringify(report.orders, null, 2))}</pre>`,
    )}
  `;
  return wrapAdminPage({
    admin: opts.admin,
    title: "Auditoría cliente",
    body,
    activeNav: "data-cleanup",
  });
}
