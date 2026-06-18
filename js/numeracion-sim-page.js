/**
 * Landing dedicada — Numeración SIM real Telvoice
 * Checkout público vía sim_subscription (suscripción mensual recurrente MercadoPago).
 */
(function () {
  "use strict";

  var ANNUAL_DISCOUNT = 20;
  var PLANS = {
    sim_starter: {
      name: "Starter",
      monthly: 29990,
      sms: "1.000 SMS salientes incluidos",
      agent: "agent_start",
    },
    sim_pro: {
      name: "Pro",
      monthly: 49990,
      sms: "2.000 SMS salientes incluidos",
      agent: "agent_pro",
    },
  };

  var DEFAULT_ERROR =
    "No pudimos iniciar la suscripción. Inténtalo nuevamente o contáctanos.";
  var ANNUAL_NOT_READY =
    "La membresía anual estará disponible pronto. Por ahora elige modalidad mensual.";
  var NUMBER_TAKEN =
    "Esta numeración ya no está disponible. Elige otra numeración.";
  var NUMBERS_PAGE_SIZE = 10;

  var state = {
    planId: "sim_starter",
    billing: "monthly",
    open: false,
    busy: false,
    numbersLoading: false,
    inventoryEmpty: false,
    numbers: [],
    numbersLimit: NUMBERS_PAGE_SIZE,
    selectedNumber: null,
    assignmentMode: "auto",
    pendingOrder: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function money(n) {
    return "$" + new Intl.NumberFormat("es-CL").format(Math.round(Number(n) || 0));
  }

  function origin() {
    return (
      (window.TELVOICE_CONFIG && window.TELVOICE_CONFIG.agentApiOrigin) ||
      "https://agent.telvoice.cl"
    );
  }

  function demo() {
    try {
      return new URLSearchParams(window.location.search).get("demo_numeracion") === "1";
    } catch (e) {
      return false;
    }
  }

  function annual(plan) {
    return Math.round(plan.monthly * 12 * 0.8);
  }

  function annualEq(plan) {
    return Math.round(plan.monthly * 0.8);
  }

  function billingLabel() {
    return state.billing === "annual" ? "membresía anual" : "pago mensual";
  }

  function charge(plan) {
    return state.billing === "annual" ? annual(plan) : plan.monthly;
  }

  function getHumanErrorMessage(dataOrError, fallback) {
    if (!dataOrError) {
      return typeof fallback === "string" && fallback.trim() && fallback !== "[object Object]"
        ? fallback.trim()
        : DEFAULT_ERROR;
    }

    if (typeof dataOrError === "string") {
      return dataOrError.trim() || DEFAULT_ERROR;
    }

    if (dataOrError instanceof Error) {
      var msg = dataOrError.message;
      if (typeof msg === "string" && msg.trim() && msg !== "[object Object]") {
        return msg.trim();
      }
    }

    if (typeof dataOrError.message === "string" && dataOrError.message.trim()) {
      return dataOrError.message.trim();
    }

    var apiErr = dataOrError.error;
    if (typeof apiErr === "string" && apiErr.trim()) {
      return apiErr.trim();
    }
    if (apiErr && typeof apiErr === "object") {
      if (typeof apiErr.message === "string" && apiErr.message.trim()) {
        return apiErr.message.trim();
      }
      if (apiErr.code === "SIM_SUBSCRIPTION_NOT_READY" || apiErr.code === "SUBSCRIPTION_NOT_READY") {
        return "La suscripción mensual aún no está disponible para este plan.";
      }
      if (apiErr.code === "MP_PREAPPROVAL_FAILED") {
        return "No pudimos iniciar la suscripción en MercadoPago. Intenta nuevamente.";
      }
      if (apiErr.code === "PENDING_ORDER_EXISTS") {
        return "Ya tienes una orden pendiente. Continúa el pago anterior.";
      }
      if (
        apiErr.code === "NO_STOCK" ||
        apiErr.code === "no_stock" ||
        apiErr.code === "NUMBER_UNAVAILABLE"
      ) {
        return NUMBER_TAKEN;
      }
      if (typeof apiErr.code === "string" && apiErr.code.trim()) {
        return apiErr.code.trim();
      }
    }

    if (dataOrError.details && typeof dataOrError.details.message === "string") {
      return dataOrError.details.message.trim();
    }
    if (typeof dataOrError.code === "string" && dataOrError.code.trim()) {
      return dataOrError.code.trim();
    }

    return typeof fallback === "string" && fallback.trim() && fallback !== "[object Object]"
      ? fallback.trim()
      : DEFAULT_ERROR;
  }

  function setError(text) {
    var node = $("nsim-form-error");
    if (!node) return;
    node.textContent = text || "";
    node.hidden = !text;
  }

  function setBusy(busy) {
    state.busy = busy;
    updateSubmitState();
    var btn = $("nsim-submit");
    if (!btn) return;
    btn.textContent = busy ? "Redirigiendo a MercadoPago…" : submitLabel();
  }

  function canSubmitCheckout() {
    if (state.planId === "custom") return true;
    if (state.busy || state.numbersLoading) return false;
    if (
      state.pendingOrder &&
      state.pendingOrder.has_pending_order &&
      !state.pendingOrder.reservation_expired &&
      state.pendingOrder.payment_url
    ) {
      return true;
    }
    if (state.inventoryEmpty) return false;
    if (!state.numbers.length) return false;
    if (state.assignmentMode === "auto") return true;
    return Boolean(state.selectedNumber);
  }

  function updateSubmitState() {
    var btn = $("nsim-submit");
    if (!btn || state.planId === "custom") return;
    btn.disabled = state.busy || !canSubmitCheckout();
  }

  function submitLabel() {
    if (state.planId === "custom") return "Solicitar evaluación";
    var plan = PLANS[state.planId];
    return plan ? "Activar suscripción " + plan.name : "Activar suscripción";
  }

  function clearPersonalFormFields() {
    ["nsim-nombre", "nsim-empresa", "nsim-telefono", "nsim-rut", "nsim-use-case", "nsim-volume"].forEach(
      function (id) {
        var el = $(id);
        if (el) el.value = "";
      }
    );
    var email = $("nsim-email");
    if (email) email.value = "";
  }

  function updatePricing() {
    Object.keys(PLANS).forEach(function (id) {
      var plan = PLANS[id];
      var price = document.querySelector('[data-nsim-price="' + id + '"]');
      var note = document.querySelector('[data-nsim-price-note="' + id + '"]');
      var label = document.querySelector('[data-nsim-billing-label="' + id + '"]');
      if (price) {
        price.innerHTML =
          state.billing === "annual"
            ? money(annualEq(plan)) + " <span>/ mes eq.</span>"
            : money(plan.monthly) + " <span>/ mes</span>";
      }
      if (note) {
        note.textContent =
          state.billing === "annual"
            ? "Pago anual: " + money(annual(plan)) + "/año · 20% de descuento."
            : "Suscripción mensual recurrente por MercadoPago.";
      }
      if (label) {
        label.textContent =
          state.billing === "annual" ? "Membresía anual -20%" : "Pago mensual";
      }
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
      summary.innerHTML =
        '<p class="nsim-modal-summary__plan">Plan a medida</p><p class="nsim-modal-summary__price">Cotización personalizada</p><ul class="nsim-modal-summary__list"><li>Múltiples números SIM</li><li>Volumen SMS personalizado</li><li>API, Webhooks y automatizaciones avanzadas</li></ul>';
      return;
    }
    var plan = PLANS[state.planId];
    var priceText =
      state.billing === "annual"
        ? money(annual(plan)) + " / año · equivale a " + money(annualEq(plan)) + " / mes"
        : money(plan.monthly) + " / mes";
    summary.innerHTML =
      '<p class="nsim-modal-summary__plan">' +
      plan.name +
      '</p><p class="nsim-modal-summary__price">' +
      priceText +
      '</p><ul class="nsim-modal-summary__list"><li>Modalidad: ' +
      billingLabel() +
      '</li><li>1 número SIM real (suscripción mensual)</li><li>' +
      plan.sms +
      " mensuales incluidos</li><li>Agente Telvoice incluido</li><li>Cobro mensual recurrente por MercadoPago</li></ul>";
  }

  function hidePendingOrder() {
    var block = $("nsim-pending-order");
    if (block) {
      block.hidden = true;
      block.innerHTML = "";
    }
  }

  function renderPendingOrder(pending) {
    var block = $("nsim-pending-order");
    var submitBtn = $("nsim-submit");
    if (!block) return;

    if (!pending || !pending.has_pending_order) {
      hidePendingOrder();
      if (submitBtn) submitBtn.hidden = false;
      return;
    }

    var ref = pending.public_reference || "—";
    var amount = pending.amount != null ? money(pending.amount) : "—";
    var number = pending.selected_number || "Numeración reservada";
    var expired = pending.reservation_expired === true;

    block.innerHTML =
      '<p class="nsim-pending-order__title">' +
      (expired
        ? "Tienes una suscripción pendiente con reserva expirada."
        : "Ya tienes una suscripción pendiente para esta numeración.") +
      "</p>" +
      '<div class="nsim-pending-order__meta">' +
      "<p><strong>Referencia:</strong> " +
      ref +
      "</p>" +
      "<p><strong>Monto:</strong> " +
      amount +
      "</p>" +
      "<p><strong>Numeración:</strong> " +
      number +
      "</p>" +
      (expired ? "<p>La reserva expiró. Contacta a Telvoice si necesitas reactivarla.</p>" : "") +
      "</div>" +
      (pending.payment_url && !expired
        ? '<button type="button" class="nsim-btn-primary nsim-pending-order__cta" id="nsim-continue-payment">Continuar suscripción</button>'
        : "");

    block.hidden = false;
    if (submitBtn) submitBtn.hidden = !!(pending.payment_url && !expired);

    var continueBtn = $("nsim-continue-payment");
    if (continueBtn && pending.payment_url) {
      continueBtn.addEventListener("click", function () {
        window.location.href = pending.payment_url;
      });
    }
    updateSubmitState();
  }

  function updateModal() {
    var custom = state.planId === "custom";
    var plan = PLANS[state.planId];
    var title = $("nsim-modal-title");
    var subtitle = $("nsim-modal-subtitle");
    var stepper = $("nsim-modal-stepper");
    var footnote = $("nsim-modal-footnote");
    var submit = $("nsim-submit");

    if (title) {
      title.textContent = custom
        ? "Solicitar plan a medida"
        : "Suscripción numeración SIM " + plan.name;
    }
    if (subtitle) {
      subtitle.textContent = custom
        ? "Cuéntanos qué necesitas y nuestro equipo diseñará una solución para tu empresa."
        : "Completa tus datos para iniciar una suscripción mensual recurrente por MercadoPago.";
    }
    if (stepper) stepper.hidden = custom;
    if (footnote) {
      footnote.hidden = custom;
      footnote.textContent =
        state.billing === "annual"
          ? "La membresía anual estará disponible pronto. Por ahora solo suscripción mensual."
          : "La numeración se cobra como suscripción mensual recurrente.";
    }
    if (submit) submit.textContent = submitLabel();
    document.querySelectorAll(".nsim-field--checkout-only").forEach(function (el) {
      el.hidden = custom;
    });
    document.querySelectorAll(".nsim-field--custom-only").forEach(function (el) {
      el.hidden = !custom;
    });
    if (custom) {
      var section = $("nsim-number-section");
      if (section) section.hidden = true;
    }
    renderSummary();
    updateSubmitState();
  }

  function renderNumberSectionLoading(loading) {
    var section = $("nsim-number-section");
    var loadingNode = $("nsim-number-loading");
    var emptyNode = $("nsim-number-empty");
    var picker = $("nsim-number-picker");
    if (!section) return;
    if (state.planId === "custom") {
      section.hidden = true;
      return;
    }
    if (
      state.pendingOrder &&
      state.pendingOrder.has_pending_order &&
      !state.pendingOrder.reservation_expired &&
      state.pendingOrder.payment_url
    ) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    if (loadingNode) loadingNode.hidden = !loading;
    if (loading) {
      if (emptyNode) emptyNode.hidden = true;
      if (picker) picker.hidden = true;
      updateSubmitState();
      return;
    }
    if (loadingNode) loadingNode.hidden = true;
  }

  function renderNumberEmpty(empty) {
    var emptyNode = $("nsim-number-empty");
    var picker = $("nsim-number-picker");
    state.inventoryEmpty = empty;
    if (emptyNode) emptyNode.hidden = !empty;
    if (picker) picker.hidden = empty;
    updateSubmitState();
  }

  function renderNumbers(numbers) {
    var picker = $("nsim-number-picker");
    var list = $("nsim-number-list");
    var moreBtn = $("nsim-number-show-more");
    var autoOption = $("nsim-auto-option");
    if (!picker || !list || state.planId === "custom") return;

    state.numbers = Array.isArray(numbers) ? numbers : [];
    renderNumberSectionLoading(false);

    if (
      state.pendingOrder &&
      state.pendingOrder.has_pending_order &&
      !state.pendingOrder.reservation_expired &&
      state.pendingOrder.payment_url
    ) {
      $("nsim-number-section").hidden = true;
      return;
    }

    if (!state.numbers.length) {
      renderNumberEmpty(true);
      return;
    }

    renderNumberEmpty(false);
    picker.hidden = false;

    var visible = state.numbers.slice(0, state.numbersLimit);
    if (
      state.assignmentMode === "selected" &&
      (!state.selectedNumber ||
        !visible.some(function (n) {
          return n.inventory_public_id === state.selectedNumber;
        }))
    ) {
      state.selectedNumber = visible[0].inventory_public_id;
    }

    if (autoOption) {
      autoOption.classList.toggle("is-selected", state.assignmentMode === "auto");
      var autoInput = autoOption.querySelector('input[name="nsim-assignment"]');
      if (autoInput) autoInput.checked = state.assignmentMode === "auto";
    }

    list.innerHTML = visible
      .map(function (n) {
        var selected =
          state.assignmentMode === "selected" &&
          state.selectedNumber === n.inventory_public_id;
        return (
          '<label class="nsim-number-option' +
          (selected ? " is-selected" : "") +
          '"><input type="radio" name="nsim-assignment" value="' +
          n.inventory_public_id +
          '"' +
          (selected ? " checked" : "") +
          ' /><span class="nsim-number-option__body"><span class="nsim-number-option__number">' +
          n.display_number +
          '</span><span class="nsim-number-option__note">Disponible para activación inmediata</span></span></label>'
        );
      })
      .join("");

    list.querySelectorAll('input[name="nsim-assignment"]').forEach(function (input) {
      input.addEventListener("change", function () {
        var value = String(input.value || "").trim();
        if (value === "auto") {
          state.assignmentMode = "auto";
        } else {
          state.assignmentMode = "selected";
          state.selectedNumber = value;
        }
        renderNumbers(state.numbers);
      });
    });

    if (moreBtn) moreBtn.hidden = !(state.numbers.length > state.numbersLimit);
    updateSubmitState();
  }

  function refreshCheckoutContext(emailOverride) {
    if (!state.open || state.planId === "custom") return;

    if (demo()) {
      state.numbersLoading = false;
      state.inventoryEmpty = false;
      renderNumberSectionLoading(false);
      renderNumbers([{ inventory_public_id: "demo_001", display_number: "+56 9 *** *** 513" }]);
      return;
    }

    var email = (emailOverride || ($("nsim-email") && $("nsim-email").value) || "").trim();
    state.numbersLoading = true;
    state.inventoryEmpty = false;
    renderNumberSectionLoading(true);
    updateSubmitState();

    var pendingPromise = email
      ? fetch(
          origin() + "/api/public/pending-sim-checkout?email=" + encodeURIComponent(email),
          { headers: { Accept: "application/json" } }
        )
          .then(function (res) {
            return res.json();
          })
          .catch(function () {
            return { has_pending_order: false };
          })
      : Promise.resolve({ has_pending_order: false });

    var numbersPromise = fetch(origin() + "/api/public/sim-available-numbers?limit=50", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json();
      })
      .catch(function () {
        return { numbers: [] };
      });

    Promise.all([pendingPromise, numbersPromise]).then(function (results) {
      if (!state.open) return;
      state.numbersLoading = false;
      var pending = results[0] || { has_pending_order: false };
      state.pendingOrder = pending.has_pending_order ? pending : null;
      renderPendingOrder(pending);
      renderNumbers((results[1] && results[1].numbers) || []);
    });
  }

  function openModal(planId) {
    state.planId = planId;
    state.open = true;
    state.busy = false;
    state.pendingOrder = null;
    state.numbersLimit = NUMBERS_PAGE_SIZE;
    state.selectedNumber = null;
    state.assignmentMode = "auto";
    state.numbers = [];
    state.numbersLoading = planId !== "custom";
    state.inventoryEmpty = false;
    clearPersonalFormFields();
    setError("");
    updateModal();
    var modal = $("nsim-purchase-modal");
    if (modal) modal.removeAttribute("hidden");
    document.body.classList.add("nsim-modal-open");
    if (planId !== "custom") {
      renderNumberSectionLoading(true);
    }
    updateSubmitState();
    refreshCheckoutContext();
    var first = $("nsim-nombre");
    if (first) setTimeout(function () { first.focus(); }, 100);
  }

  function closeModal() {
    state.open = false;
    state.busy = false;
    var modal = $("nsim-purchase-modal");
    if (modal) modal.setAttribute("hidden", "");
    document.body.classList.remove("nsim-modal-open");
    setError("");
    setBusy(false);
    hidePendingOrder();
    state.pendingOrder = null;
  }

  function values() {
    return {
      nombre: (($("nsim-nombre") || {}).value || "").trim(),
      empresa: (($("nsim-empresa") || {}).value || "").trim(),
      email: (($("nsim-email") || {}).value || "").trim(),
      telefono: (($("nsim-telefono") || {}).value || "").trim(),
      rut: (($("nsim-rut") || {}).value || "").trim(),
      useCase: (($("nsim-use-case") || {}).value || "").trim(),
      volume: (($("nsim-volume") || {}).value || "").trim(),
    };
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
    status.innerHTML =
      '<p class="nsim-modal-status__eyebrow">Demo local</p><h3 class="nsim-modal-status__title">Aquí se crearía la orden y se abriría Mercado Pago.</h3><div class="nsim-modal-status__meta"><p><strong>Plan:</strong> ' +
      plan.name +
      '</p><p><strong>Modalidad:</strong> ' +
      billingLabel() +
      '</p><p><strong>Email:</strong> ' +
      v.email +
      '</p></div><button type="button" class="nsim-btn-primary nsim-modal-status__close">Entendido</button>';
    status.hidden = false;
    status.querySelector("button").addEventListener("click", closeModal);
  }

  function parseApiJson(res) {
    return res.text().then(function (text) {
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch (e) {
        return {};
      }
    });
  }

  function submit(e) {
    if (e) e.preventDefault();
    if (state.busy) return;

    var v = values();
    if (v.nombre.length < 2) return setError("Ingresa tu nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return setError("Ingresa un email válido.");

    if (state.planId === "custom") {
      window.location.href = "index.html#contacto";
      return;
    }

    if (state.billing === "annual") {
      return setError(ANNUAL_NOT_READY);
    }

    var plan = PLANS[state.planId];
    if (!plan) return setError(DEFAULT_ERROR);

    if (demo()) return showDemo(v, plan);

    if (
      state.pendingOrder &&
      state.pendingOrder.has_pending_order &&
      !state.pendingOrder.reservation_expired &&
      state.pendingOrder.payment_url
    ) {
      window.location.href = state.pendingOrder.payment_url;
      return;
    }

    if (state.numbersLoading) {
      return setError("Espera mientras cargamos las numeraciones disponibles.");
    }

    if (state.inventoryEmpty || !state.numbers.length) {
      return setError(
        "No hay numeraciones disponibles para este plan en este momento. Contacta a Telvoice."
      );
    }

    var assignmentMode = state.assignmentMode === "auto" ? "auto" : "selected";
    var inventoryId = state.selectedNumber;
    if (assignmentMode === "selected") {
      if (!inventoryId && state.numbers[0]) {
        inventoryId = state.numbers[0].inventory_public_id;
      }
      if (typeof inventoryId !== "string" || !inventoryId.trim()) {
        return setError("Elige una numeración disponible para continuar.");
      }
    }

    setError("");
    setBusy(true);

    var payload = {
      product_type: "sim_subscription",
      plan_id: state.planId,
      billing_mode: "subscription",
      recurring: true,
      assignment_mode: assignmentMode,
      checkout_email: v.email,
      payer_name: v.nombre,
      company_name: v.empresa || undefined,
      phone: v.telefono || undefined,
      tax_id: v.rut || undefined,
      use_case: v.useCase || undefined,
    };
    if (assignmentMode === "selected") {
      payload.inventory_public_id = inventoryId.trim();
    }

    fetch(origin() + "/api/public/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return parseApiJson(res).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        var data = result.data || {};
        var url = data.checkout_url || data.init_point || data.payment_url;
        if (!result.ok || data.success !== true || !url) {
          var errCode =
            (data.error && data.error.code) ||
            data.code ||
            "";
          if (result.status === 409 && errCode === "NUMBER_UNAVAILABLE") {
            refreshCheckoutContext(v.email);
            throw new Error(NUMBER_TAKEN);
          }
          if (
            result.status === 409 &&
            (errCode === "NO_STOCK" || errCode === "no_stock")
          ) {
            refreshCheckoutContext(v.email);
            throw new Error(
              "No hay numeraciones disponibles para este plan en este momento."
            );
          }
          if (result.status === 409 && errCode === "PENDING_ORDER_EXISTS") {
            refreshCheckoutContext(v.email);
            throw new Error("Ya tienes una suscripción pendiente. Usa Continuar suscripción.");
          }
          throw new Error(getHumanErrorMessage(data));
        }
        window.location.href = url;
      })
      .catch(function (err) {
        setBusy(false);
        setError(getHumanErrorMessage(err));
      });
  }

  function init() {
    updatePricing();

    document.querySelectorAll("[data-billing-cycle]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.billing = button.getAttribute("data-billing-cycle");
        updatePricing();
        if (state.open) updateModal();
      });
    });

    document.querySelectorAll(".nsim-plan-cta").forEach(function (button) {
      button.addEventListener("click", function () {
        openModal(button.getAttribute("data-nsim-plan"));
      });
    });

    document.querySelectorAll("[data-scroll-to]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.getElementById(button.getAttribute("data-scroll-to"));
        if (target) target.scrollIntoView({ behavior: "smooth" });
      });
    });

    var close = $("nsim-modal-close");
    if (close) close.addEventListener("click", closeModal);

    var form = $("nsim-purchase-form");
    if (form) form.addEventListener("submit", submit);

    var emailInput = $("nsim-email");
    if (emailInput) {
      var emailTimer = null;
      emailInput.addEventListener("input", function () {
        if (!state.open || state.planId === "custom") return;
        window.clearTimeout(emailTimer);
        emailTimer = window.setTimeout(function () {
          refreshCheckoutContext(emailInput.value.trim());
        }, 450);
      });
      emailInput.addEventListener("blur", function () {
        if (!state.open || state.planId === "custom") return;
        refreshCheckoutContext(emailInput.value.trim());
      });
    }

    var showMoreBtn = $("nsim-number-show-more");
    if (showMoreBtn) {
      showMoreBtn.addEventListener("click", function () {
        state.numbersLimit += NUMBERS_PAGE_SIZE;
        renderNumbers(state.numbers);
      });
    }

    var autoOption = $("nsim-auto-option");
    if (autoOption) {
      var autoInput = autoOption.querySelector('input[name="nsim-assignment"]');
      if (autoInput) {
        autoInput.addEventListener("change", function () {
          if (!autoInput.checked) return;
          state.assignmentMode = "auto";
          renderNumbers(state.numbers);
        });
      }
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.open) closeModal();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
