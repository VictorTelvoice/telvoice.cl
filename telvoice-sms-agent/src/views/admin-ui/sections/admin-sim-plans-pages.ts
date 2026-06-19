import { escapeHtml, formatDate } from "../../../utils/html.js";
import { fmtMoney } from "../../app-ui/app-page-wrap.js";
import type { AdminSessionUser } from "../../../types/admin.js";
import {
  calculatePlanIntroPromo,
  calculateSimPlanPrice,
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
  .tv-sim-plan-admin-promo-warn {
    display: none;
    margin-top: 0.85rem;
    padding: 0.85rem 1rem;
    border-radius: 0.85rem;
    background: #fffbeb;
    border: 1px solid rgba(245, 158, 11, 0.45);
    color: #78350f;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .tv-sim-plan-admin-promo-warn.is-visible { display: block; }
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
        <td>${plan.includes_outbound_sms ? escapeHtml(String(plan.included_sms)) : "—"}</td>
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

function renderAnnualPreview(plan: SimPlanSettingsRow): string {
  const monthly = Math.max(0, Math.round(plan.monthly_price_clp));
  const pricing = calculateSimPlanPrice(plan, "annual");
  if (!plan.annual_enabled) {
    return `<div class="tv-sim-plan-admin-preview"><p>La suscripción anual no estará disponible para este plan.</p></div>`;
  }
  const undiscounted = monthly * 12;
  return `<div class="tv-sim-plan-admin-preview">
    <p><strong>Precio mensual:</strong> ${escapeHtml(fmtMoney(monthly))} / mes</p>
    <p><strong>Pago anual sin descuento:</strong> ${escapeHtml(fmtMoney(undiscounted))} / año</p>
    <p><strong>Descuento anual:</strong> ${Math.round(plan.annual_discount_percent)}%</p>
    <p><strong>Precio anual final:</strong> ${escapeHtml(fmtMoney(pricing.annual_price_clp))} / año</p>
    <p><strong>Equivalente mensual:</strong> ${escapeHtml(fmtMoney(pricing.monthly_equiv_annual_clp))} / mes</p>
  </div>`;
}

function renderOutboundSmsPreview(plan: SimPlanSettingsRow): string {
  if (!plan.includes_outbound_sms || plan.included_sms <= 0) {
    return `<div class="tv-sim-plan-admin-preview" id="tv-sim-outbound-preview"><p>Este plan no incluye SMS salientes mensuales.</p></div>`;
  }
  const fmt = new Intl.NumberFormat("es-CL").format(plan.included_sms);
  return `<div class="tv-sim-plan-admin-preview" id="tv-sim-outbound-preview"><p>Incluye ${escapeHtml(fmt)} SMS salientes cada mes.</p></div>`;
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
        <h2>Precio mensual</h2>
        <div class="tv-sim-plan-admin-grid">
          <label>Precio mensual (CLP)
            <input name="monthly_price_clp" id="tv-sim-monthly-price" type="number" min="0" step="1" required value="${plan.monthly_price_clp}" />
          </label>
        </div>
      </section>

      <section class="tv-sim-plan-admin-card">
        <h2>SMS salientes incluidos</h2>
        <p class="field-hint">Controla si la suscripción incluye bolsa mensual de SMS salientes o solo numeración con recepción SMS.</p>
        <label class="actions-row">
          <input type="checkbox" name="includes_outbound_sms" value="1" id="tv-sim-includes-outbound" ${plan.includes_outbound_sms ? "checked" : ""} ${isCustom ? "disabled" : ""} />
          Incluir SMS salientes mensuales
        </label>
        <label style="margin-top:0.75rem">Cantidad de SMS incluidos
          <input name="included_sms" id="tv-sim-included-sms" type="number" min="0" step="1" value="${plan.includes_outbound_sms ? plan.included_sms : 0}" ${!plan.includes_outbound_sms || isCustom ? "disabled" : ""} />
        </label>
        ${renderOutboundSmsPreview(plan)}
      </section>

      <section class="tv-sim-plan-admin-card">
        <h2>Descuento anual</h2>
        <label class="actions-row">
          <input type="checkbox" name="annual_enabled" value="1" id="tv-sim-annual-enabled" ${plan.annual_enabled ? "checked" : ""} ${isCustom ? "disabled" : ""} />
          Habilitar suscripción anual
        </label>
        <label style="margin-top:0.75rem">Descuento anual (%)
          <input name="annual_discount_percent" id="tv-sim-annual-discount" type="number" min="0" max="80" step="0.01" required value="${plan.annual_discount_percent}" ${isCustom || !plan.annual_enabled ? "disabled" : ""} />
        </label>
        <div id="tv-sim-annual-preview">${renderAnnualPreview(plan)}</div>
      </section>

      <section class="tv-sim-plan-admin-card">
        <h2>Promoción inicial</h2>
        <p class="field-hint">Aplica solo al ciclo mensual del panel cliente. No se combina con el descuento anual.</p>
        <label class="actions-row">
          <input type="checkbox" name="promo_enabled" value="1" id="tv-sim-promo-enabled" ${plan.promo_enabled ? "checked" : ""} ${isCustom ? "disabled" : ""} />
          Activar promoción inicial
        </label>
        <div class="tv-sim-plan-admin-promo-warn${plan.promo_enabled && !isCustom ? " is-visible" : ""}" id="tv-sim-promo-warn" role="status">
          <strong>Importante:</strong> el cambio automático al precio normal después de la promoción aún requiere proceso manual o job programado.
        </div>
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
      ${isCustom ? "" : `<script>(function(){
  var outboundCb=document.getElementById("tv-sim-includes-outbound");
  var outboundQty=document.getElementById("tv-sim-included-sms");
  var outboundPreview=document.getElementById("tv-sim-outbound-preview");
  var monthlyInput=document.getElementById("tv-sim-monthly-price");
  var annualCb=document.getElementById("tv-sim-annual-enabled");
  var annualDiscount=document.getElementById("tv-sim-annual-discount");
  var annualPreview=document.getElementById("tv-sim-annual-preview");
  var promoCb=document.getElementById("tv-sim-promo-enabled");
  var promoWarn=document.getElementById("tv-sim-promo-warn");
  function fmt(n){return new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(n)||0);}
  function syncOutbound(){
    if(!outboundCb||!outboundQty)return;
    var on=outboundCb.checked;
    outboundQty.disabled=!on;
    if(!on){outboundQty.value="0";}
    if(outboundPreview){
      if(!on||Number(outboundQty.value)<=0){
        outboundPreview.innerHTML="<p>Este plan no incluye SMS salientes mensuales.</p>";
      }else{
        outboundPreview.innerHTML="<p>Incluye "+new Intl.NumberFormat("es-CL").format(Number(outboundQty.value))+" SMS salientes cada mes.</p>";
      }
    }
  }
  function syncAnnual(){
    if(!annualCb||!annualDiscount||!annualPreview||!monthlyInput)return;
    var enabled=annualCb.checked;
    annualDiscount.disabled=!enabled;
    if(!enabled){
      annualPreview.innerHTML="<p>La suscripción anual no estará disponible para este plan.</p>";
      return;
    }
    var monthly=Math.max(0,Math.round(Number(monthlyInput.value)||0));
    var discount=Math.min(80,Math.max(0,Number(annualDiscount.value)||0));
    var annualFinal=Math.round(monthly*12*(1-discount/100));
    var monthlyEq=monthly>0?Math.round(annualFinal/12):0;
    annualPreview.innerHTML=
      "<p><strong>Precio mensual:</strong> "+fmt(monthly)+" / mes</p>"+
      "<p><strong>Pago anual sin descuento:</strong> "+fmt(monthly*12)+" / año</p>"+
      "<p><strong>Descuento anual:</strong> "+Math.round(discount)+"%</p>"+
      "<p><strong>Precio anual final:</strong> "+fmt(annualFinal)+" / año</p>"+
      "<p><strong>Equivalente mensual:</strong> "+fmt(monthlyEq)+" / mes</p>";
  }
  function syncPromo(){
    if(!promoCb||!promoWarn)return;
    promoWarn.classList.toggle("is-visible",promoCb.checked);
  }
  if(outboundCb){outboundCb.addEventListener("change",syncOutbound);outboundQty&&outboundQty.addEventListener("input",syncOutbound);}
  if(annualCb){annualCb.addEventListener("change",syncAnnual);annualDiscount&&annualDiscount.addEventListener("input",syncAnnual);monthlyInput&&monthlyInput.addEventListener("input",syncAnnual);}
  if(promoCb){promoCb.addEventListener("change",syncPromo);}
  var form=document.querySelector(".tv-sim-plan-admin-form");
  if(form){form.addEventListener("submit",function(){
    if(outboundQty){outboundQty.disabled=false;if(outboundCb&&!outboundCb.checked)outboundQty.value="0";}
    if(annualDiscount)annualDiscount.disabled=false;
  });}
  syncOutbound();syncAnnual();syncPromo();
})();</script>`}

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
