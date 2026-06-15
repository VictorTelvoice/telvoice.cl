(function () {
  "use strict";

  var ANNUAL_DISCOUNT = 20;
  var PLANS = {
    sim_starter: { name: "Starter", monthly: 29990, sms: "1.000 SMS salientes incluidos", agent: "agent_start" },
    sim_pro: { name: "Pro", monthly: 49990, sms: "2.000 SMS salientes incluidos", agent: "agent_pro" },
  };
  var state = { planId: "sim_starter", billing: "monthly", open: false, busy: false, numbers: [], selectedNumber: null };

  function $(id) { return document.getElementById(id); }
  function money(n) { return "$" + new Intl.NumberFormat("es-CL").format(Math.round(Number(n) || 0)); }
  function origin() { return (window.TELVOICE_CONFIG && window.TELVOICE_CONFIG.agentApiOrigin) || "https://agent.telvoice.cl"; }
  function demo() { return new URLSearchParams(window.location.search).get("demo_numeracion") === "1"; }
  function annual(plan) { return Math.round(plan.monthly * 12 * 0.8); }
  function annualEq(plan) { return Math.round(plan.monthly * 0.8); }
  function billingLabel() { return state.billing === "annual" ? "membresía anual" : "suscripción mensual"; }
  function charge(plan) { return state.billing === "annual" ? annual(plan) : plan.monthly; }

  function setError(text) {
    var node = $("nsim-form-error");
    if (!node) return;
    node.textContent = text || "";
    node.hidden = !text;
  }

  function setBusy(busy) {
    state.busy = busy;
    var btn = $("nsim-submit");
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? "Redirigiendo a Mercado Pago…" : submitLabel();
  }

  function submitLabel() {
    if (state.planId === "custom") return "Solicitar evaluación";
    var plan = PLANS[state.planId];
    return "Activar suscripción " + (plan ? plan.name : "");
  }

  function updatePricing() {
    Object.keys(PLANS).forEach(function (id) {
      var plan = PLANS[id];
      var price = document.querySelector('[data-nsim-price="' + id + '"]');
      var note = document.querySelector('[data-nsim-price-note="' + id + '"]');
      var label = document.querySelector('[data-nsim-billing-label="' + id + '"]');
      if (price) {
        price.innerHTML = state.billing === "annual"
          ? money(annualEq(plan)) + " <span>/ mes eq.</span>"
          : money(plan.monthly) + " <span>/ mes</span>";
      }
      if (note) {
        note.textContent = state.billing === "annual"
          ? "Pago anual: " + money(annual(plan)) + "/año · 20% de descuento."
          : "Pago recurrente mensual.";
      }
      if (label) label.textContent = state.billing === "annual" ? "Membresía anual -20%" : "Suscripción mensual";
    });

    document.querySelectorAll("[data-billing-cycle]").forEach(function (button) {
      var active = button.getAttribute("data-billing-cycle") === state.billing;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function renderSummary() {
    var summary = $("nsim-modal-summary");
    if (!summary) return;
    if (state.planId === "custom") {
      summary.innerHTML = '<p class="nsim-modal-summary__plan">Plan a medida</p><p class="nsim-modal-summary__price">Cotización personalizada</p><ul class="nsim-modal-summary__list"><li>Múltiples números SIM</li><li>Volumen SMS personalizado</li><li>API, Webhooks y automatizaciones avanzadas</li></ul>';
      return;
    }
    var plan = PLANS[state.planId];
    var priceText = state.billing === "annual"
      ? money(annual(plan)) + " / año · equivale a " + money(annualEq(plan)) + " / mes"
      : money(plan.monthly) + " / mes";
    summary.innerHTML = '<p class="nsim-modal-summary__plan">' + plan.name + '</p><p class="nsim-modal-summary__price">' + priceText + '</p><ul class="nsim-modal-summary__list"><li>Modalidad: ' + billingLabel() + '</li><li>1 número SIM real</li><li>' + plan.sms + '</li><li>Agente Telvoice incluido</li></ul>';
  }

  function updateModal() {
    var custom = state.planId === "custom";
    var plan = PLANS[state.planId];
    var title = $("nsim-modal-title");
    var subtitle = $("nsim-modal-subtitle");
    var stepper = $("nsim-modal-stepper");
    var footnote = $("nsim-modal-footnote");
    var submit = $("nsim-submit");

    if (title) title.textContent = custom ? "Solicitar plan a medida" : "Suscripción numeración SIM " + plan.name;
    if (subtitle) subtitle.textContent = custom ? "Cuéntanos qué necesitas y nuestro equipo diseñará una solución para tu empresa." : "Completa tus datos para iniciar una suscripción recurrente por Mercado Pago. Modalidad: " + billingLabel() + ".";
    if (stepper) stepper.hidden = custom;
    if (footnote) {
      footnote.hidden = custom;
      footnote.textContent = state.billing === "annual" ? "La membresía anual se cobra por adelantado con 20% de descuento." : "La numeración se cobra como suscripción mensual recurrente.";
    }
    if (submit) submit.textContent = submitLabel();
    document.querySelectorAll(".nsim-field--checkout-only").forEach(function (el) { el.hidden = custom; });
    document.querySelectorAll(".nsim-field--custom-only").forEach(function (el) { el.hidden = !custom; });
    renderSummary();
  }

  function openModal(planId) {
    state.planId = planId;
    state.open = true;
    setError("");
    updateModal();
    var modal = $("nsim-purchase-modal");
    if (modal) modal.removeAttribute("hidden");
    document.body.classList.add("nsim-modal-open");
    loadNumbers();
  }

  function closeModal() {
    state.open = false;
    state.busy = false;
    var modal = $("nsim-purchase-modal");
    if (modal) modal.setAttribute("hidden", "");
    document.body.classList.remove("nsim-modal-open");
    setError("");
    setBusy(false);
  }

  function values() {
    return {
      nombre: (($("nsim-nombre") || {}).value || "").trim(),
      empresa: (($("nsim-empresa") || {}).value || "").trim(),
      email: (($("nsim-email") || {}).value || "").trim(),
      telefono: (($("nsim-telefono") || {}).value || "").trim(),
      rut: (($("nsim-rut") || {}).value || "").trim(),
      useCase: (($("nsim-use-case") || {}).value || "").trim(),
      volume: (($("nsim-volume") || {}).value || "").trim()
    };
  }

  function renderNumbers(numbers) {
    var picker = $("nsim-number-picker");
    var list = $("nsim-number-list");
    if (!picker || !list || state.planId === "custom") return;
    state.numbers = Array.isArray(numbers) ? numbers : [];
    if (!state.numbers.length) { picker.hidden = true; return; }
    state.selectedNumber = state.numbers[0].inventory_public_id;
    list.innerHTML = state.numbers.slice(0, 10).map(function (n, index) {
      return '<label class="nsim-number-option' + (index === 0 ? ' is-selected' : '') + '"><input type="radio" name="nsim-number" value="' + n.inventory_public_id + '"' + (index === 0 ? ' checked' : '') + ' /><span class="nsim-number-option__body"><span class="nsim-number-option__number">' + n.display_number + '</span><span class="nsim-number-option__note">Disponible para activación inmediata</span></span></label>';
    }).join("");
    picker.hidden = false;
    list.querySelectorAll('input[name="nsim-number"]').forEach(function (input) {
      input.addEventListener("change", function () { state.selectedNumber = input.value; });
    });
  }

  function loadNumbers() {
    if (state.planId === "custom") return;
    if (demo()) {
      renderNumbers([{ inventory_public_id: "demo_001", display_number: "+56 9 *** *** 513" }]);
      return;
    }
    fetch(origin() + "/api/public/sim-available-numbers?limit=50", { headers: { Accept: "application/json" } })
      .then(function (res) { return res.json(); })
      .then(function (data) { renderNumbers(data.numbers || []); })
      .catch(function () { renderNumbers([]); });
  }

  function showDemo(v, plan) {
    var status = $("nsim-modal-status");
    var form = $("nsim-purchase-form");
    var summary = $("nsim-modal-summary");
    var stepper = $("nsim-modal-stepper");
    if (form) form.hidden = true;
    if (summary) summary.hidden = true;
    if (stepper) stepper.hidden = true;
    if (!status) return;
    status.innerHTML = '<p class="nsim-modal-status__eyebrow">Demo local</p><h3 class="nsim-modal-status__title">Aquí se crearía una suscripción recurrente y se abriría Mercado Pago.</h3><div class="nsim-modal-status__meta"><p><strong>Plan:</strong> ' + plan.name + '</p><p><strong>Modalidad:</strong> ' + billingLabel() + '</p><p><strong>Email:</strong> ' + v.email + '</p></div><button type="button" class="nsim-btn-primary nsim-modal-status__close">Entendido</button>';
    status.hidden = false;
    status.querySelector("button").addEventListener("click", closeModal);
  }

  function submit(e) {
    if (e) e.preventDefault();
    if (state.busy) return;
    var v = values();
    if (v.nombre.length < 2) return setError("Ingresa tu nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return setError("Ingresa un email válido.");
    setError("");

    if (state.planId === "custom") {
      window.location.href = "index.html#contacto";
      return;
    }

    var plan = PLANS[state.planId];
    if (demo()) return showDemo(v, plan);

    setBusy(true);
    var payload = {
      product_type: "sim_subscription",
      bundle_type: "sim_agent_bundle",
      billing_mode: "subscription",
      billing_cycle: state.billing,
      recurring: true,
      annual_discount_percent: state.billing === "annual" ? ANNUAL_DISCOUNT : 0,
      sim_plan_id: state.planId,
      agent_addon_id: plan.agent,
      checkout_email: v.email,
      payer_name: v.nombre,
      company_name: v.empresa || undefined,
      phone: v.telefono || undefined,
      tax_id: v.rut || undefined,
      amount: charge(plan),
      currency: "CLP",
      inventory_public_id: state.selectedNumber || undefined
    };

    fetch(origin() + "/api/public/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.text().then(function (text) { return { ok: res.ok, data: text ? JSON.parse(text) : {} }; }); })
      .then(function (result) {
        var data = result.data || {};
        var url = data.checkout_url || data.init_point || data.payment_url;
        if (!result.ok || data.success !== true || !url) throw new Error(data.error || data.message || "El backend aún debe habilitar el checkout recurrente de numeración SIM.");
        window.location.href = url;
      })
      .catch(function (err) { setBusy(false); setError(err.message || "No pudimos iniciar la suscripción."); });
  }

  function initNav() {
    document.querySelectorAll(".site-nav-dropdown-toggle").forEach(function (toggle) {
      var menu = document.getElementById(toggle.getAttribute("aria-controls"));
      if (!menu) return;
      toggle.addEventListener("click", function () {
        var wrap = toggle.closest(".site-nav-dropdown");
        var open = wrap.classList.contains("is-open");
        document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (w) {
          w.classList.remove("is-open");
          w.querySelector(".site-nav-dropdown-toggle").setAttribute("aria-expanded", "false");
          w.querySelector(".site-nav-dropdown-menu").setAttribute("hidden", "");
        });
        if (!open) { wrap.classList.add("is-open"); toggle.setAttribute("aria-expanded", "true"); menu.removeAttribute("hidden"); }
      });
    });
    var menuToggle = $("menu-toggle");
    var mobilePanel = $("mobile-panel");
    if (menuToggle && mobilePanel) {
      menuToggle.addEventListener("click", function () {
        var open = !mobilePanel.classList.contains("hidden");
        mobilePanel.classList.toggle("hidden", open);
        menuToggle.setAttribute("aria-expanded", open ? "false" : "true");
        $("menu-icon-open").classList.toggle("hidden", !open);
        $("menu-icon-close").classList.toggle("hidden", open);
      });
    }
  }

  function init() {
    initNav();
    updatePricing();
    document.querySelectorAll("[data-billing-cycle]").forEach(function (button) {
      button.addEventListener("click", function () { state.billing = button.getAttribute("data-billing-cycle"); updatePricing(); if (state.open) updateModal(); });
    });
    document.querySelectorAll(".nsim-plan-cta").forEach(function (button) {
      button.addEventListener("click", function () { openModal(button.getAttribute("data-nsim-plan")); });
    });
    document.querySelectorAll("[data-scroll-to]").forEach(function (button) {
      button.addEventListener("click", function () { var target = document.getElementById(button.getAttribute("data-scroll-to")); if (target) target.scrollIntoView({ behavior: "smooth" }); });
    });
    var close = $("nsim-modal-close");
    if (close) close.addEventListener("click", closeModal);
    var form = $("nsim-purchase-form");
    if (form) form.addEventListener("submit", submit);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state.open) closeModal(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();