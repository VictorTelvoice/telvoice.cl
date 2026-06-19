import { escapeHtml, formatDate } from "../../../utils/html.js";
import { fmtMoney } from "../../app-ui/app-page-wrap.js";
import type { AdminSessionUser } from "../../../types/admin.js";
import {
  calculatePlanIntroPromo,
  type SimPlanSettingsRow,
} from "../../../services/simPlanSettingsService.js";
import { renderLayout } from "../shell.js";

const ADMIN_SIM_PLAN_FORM_STYLES = `
  .tv-sim-plan-admin-form { max-width: 52rem; display: grid; gap: 1.25rem; }
  .tv-sim-plan-admin-card {
    border: 1px solid rgba(195, 198, 214, 0.75);
    border-radius: 1rem;
    padding: 1.25rem;
    background: #fff;
  }
  .tv-sim-plan-admin-card h2 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 800;
  }
  .tv-sim-plan-admin-grid {
    display: grid;
    gap: 0.85rem;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }
  .tv-sim-plan-admin-preview {
    margin-top: 0.75rem;
    padding: 0.85rem 1rem;
    border-radius: 0.85rem;
    background: rgba(0, 82, 204, 0.05);
    border: 1px solid rgba(0, 82, 204, 0.15);
    font-size: 0.875rem;
    line-height: 1.55;
  }
  .tv-sim-plan-admin-preview p { margin: 0.25rem 0; }
`;


function promoSummary(plan: SimPlanSettingsRow): string {
  const intro = calculatePlanIntroPromo(plan);
  if (!intro.hasIntroPromo) return "—";
  return `${Math.round(intro.promoDiscountPercent)}% · ${intro.promoDurationMonths}m`;
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
        <td>${escapeHtml(promoSummary(plan))}</td>
        <td>${escapeHtml(String(plan.included_sms))}</td>
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
          <th>Promo inicial</th>
          <th>SMS incl.</th>
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
    <style>${ADMIN_SIM_PLAN_FORM_STYLES}</style>
    <h1>Planes SIM</h1>
    <p class="subtitle">Precios, descuento anual, promoción inicial y catálogo visible en <code>/app/planes-agente</code>.</p>
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

function renderPromoPreview(plan: SimPlanSettingsRow): string {
  const intro = calculatePlanIntroPromo(plan);
  if (!intro.hasIntroPromo) {
    return `<div class="tv-sim-plan-admin-preview"><p>Sin promoción inicial activa.</p></div>`;
  }
  return `<div class="tv-sim-plan-admin-preview">
    <p><strong>Precio normal:</strong> ${escapeHtml(fmtMoney(intro.regularMonthlyPriceClp))} / mes</p>
    <p><strong>Precio promocional:</strong> ${escapeHtml(fmtMoney(intro.promoMonthlyPriceClp))} / mes</p>
    <p><strong>Duración:</strong> ${intro.promoDurationMonths} meses</p>
    <p><strong>Luego:</strong> ${escapeHtml(fmtMoney(intro.regularMonthlyPriceClp))} / mes</p>
  </div>`;
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
    <style>${ADMIN_SIM_PLAN_FORM_STYLES}</style>
    <h1>Editar plan SIM</h1>
    <p class="subtitle"><a href="/admin/sim-plans">← Volver a planes SIM</a></p>
    <p><strong>Plan:</strong> ${escapeHtml(plan.label)} (<code>${escapeHtml(plan.plan_id)}</code>)</p>
    ${errorBlock}
    <form method="post" action="/admin/sim-plans/${escapeHtml(plan.plan_id)}/edit" class="tv-sim-plan-admin-form tv-admin-num-form">
      <section class="tv-sim-plan-admin-card">
        <h2>Precio y descuentos</h2>
        <div class="tv-sim-plan-admin-grid">
          <label>Precio mensual (CLP)
            <input name="monthly_price_clp" type="number" min="0" step="1" required value="${plan.monthly_price_clp}" />
          </label>
          <label>SMS incluidos
            <input name="included_sms" type="number" min="0" step="1" required value="${plan.included_sms}" />
          </label>
          <label>Descuento anual (%)
            <input name="annual_discount_percent" type="number" min="0" max="80" step="0.01" required value="${plan.annual_discount_percent}" ${isCustom ? "disabled" : ""} />
          </label>
        </div>
        <label class="actions-row" style="margin-top:0.75rem">
          <input type="checkbox" name="annual_enabled" value="1" ${plan.annual_enabled ? "checked" : ""} ${isCustom ? "disabled" : ""} />
          Anual habilitado
        </label>
      </section>

      <section class="tv-sim-plan-admin-card">
        <h2>Promoción inicial</h2>
        <p class="field-hint">Aplica solo al ciclo mensual del panel cliente. No se combina con el descuento anual.</p>
        <label class="actions-row">
          <input type="checkbox" name="promo_enabled" value="1" ${plan.promo_enabled ? "checked" : ""} ${isCustom ? "disabled" : ""} />
          Activar promoción inicial
        </label>
        <div class="tv-sim-plan-admin-grid" style="margin-top:0.75rem">
          <label>Descuento promocional (%)
            <input name="promo_discount_percent" type="number" min="0" max="100" step="0.01" value="${plan.promo_discount_percent}" ${isCustom ? "disabled" : ""} />
          </label>
          <label>Duración de la promoción (meses)
            <input name="promo_duration_months" type="number" min="0" step="1" value="${plan.promo_duration_months}" ${isCustom ? "disabled" : ""} />
          </label>
          <label>Texto promocional (opcional)
            <input name="promo_label" type="text" maxlength="120" placeholder="50% por 6 meses" value="${escapeHtml(plan.promo_label ?? "")}" ${isCustom ? "disabled" : ""} />
          </label>
        </div>
        ${renderPromoPreview(plan)}
      </section>

      <section class="tv-sim-plan-admin-card">
        <h2>Contenido comercial</h2>
        <div class="tv-sim-plan-admin-grid">
          <label class="actions-row">
            <input type="checkbox" name="is_visible" value="1" ${plan.is_visible ? "checked" : ""} />
            Visible en panel
          </label>
          <label class="actions-row">
            <input type="checkbox" name="is_featured" value="1" ${plan.is_featured ? "checked" : ""} />
            Destacado
          </label>
        </div>
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
      </section>

      <div class="actions-row">
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
