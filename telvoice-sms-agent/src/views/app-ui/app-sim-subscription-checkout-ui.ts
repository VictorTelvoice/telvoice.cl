export function renderAppSimSubscriptionCheckoutModal(): string {
  return `<div class="tv-sim-checkout-modal" id="tv-sim-checkout-modal" role="dialog" aria-modal="true" aria-labelledby="tv-sim-checkout-title" aria-hidden="true">
  <div class="tv-sim-checkout-modal__backdrop" data-tv-sim-checkout-close tabindex="-1"></div>
  <div class="tv-sim-checkout-modal__panel">
    <header class="tv-sim-checkout-modal__head">
      <div>
        <p class="tv-sim-checkout-modal__eyebrow" id="tv-sim-checkout-eyebrow">Suscripción SIM</p>
        <h2 class="tv-sim-checkout-modal__title" id="tv-sim-checkout-title">Contratar numeración SIM</h2>
      </div>
      <button type="button" class="tv-sim-checkout-modal__close" data-tv-sim-checkout-close aria-label="Cerrar">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </header>

    <div class="tv-sim-checkout-modal__body">
      <div class="tv-sim-checkout-modal__alert tv-sim-checkout-modal__alert--hidden" id="tv-sim-checkout-error" role="alert"></div>
      <div class="tv-sim-checkout-modal__alert tv-sim-checkout-modal__alert--info tv-sim-checkout-modal__alert--hidden" id="tv-sim-checkout-pending" role="status"></div>

      <section class="tv-sim-checkout-modal__section tv-sim-checkout-modal__summary" aria-label="Resumen del plan">
        <div class="tv-sim-checkout-modal__summary-box" id="tv-sim-checkout-plan-summary">
          <p class="tv-sim-checkout-modal__summary-plan" id="tv-sim-checkout-summary-plan">—</p>
          <p class="tv-sim-checkout-modal__summary-price" id="tv-sim-checkout-plan-price">—</p>
          <p class="tv-sim-checkout-modal__summary-meta" id="tv-sim-checkout-plan-meta">—</p>
          <ul class="tv-sim-checkout-modal__summary-features" id="tv-sim-checkout-plan-features"></ul>
        </div>
      </section>

      <section class="tv-sim-checkout-modal__section" aria-label="Numeración">
        <h3 class="tv-sim-checkout-modal__section-title">Numeración</h3>
        <div class="tv-sim-checkout-modal__assignment">
          <label class="tv-sim-checkout-modal__radio">
            <input type="radio" name="tv-sim-assignment" value="auto" checked />
            <span>
              <strong>Asignar automáticamente</strong>
              <small>Telvoice reserva la mejor numeración disponible del pool.</small>
            </span>
          </label>
          <label class="tv-sim-checkout-modal__radio">
            <input type="radio" name="tv-sim-assignment" value="selected" />
            <span>
              <strong>Elegir numeración</strong>
              <small>Selecciona una de las numeraciones disponibles.</small>
            </span>
          </label>
        </div>
        <div class="tv-sim-checkout-modal__numbers tv-sim-checkout-modal__numbers--hidden" id="tv-sim-checkout-numbers-wrap">
          <p class="field-hint" id="tv-sim-checkout-numbers-hint">Cargando numeraciones disponibles…</p>
          <div class="tv-sim-checkout-modal__numbers-grid" id="tv-sim-checkout-numbers"></div>
        </div>
        <div class="tv-sim-checkout-modal__empty tv-sim-checkout-modal__empty--hidden" id="tv-sim-checkout-no-stock">
          <span class="material-symbols-outlined" aria-hidden="true">inventory_2</span>
          <p id="tv-sim-checkout-no-stock-title">No hay numeraciones disponibles en este momento.</p>
          <p class="field-hint" id="tv-sim-checkout-no-stock-hint">Puedes solicitar activación asistida con Telvoice.</p>
          <a href="/app/support" class="btn btn-secondary btn-sm" id="tv-sim-checkout-no-stock-cta">Solicitar activación</a>
        </div>
      </section>

      <section class="tv-sim-checkout-modal__section" aria-label="Datos de facturación">
        <h3 class="tv-sim-checkout-modal__section-title">Datos de tu cuenta</h3>
        <dl class="tv-sim-checkout-modal__profile" id="tv-sim-checkout-profile">
          <dt>Empresa</dt><dd id="tv-sim-profile-company">—</dd>
          <dt>Correo</dt><dd id="tv-sim-profile-email">—</dd>
          <dt>Contacto</dt><dd id="tv-sim-profile-contact">—</dd>
          <dt>Teléfono</dt><dd id="tv-sim-profile-phone">—</dd>
          <dt>RUT</dt><dd id="tv-sim-profile-tax">—</dd>
        </dl>
      </section>
    </div>

    <footer class="tv-sim-checkout-modal__foot">
      <button type="button" class="btn btn-ghost" data-tv-sim-checkout-close>Cancelar</button>
      <button type="button" class="tv-sim-checkout-modal__submit" id="tv-sim-checkout-submit">
        <span class="material-symbols-outlined" aria-hidden="true">payments</span>
        Continuar a MercadoPago
      </button>
    </footer>
  </div>
</div>`;
}

export function getAppSimSubscriptionCheckoutScript(): string {
  return `(function () {
  function boot() {
    var modal = document.getElementById("tv-sim-checkout-modal");
    if (!modal) return;

    var catalogEl = document.getElementById("tv-sim-plan-catalog");
    var catalog = [];
    try {
      catalog = JSON.parse((catalogEl && catalogEl.textContent) || "[]");
    } catch (e) {
      console.error("[tv-sim-checkout] catalog parse failed", e);
      catalog = [];
    }

    var state = {
      open: false,
      planId: null,
      busy: false,
      assignmentMode: "auto",
      selectedPublicId: null,
      numbers: [],
      numbersLoading: false,
      available: 0,
      canAutoAssign: false,
      inStock: true,
      pending: null,
      profile: null,
    };

    function $(id) { return document.getElementById(id); }

    function planById(id) {
      for (var i = 0; i < catalog.length; i++) {
        if (catalog[i].plan_id === id) return catalog[i];
      }
      return null;
    }

    function fmtMoney(n) {
      return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(n) || 0);
    }

    function getBillingCycle() {
      return document.documentElement.getAttribute("data-tv-sim-billing") === "annual" ? "annual" : "monthly";
    }

    function annualTotalFromPlan(plan) {
      if (!plan) return 0;
      if (plan.annual_price_clp) return Number(plan.annual_price_clp);
      var discount = Number(plan.annual_discount_percent) || 20;
      return Math.round(Number(plan.monthly_price_clp || plan.total_amount) * 12 * (1 - discount / 100));
    }

    function annualEqFromPlan(plan) {
      if (!plan) return 0;
      if (plan.monthly_equiv_annual_clp) return Number(plan.monthly_equiv_annual_clp);
      var discount = Number(plan.annual_discount_percent) || 20;
      return Math.round(Number(plan.monthly_price_clp || plan.total_amount) * (1 - discount / 100));
    }

    function setError(msg) {
      var el = $("tv-sim-checkout-error");
      if (!el) return;
      if (!msg) {
        el.textContent = "";
        el.classList.add("tv-sim-checkout-modal__alert--hidden");
        return;
      }
      el.textContent = msg;
      el.classList.remove("tv-sim-checkout-modal__alert--hidden");
    }

    function setPendingBanner(pending) {
      var el = $("tv-sim-checkout-pending");
      if (!el) return;
      if (!pending || !pending.has_pending_order || pending.reservation_expired) {
        el.innerHTML = "";
        el.classList.add("tv-sim-checkout-modal__alert--hidden");
        return;
      }
      if (pending.pricing_stale) {
        el.textContent =
          "Tienes un checkout pendiente con precio anterior. Al continuar crearemos uno nuevo con el precio vigente.";
        el.classList.remove("tv-sim-checkout-modal__alert--hidden");
        return;
      }
      var parts = ["Tienes una suscripción pendiente de pago."];
      if (pending.selected_number) parts.push("Numeración reservada: " + pending.selected_number + ".");
      var html = parts.join(" ");
      if (pending.payment_url) {
        html += ' <a href="' + pending.payment_url + '" class="tv-sim-checkout-modal__pending-link" target="_blank" rel="noopener noreferrer">Continuar pago</a>';
      }
      el.innerHTML = html;
      el.classList.remove("tv-sim-checkout-modal__alert--hidden");
    }

    function planMonthlyAmount(plan) {
      if (!plan) return 0;
      if (getBillingCycle() === "annual") {
        return plan.monthly_price_clp || plan.total_amount;
      }
      if (plan.has_intro_promo) {
        return Number(plan.promo_monthly_price_clp) || plan.monthly_price_clp || plan.total_amount;
      }
      var promo = state.profile && state.profile.starter_promo;
      if (promo && plan.plan_id === "sim_starter") {
        return Number(promo.monthly_clp) || plan.monthly_price_clp || plan.total_amount;
      }
      return plan.monthly_price_clp || plan.total_amount;
    }

    function planIntroPromoNote(plan) {
      if (!plan || getBillingCycle() !== "monthly") return "";
      if (plan.has_intro_promo) {
        var pct = Math.round(Number(plan.promo_discount_percent) || 0);
        var months = Number(plan.promo_duration_months) || 0;
        var regular = plan.regular_monthly_price_clp || plan.monthly_price_clp || plan.total_amount;
        return pct + "% por " + months + " meses · Luego " + fmtMoney(regular) + "/mes. La promoción se aplicará durante los primeros " + months + " meses de la suscripción.";
      }
      var promo = state.profile && state.profile.starter_promo;
      if (promo && plan.plan_id === "sim_starter") {
        return "Promoción " + Math.round((1 - promo.monthly_clp / promo.original_monthly_clp) * 100) + "% por " + promo.duration_months + " meses (regular " + fmtMoney(promo.original_monthly_clp) + "/mes).";
      }
      return "";
    }

    function hasEligibleStock() {
      return (
        state.numbers.length > 0 ||
        state.canAutoAssign ||
        state.available > 0 ||
        state.inStock
      );
    }

    function hasRealZeroStock() {
      return (
        !state.numbersLoading &&
        state.numbers.length === 0 &&
        state.available === 0 &&
        !state.canAutoAssign &&
        !state.inStock
      );
    }

    function syncInventoryFromApi(data) {
      var payload = data || {};
      state.numbers = Array.isArray(payload.numbers) ? payload.numbers : [];
      state.available = Number(
        payload.available != null
          ? payload.available
          : payload.inventory && payload.inventory.available != null
            ? payload.inventory.available
            : 0,
      ) || 0;
      var apiCanAutoAssign =
        payload.can_auto_assign != null
          ? payload.can_auto_assign
          : payload.inventory && payload.inventory.can_auto_assign != null
            ? payload.inventory.can_auto_assign
            : null;
      state.canAutoAssign =
        apiCanAutoAssign === true ||
        state.available > 0 ||
        state.numbers.length > 0 ||
        payload.in_stock === true;
      state.inStock = state.canAutoAssign;
    }

    function hideNoStockBannerIfEligible() {
      if (hasEligibleStock()) {
        setNoStockBanner(null);
        return true;
      }
      return false;
    }

    function canSubmitCheckout() {
      if (state.busy || !state.planId) return false;
      if (state.pending && state.pending.has_pending_order && !state.pending.reservation_expired && !state.pending.pricing_stale) {
        return false;
      }
      if (state.numbersLoading) return false;
      if (!hasEligibleStock()) return false;
      if (state.assignmentMode === "auto") return true;
      if (state.assignmentMode === "selected" && !state.selectedPublicId) return false;
      return true;
    }

    function setBusy(on) {
      state.busy = !!on;
      var btn = $("tv-sim-checkout-submit");
      if (btn) {
        btn.disabled = !canSubmitCheckout();
        btn.classList.toggle("is-loading", on);
      }
    }

    function renderPlanSummary() {
      var plan = planById(state.planId);
      var title = $("tv-sim-checkout-title");
      var summaryPlan = $("tv-sim-checkout-summary-plan");
      var price = $("tv-sim-checkout-plan-price");
      var meta = $("tv-sim-checkout-plan-meta");
      var features = $("tv-sim-checkout-plan-features");
      if (!plan) return;
      if (title) title.textContent = "Contratar numeración SIM " + plan.sim_label;
      if (summaryPlan) summaryPlan.textContent = plan.sim_label;
      var monthly = planMonthlyAmount(plan);
      if (price) {
        var cycle = getBillingCycle();
        price.textContent =
          cycle === "annual"
            ? fmtMoney(annualEqFromPlan(plan)) + " / mes eq."
            : fmtMoney(planMonthlyAmount(plan)) + " / mes";
      }
      if (meta) {
        var cycle = getBillingCycle();
        var discount = Number(plan.annual_discount_percent) || 20;
        var introNote = planIntroPromoNote(plan);
        var smsQty = plan.included_sms || plan.sms_quantity || 0;
        meta.textContent =
          cycle === "annual"
            ? "Pago anual: " + fmtMoney(annualTotalFromPlan(plan)) + "/año · " + discount + "% de descuento. · " + new Intl.NumberFormat("es-CL").format(smsQty) + " SMS incluidos / mes"
            : (introNote ? introNote + " · " : "") + plan.description + " · " + new Intl.NumberFormat("es-CL").format(smsQty) + " SMS incluidos / mes";
      }
      if (features) {
        features.innerHTML = (plan.features || []).map(function (f) {
          return "<li>" + String(f).replace(/</g, "&lt;") + "</li>";
        }).join("");
      }
    }

    function renderProfile() {
      var p = state.profile;
      if (!p) return;
      if ($("tv-sim-profile-company")) $("tv-sim-profile-company").textContent = p.company_name || "—";
      if ($("tv-sim-profile-email")) $("tv-sim-profile-email").textContent = p.email || "—";
      if ($("tv-sim-profile-contact")) $("tv-sim-profile-contact").textContent = p.contact_name || "—";
      if ($("tv-sim-profile-phone")) $("tv-sim-profile-phone").textContent = p.phone || "—";
      if ($("tv-sim-profile-tax")) $("tv-sim-profile-tax").textContent = p.tax_id || "—";
    }

    function shouldShowRealNoStockBanner() {
      return hasRealZeroStock();
    }

    function shouldShowManualEmptyHint() {
      return (
        !state.numbersLoading &&
        state.assignmentMode === "selected" &&
        hasEligibleStock() &&
        !state.numbers.length
      );
    }

    function setNoStockBanner(mode) {
      var empty = $("tv-sim-checkout-no-stock");
      var title = $("tv-sim-checkout-no-stock-title");
      var hint = $("tv-sim-checkout-no-stock-hint");
      var cta = $("tv-sim-checkout-no-stock-cta");
      if (!empty) return;
      if (!mode) {
        empty.classList.add("tv-sim-checkout-modal__empty--hidden");
        return;
      }
      empty.classList.remove("tv-sim-checkout-modal__empty--hidden");
      if (mode === "manual") {
        if (title) title.textContent = "No hay numeraciones visibles para selección manual en este momento.";
        if (hint) hint.textContent = "Puedes usar auto-asignación para continuar.";
        if (cta) cta.style.display = "none";
        return;
      }
      if (title) title.textContent = "No hay numeraciones disponibles en este momento.";
      if (hint) hint.textContent = "Puedes solicitar activación asistida con Telvoice.";
      if (cta) cta.style.display = "";
    }

    function renderNumbers() {
      var wrap = $("tv-sim-checkout-numbers-wrap");
      var grid = $("tv-sim-checkout-numbers");
      var hint = $("tv-sim-checkout-numbers-hint");
      if (!wrap || !grid) return;

      if (state.numbersLoading) {
        setNoStockBanner(null);
        wrap.classList.add("tv-sim-checkout-modal__numbers--hidden");
        return;
      }

      if (
        state.assignmentMode === "auto" &&
        (state.canAutoAssign || state.available > 0 || state.numbers.length > 0)
      ) {
        setNoStockBanner(null);
        wrap.classList.add("tv-sim-checkout-modal__numbers--hidden");
        updateSubmitState();
        return;
      }

      if (hideNoStockBannerIfEligible() && !hasRealZeroStock()) {
        if (state.assignmentMode !== "selected") {
          wrap.classList.add("tv-sim-checkout-modal__numbers--hidden");
          return;
        }
      }

      if (shouldShowRealNoStockBanner()) {
        wrap.classList.add("tv-sim-checkout-modal__numbers--hidden");
        setNoStockBanner("real");
        return;
      }

      setNoStockBanner(null);

      if (state.assignmentMode !== "selected") {
        wrap.classList.add("tv-sim-checkout-modal__numbers--hidden");
        return;
      }

      wrap.classList.remove("tv-sim-checkout-modal__numbers--hidden");
      if (state.numbersLoading) {
        if (hint) hint.textContent = "Cargando numeraciones disponibles…";
        grid.innerHTML = "";
        return;
      }

      if (shouldShowManualEmptyHint()) {
        if (hint) {
          hint.textContent =
            "No hay numeraciones visibles para selección manual. Usa auto-asignación para continuar.";
        }
        grid.innerHTML = "";
        return;
      }

      if (!state.numbers.length) {
        if (hint) hint.textContent = "No hay numeraciones visibles. Usa asignación automática.";
        grid.innerHTML = "";
        return;
      }

      if (
        state.assignmentMode === "selected" &&
        (!state.selectedPublicId ||
          !state.numbers.some(function (n) {
            var id = n.inventory_public_id || n.public_id;
            return id === state.selectedPublicId;
          }))
      ) {
        var first = state.numbers[0];
        state.selectedPublicId = first.inventory_public_id || first.public_id || null;
      }

      if (hint) hint.textContent = "Elige una numeración (máximo " + state.numbers.length + " visibles):";
      grid.innerHTML = state.numbers.map(function (n) {
        var publicId = n.inventory_public_id || n.public_id;
        var selected = state.selectedPublicId === publicId;
        var label = n.display_number || n.masked_number || n.label || "Numeración";
        return '<button type="button" class="tv-sim-checkout-number' + (selected ? " tv-sim-checkout-number--selected" : "") + '" data-public-id="' + publicId + '">' +
          '<span class="tv-sim-checkout-number__label">' + label + "</span>" +
          (n.suffix ? '<span class="tv-sim-checkout-number__suffix">···' + n.suffix + "</span>" : "") +
          "</button>";
      }).join("");
    }

    function updateSubmitState() {
      var btn = $("tv-sim-checkout-submit");
      if (btn) btn.disabled = !canSubmitCheckout();
    }

    function loadContext() {
      state.numbersLoading = true;
      renderNumbers();
      return fetch("/api/app/sim-subscription/available-numbers", { headers: { Accept: "application/json" } })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          if (!state.open) return;
          var data = result.body || {};
          if (!result.ok || data.ok === false) {
            state.numbersLoading = false;
            state.inStock = false;
            state.canAutoAssign = false;
            state.available = 0;
            renderNumbers();
            updateSubmitState();
            return;
          }
          state.profile = data.profile || null;
          syncInventoryFromApi(data);
          state.numbersLoading = false;
          renderProfile();
          renderPlanSummary();
          renderNumbers();
          updateSubmitState();
        })
        .catch(function () {
          if (!state.open) return;
          state.numbersLoading = false;
          state.inStock = false;
          state.canAutoAssign = false;
          state.available = 0;
          setError("No pudimos cargar las numeraciones. Intenta nuevamente.");
          renderNumbers();
          updateSubmitState();
        })
        .then(function () {
          return fetch(
            "/api/app/sim-subscription/pending?plan_id=" +
              encodeURIComponent(state.planId || "") +
              "&billing_cycle=" +
              encodeURIComponent(getBillingCycle()),
            { headers: { Accept: "application/json" } }
          )
            .then(function (res) { return res.json(); })
            .then(function (pending) {
              if (!state.open) return;
              state.pending = pending;
              setPendingBanner(pending);
              updateSubmitState();
            })
            .catch(function () {});
        });
    }

    function openClientSimCheckoutModal(planId) {
      if (!planById(planId)) {
        console.warn("[tv-sim-checkout] plan not found:", planId);
        return;
      }
      state.open = true;
      state.planId = planId;
      state.busy = false;
      state.assignmentMode = "auto";
      state.selectedPublicId = null;
      state.numbers = [];
      state.numbersLoading = true;
      state.available = 0;
      state.canAutoAssign = false;
      state.inStock = false;
      state.profile = null;
      state.pending = null;
      setError("");
      setNoStockBanner(null);
      renderNumbers();
      renderPlanSummary();
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("tv-sim-checkout-modal-open");
      var autoRadio = modal.querySelector('input[name="tv-sim-assignment"][value="auto"]');
      if (autoRadio) autoRadio.checked = true;
      loadContext();
      updateSubmitState();
    }

    function closeModal() {
      state.open = false;
      state.busy = false;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("tv-sim-checkout-modal-open");
      setError("");
      setNoStockBanner(null);
      setBusy(false);
    }

    window.openClientSimCheckoutModal = openClientSimCheckoutModal;

    document.addEventListener("click", function (event) {
      var trigger = event.target && event.target.closest
        ? event.target.closest("[data-tv-sim-plan-open]")
        : null;
      if (trigger) {
        event.preventDefault();
        var planId = trigger.getAttribute("data-tv-sim-plan-open");
        if (planId) openClientSimCheckoutModal(planId);
        return;
      }
      var closeEl = event.target && event.target.closest
        ? event.target.closest("[data-tv-sim-checkout-close]")
        : null;
      if (closeEl && state.open) {
        event.preventDefault();
        closeModal();
      }
    });

    modal.querySelectorAll('input[name="tv-sim-assignment"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        state.assignmentMode = radio.value === "auto" ? "auto" : "selected";
        if (state.assignmentMode === "auto") state.selectedPublicId = null;
        setNoStockBanner(null);
        renderNumbers();
        updateSubmitState();
      });
    });

    modal.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      var pick = target.closest("[data-public-id]");
      if (!pick) return;
      state.selectedPublicId = pick.getAttribute("data-public-id");
      renderNumbers();
      updateSubmitState();
    });

    document.addEventListener("tv-sim-billing-change", function () {
      if (state.open) renderPlanSummary();
    });

    var submitBtn = $("tv-sim-checkout-submit");
    if (submitBtn) {
      submitBtn.addEventListener("click", function () {
        if (state.busy || !state.planId) return;
        var plan = planById(state.planId);
        var cycle = getBillingCycle();
        if (cycle === "annual" && plan && plan.annual_enabled === false) {
          setError("El ciclo anual no está habilitado para este plan.");
          return;
        }
        setError("");
        setBusy(true);
        var payload = {
          plan_id: state.planId,
          billing_cycle: cycle,
          assignment_mode: state.assignmentMode,
        };
        if (state.assignmentMode === "selected" && state.selectedPublicId) {
          payload.inventory_public_id = state.selectedPublicId;
        }
        fetch("/api/app/sim-subscription/checkout", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            return res.json().then(function (body) {
              return { ok: res.ok, body: body };
            });
          })
          .then(function (result) {
            if (result.ok && result.body.checkout_url) {
              window.location.href = result.body.checkout_url;
              return;
            }
            if (result.body && result.body.code === "PENDING_ORDER_EXISTS" && result.body.details && result.body.details.payment_url) {
              if (state.pending && state.pending.pricing_stale) {
                setError("Tu checkout pendiente tiene un precio anterior. Intenta nuevamente para generar uno nuevo.");
                setBusy(false);
                return;
              }
              window.location.href = result.body.details.payment_url;
              return;
            }
            setError((result.body && result.body.error) || "No pudimos iniciar el checkout.");
            setBusy(false);
          })
          .catch(function () {
            setError("Error de conexión. Intenta nuevamente.");
            setBusy(false);
          });
      });
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && state.open) closeModal();
    });

    var params = new URLSearchParams(window.location.search);
    var planParam = params.get("plan");
    if (planParam && planById(planParam)) {
      setTimeout(function () { openClientSimCheckoutModal(planParam); }, 150);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();`;
}


export function getAppSimSubscriptionCheckoutModalStyles(): string {
  return `
    .tv-sim-checkout-modal {
      position: fixed;
      inset: 0;
      z-index: 10050;
      display: none;
      align-items: flex-end;
      justify-content: center;
      padding: 1rem;
      overflow-y: auto;
      background: rgba(19, 27, 46, 0.55);
      backdrop-filter: blur(4px);
    }

    .tv-sim-checkout-modal[aria-hidden="false"] {
      display: flex;
    }

    body.tv-sim-checkout-modal-open {
      overflow: hidden;
    }

    .tv-sim-checkout-modal__backdrop {
      position: absolute;
      inset: 0;
    }

    .tv-sim-checkout-modal__panel {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 32rem;
      max-height: min(92vh, 720px);
      overflow-y: auto;
      border-radius: 1.5rem;
      background: #fff;
      box-shadow: 0 24px 64px rgba(15, 23, 42, 0.2);
      display: flex;
      flex-direction: column;
    }

    @media (min-width: 640px) {
      .tv-sim-checkout-modal {
        align-items: center;
      }
    }

    .tv-sim-checkout-modal__head {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.25rem 1.25rem 1rem;
      border-bottom: 1px solid rgba(195, 198, 214, 0.5);
      background: #fff;
    }

    .tv-sim-checkout-modal__eyebrow {
      margin: 0 0 0.35rem;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0052cc;
    }

    .tv-sim-checkout-modal__title {
      margin: 0;
      font-family: Montserrat, sans-serif;
      font-size: clamp(1.125rem, 2.5vw, 1.375rem);
      font-weight: 800;
      line-height: 1.25;
      color: #131b2e;
    }

    .tv-sim-checkout-modal__close {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border: none;
      border-radius: 9999px;
      background: transparent;
      color: #5c6478;
      cursor: pointer;
    }

    .tv-sim-checkout-modal__close:hover {
      background: rgba(0, 82, 204, 0.08);
      color: #0052cc;
    }

    .tv-sim-checkout-modal__body {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.15rem;
    }

    @media (min-width: 640px) {
      .tv-sim-checkout-modal__body {
        padding: 1.5rem;
      }
    }

    .tv-sim-checkout-modal__section-title {
      margin: 0 0 0.65rem;
      font-family: Montserrat, sans-serif;
      font-size: 0.9375rem;
      font-weight: 800;
      color: #131b2e;
    }

    .tv-sim-checkout-modal__alert {
      padding: 0.85rem 1rem;
      border-radius: 1rem;
      font-size: 0.875rem;
      line-height: 1.45;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.18);
      color: #b91c1c;
    }

    .tv-sim-checkout-modal__alert--info {
      background: rgba(0, 82, 204, 0.05);
      border-color: rgba(0, 82, 204, 0.22);
      color: #0052cc;
    }

    .tv-sim-checkout-modal__alert--hidden {
      display: none;
    }

    .tv-sim-checkout-modal__pending-link {
      font-weight: 800;
      color: inherit;
    }

    .tv-sim-checkout-modal__summary-box {
      padding: 1rem 1.125rem;
      border-radius: 1rem;
      border: 1px solid rgba(0, 82, 204, 0.15);
      background: linear-gradient(180deg, #f8f9ff 0%, #fff 100%);
    }

    .tv-sim-checkout-modal__summary-plan {
      margin: 0;
      font-family: Montserrat, sans-serif;
      font-size: 1.125rem;
      font-weight: 800;
      color: #131b2e;
    }

    .tv-sim-checkout-modal__summary-price {
      margin: 0.35rem 0 0.75rem;
      font-family: Montserrat, sans-serif;
      font-size: 1.2rem;
      font-weight: 800;
      color: #0052cc;
    }

    .tv-sim-checkout-modal__summary-meta {
      margin: 0 0 0.75rem;
      font-size: 0.875rem;
      line-height: 1.55;
      color: #5c6478;
    }

    .tv-sim-checkout-modal__summary-features {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .tv-sim-checkout-modal__summary-features li {
      position: relative;
      padding: 0.3rem 0 0.3rem 1.25rem;
      font-size: 0.875rem;
      color: #5c6478;
      line-height: 1.45;
    }

    .tv-sim-checkout-modal__summary-features li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #0052cc;
      font-weight: 800;
    }

    .tv-sim-checkout-modal__assignment {
      display: grid;
      gap: 0.65rem;
    }

    .tv-sim-checkout-modal__radio {
      display: flex;
      gap: 0.65rem;
      align-items: flex-start;
      padding: 0.85rem 1rem;
      border-radius: 0.85rem;
      border: 1px solid rgba(195, 198, 214, 0.75);
      cursor: pointer;
      background: #fff;
    }

    .tv-sim-checkout-modal__radio:has(input:checked) {
      border-color: rgba(0, 82, 204, 0.35);
      background: rgba(0, 82, 204, 0.04);
    }

    .tv-sim-checkout-modal__radio input {
      margin-top: 0.2rem;
    }

    .tv-sim-checkout-modal__radio strong {
      display: block;
      font-size: 0.9rem;
      color: #131b2e;
    }

    .tv-sim-checkout-modal__radio small {
      display: block;
      margin-top: 0.15rem;
      color: #5c6478;
      line-height: 1.35;
      font-size: 0.8125rem;
    }

    .tv-sim-checkout-modal__numbers--hidden,
    .tv-sim-checkout-modal__empty--hidden {
      display: none;
    }

    .tv-sim-checkout-modal__numbers-grid {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      max-height: 14rem;
      overflow-y: auto;
      margin-top: 0.65rem;
    }

    .tv-sim-checkout-number {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      border-radius: 0.85rem;
      border: 1px solid rgba(195, 198, 214, 0.75);
      background: #fff;
      cursor: pointer;
      text-align: left;
      width: 100%;
    }

    .tv-sim-checkout-number--selected {
      border-color: rgba(0, 82, 204, 0.42);
      box-shadow: 0 0 0 1px rgba(0, 82, 204, 0.12);
      background: rgba(0, 82, 204, 0.04);
    }

    .tv-sim-checkout-number__label {
      font-weight: 800;
      font-size: 0.9375rem;
      color: #131b2e;
    }

    .tv-sim-checkout-number__suffix {
      font-size: 0.8125rem;
      color: #5c6478;
    }

    .tv-sim-checkout-modal__empty {
      margin-top: 0.75rem;
      padding: 1rem;
      border-radius: 0.85rem;
      border: 1px solid rgba(245, 158, 11, 0.35);
      background: #fffbeb;
      text-align: center;
      display: grid;
      gap: 0.5rem;
      justify-items: center;
    }

    .tv-sim-checkout-modal__empty p {
      margin: 0;
      color: #78350f;
      font-size: 0.875rem;
    }

    .tv-sim-checkout-modal__profile {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.35rem 0.85rem;
      margin: 0;
      padding: 1rem;
      border-radius: 0.85rem;
      border: 1px solid rgba(195, 198, 214, 0.5);
      background: #fafbff;
      font-size: 0.875rem;
    }

    .tv-sim-checkout-modal__profile dt {
      color: #5c6478;
    }

    .tv-sim-checkout-modal__profile dd {
      margin: 0;
      font-weight: 600;
      color: #131b2e;
    }

    .tv-sim-checkout-modal__foot {
      display: flex;
      justify-content: flex-end;
      gap: 0.65rem;
      padding: 0.85rem 1.25rem 1.15rem;
      border-top: 1px solid rgba(195, 198, 214, 0.5);
      background: #fff;
    }

    .tv-sim-checkout-modal__submit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      min-height: 2.9rem;
      padding: 0.9rem 1.5rem;
      border: none;
      border-radius: 9999px;
      background: #0052cc;
      color: #fff;
      font-weight: 700;
      font-size: 0.9375rem;
      cursor: pointer;
      box-shadow: 0 8px 24px -8px rgba(0, 82, 204, 0.45);
    }

    .tv-sim-checkout-modal__submit:hover:not(:disabled) {
      background: #0040a2;
    }

    .tv-sim-checkout-modal__submit:disabled,
    .tv-sim-checkout-modal__submit.is-loading {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
    }

    @media (max-width: 640px) {
      .tv-sim-checkout-modal {
        padding: 0;
      }

      .tv-sim-checkout-modal__panel {
        max-height: 100vh;
        border-radius: 1.25rem 1.25rem 0 0;
      }

      .tv-sim-checkout-modal__foot {
        flex-direction: column-reverse;
      }

      .tv-sim-checkout-modal__foot .btn,
      .tv-sim-checkout-modal__submit {
        width: 100%;
        justify-content: center;
      }
    }
  `;
}
