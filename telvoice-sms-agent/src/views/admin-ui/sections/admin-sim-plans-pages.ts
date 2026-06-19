import { escapeHtml, formatDate } from "../../../utils/html.js";
import { fmtMoney } from "../../app-ui/app-page-wrap.js";
import type { AdminSessionUser } from "../../../types/admin.js";
import type { SimPlanSettingsRow } from "../../../services/simPlanSettingsService.js";
import { renderLayout } from "../shell.js";

function yesNo(value: boolean): string {
  return value ? "Sí" : "No";
}

function renderPlanTable(plans: SimPlanSettingsRow[]): string {
  if (!plans.length) {
    return `<p class="field-hint">No hay planes configurados.</p>`;
  }

  const rows = plans
    .map(
      (plan) => `<tr>
        <td><strong>${escapeHtml(plan.label)}</strong><br><span class="field-hint">${escapeHtml(plan.plan_id)}</span></td>
        <td>${plan.is_visible ? '<span class="badge badge-ok">Visible</span>' : '<span class="badge badge-warn">Oculto</span>'}</td>
        <td>${escapeHtml(fmtMoney(plan.monthly_price_clp))}</td>
        <td>${escapeHtml(String(plan.annual_discount_percent))}%</td>
        <td>${escapeHtml(yesNo(plan.annual_enabled))}</td>
        <td>${escapeHtml(String(plan.included_sms))}</td>
        <td>${plan.is_featured ? "★" : "—"}</td>
        <td>${formatDate(plan.updated_at)}</td>
        <td><a class="btn btn-secondary btn-sm" href="/admin/sim-plans/${escapeHtml(plan.plan_id)}/edit">Editar</a></td>
      </tr>`,
    )
    .join("");

  return `<div class="card table-wrap" style="padding:0">
    <table>
      <thead>
        <tr>
          <th>Plan</th>
          <th>Visible</th>
          <th>Precio mensual</th>
          <th>Desc. anual</th>
          <th>Anual activo</th>
          <th>SMS incl.</th>
          <th>Destacado</th>
          <th>Actualizado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function renderAdminSimPlansListPage(options: {
  admin: AdminSessionUser;
  plans: SimPlanSettingsRow[];
  flash?: string;
  error?: string;
}): string {
  const flashBlock = options.flash
    ? `<div class="alert alert-ok">${escapeHtml(options.flash)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const body = `
    <h1>Planes SIM</h1>
    <p class="subtitle">Precios, descuento anual y catálogo visible en <code>/app/planes-agente</code>.</p>
    ${flashBlock}
    ${errorBlock}
    ${renderPlanTable(options.plans)}`;

  return renderLayout({
    title: "Planes SIM",
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "sim-plans",
  });
}

export function renderAdminSimPlanEditPage(options: {
  admin: AdminSessionUser;
  plan: SimPlanSettingsRow;
  error?: string;
}): string {
  const plan = options.plan;
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";
  const featuresValue = plan.feature_list.join("\n");
  const isCustom = plan.plan_id === "custom";

  const body = `
    <h1>Editar plan SIM</h1>
    <p class="subtitle"><a href="/admin/sim-plans">← Volver a planes SIM</a></p>
    ${errorBlock}
    <form method="post" action="/admin/sim-plans/${escapeHtml(plan.plan_id)}/edit" class="tv-admin-num-form card" style="max-width:40rem;padding:1.25rem">
      <p><strong>Plan:</strong> ${escapeHtml(plan.label)} (<code>${escapeHtml(plan.plan_id)}</code>)</p>

      <label>Precio mensual (CLP)
        <input name="monthly_price_clp" type="number" min="0" step="1" required value="${plan.monthly_price_clp}" />
      </label>

      <label>SMS incluidos
        <input name="included_sms" type="number" min="0" step="1" required value="${plan.included_sms}" />
      </label>

      <label>Descuento anual (%)
        <input name="annual_discount_percent" type="number" min="0" max="80" step="0.01" required value="${plan.annual_discount_percent}" ${isCustom ? "disabled" : ""} />
      </label>

      <label class="actions-row">
        <input type="checkbox" name="annual_enabled" value="1" ${plan.annual_enabled ? "checked" : ""} ${isCustom ? "disabled" : ""} />
        Anual habilitado
      </label>

      <label class="actions-row">
        <input type="checkbox" name="is_visible" value="1" ${plan.is_visible ? "checked" : ""} />
        Visible en panel
      </label>

      <label class="actions-row">
        <input type="checkbox" name="is_featured" value="1" ${plan.is_featured ? "checked" : ""} />
        Destacado
      </label>

      <label>Badge
        <input name="badge" type="text" maxlength="80" value="${escapeHtml(plan.badge ?? "")}" />
      </label>

      <label>Ribbon
        <input name="ribbon" type="text" maxlength="80" value="${escapeHtml(plan.ribbon ?? "")}" />
      </label>

      <label>Descripción corta
        <textarea name="short_description" rows="3">${escapeHtml(plan.short_description ?? "")}</textarea>
      </label>

      <label>Features (una por línea)
        <textarea name="feature_list" rows="8">${escapeHtml(featuresValue)}</textarea>
      </label>

      <div class="actions-row" style="margin-top:1rem">
        <button type="submit" class="btn btn-primary">Guardar</button>
        <a class="btn btn-secondary" href="/admin/sim-plans">Cancelar</a>
      </div>
    </form>`;

  return renderLayout({
    title: `Editar ${plan.label}`,
    body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: "sim-plans",
  });
}
