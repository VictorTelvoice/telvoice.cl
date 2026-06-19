/**
 * Landing dedicada — Numeración SIM real Telvoice
 * Checkout público vía sim_subscription (suscripción mensual recurrente MercadoPago).
 */
(function () {
  "use strict";

  var DEFAULT_ERROR =
    "No pudimos iniciar la suscripción. Inténtalo nuevamente o contáctanos.";
  var NUMBER_TAKEN =
    "Esta numeración ya no está disponible. Elige otra numeración.";

  var state = {
    planId: "sim_starter",
    billing: "monthly",
    catalog: [],
    catalogById: {},
    catalogLoaded: false,
    open: false,
    busy: false,
    numbersLoading: false,
    inventoryEmpty: false,
    canAutoAssign: false,
    numbers: [],
    availableTotal: 0,
    shownCount: 0,
    selectedNumber: null,
    assignmentMode: "auto",
    pendingOrder: null,
    resolvedPricing: null,
    inventoryFetchFailed: false,
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

  function getPlan(planId) {
    return state.catalogById[planId] || null;
  }

  function planLabel(plan) {
    return (plan && (plan.label || plan.plan_id)) || "";
  }

  function annualTotalFromNode(node) {
    var annual = node.getAttribute("data-nsim-annual-price");
    if (annual) return Number(annual);
    var monthly = node.getAttribute("data-nsim-monthly");
    var discount = Number(node.getAttribute("data-nsim-annual-discount")) || 20;
    return Math.round(Number(monthly) * 12 * (1 - discount / 100));
  }

  function annualEqFromNode(node) {
    var eq = node.getAttribute("data-nsim-annual-eq");
    if (eq) return Number(eq);
    var monthly = node.getAttribute("data-nsim-monthly");
    var discount = Number(node.getAttribute("data-nsim-annual-discount")) || 20;
    return Math.round(Number(monthly) * (1 - discount / 100));
  }

  function discountFromNode(node) {
    return Number(node.getAttribute("data-nsim-annual-discount")) || 20;
  }

  function hasPromo(node) {
    return node.getAttribute("data-nsim-has-promo") === "1";
  }

  function promoMonthlyFromNode(node) {
    return Number(node.getAttribute("data-nsim-promo-monthly")) || Number(node.getAttribute("data-nsim-monthly"));
  }

  function regularMonthlyFromNode(node) {
    return Number(node.getAttribute("data-nsim-regular-monthly")) || Number(node.getAttribute("data-nsim-monthly"));
  }

  function billingLabel() {
    return state.billing === "annual" ? "membresía anual" : "pago mensual";
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
      if (apiErr.code === "ANNUAL_NOT_ENABLED") {
        return "El ciclo anual no está habilitado para este plan. Elige modalidad mensual.";
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

  function hasEligibleStock() {
    return (
      state.numbers.length > 0 ||
      state.canAutoAssign ||
      state.availableTotal > 0
    );
  }

  function hasRealZeroStock() {
    return (
      !state.numbersLoading &&
      !state.inventoryFetchFailed &&
      state.numbers.length === 0 &&
      state.availableTotal === 0 &&
      !state.canAutoAssign
    );
  }

  function syncInventoryState(numbersPayload) {
    var payload = numbersPayload || {};
    state.numbers = Array.isArray(payload.numbers) ? payload.numbers : [];
    state.availableTotal =
      Number(
        payload.available != null
          ? payload.available
          : payload.inventory && payload.inventory.available != null
            ? payload.inventory.available
            : 0,
      ) || 0;
    state.shownCount =
      Number(payload.shown) ||
      (payload.numbers ? payload.numbers.length : 0);
    var apiCanAutoAssign =
      payload.can_auto_assign != null
        ? payload.can_auto_assign
        : payload.inventory && payload.inventory.can_auto_assign != null
          ? payload.inventory.can_auto_assign
          : null;
    state.canAutoAssign =
      apiCanAutoAssign === true ||
      state.availableTotal > 0 ||
      state.numbers.length > 0;
  }

  function canSubmitCheckout() {
    if (state.planId === "custom") return true;
    if (state.busy || state.numbersLoading) return false;
    if (
      state.pendingOrder &&
      state.pendingOrder.has_pending_order &&
      !state.pendingOrder.reservation_expired &&
      !state.pendingOrder.pricing_stale &&
      state.pendingOrder.payment_url
    ) {
      return true;
    }
    if (!hasEligibleStock()) return false;
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
    var priceNode = document.querySelector('[data-nsim-price="' + state.planId + '"]');
    var btn = document.querySelector('.nsim-plan-cta[data-nsim-plan="' + state.planId + '"]');
    if (btn && priceNode) {
      var promoCta = btn.getAttribute("data-nsim-cta-promo") || "";
      var regularCta = btn.getAttribute("data-nsim-cta-regular") || promoCta;
      if (state.billing === "monthly" && hasPromo(priceNode)) return promoCta;
      return regularCta || "Activar suscripción";
    }
    var plan = getPlan(state.planId);
    return plan ? plan.cta_label_regular || ("Activar suscripción " + planLabel(plan)) : "Activar suscripción";
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

  function renderFeatureItem(text) {
    return (
      '<li><span class="material-symbols-outlined" aria-hidden="true">check</span> ' +
      text +
      "</li>"
    );
  }

  function renderPlanCard(plan) {
    var cardClass = "nsim-plan-card";
    if (plan.is_featured) cardClass += " is-featured";
    if (plan.has_intro_promo) cardClass += " has-intro-promo";
    var ribbon = plan.ribbon
      ? '<span class="nsim-plan-ribbon">' + plan.ribbon + "</span>"
      : plan.is_featured
        ? '<span class="nsim-plan-ribbon">Popular</span>'
        : "";
    var discountLabel = Math.round(plan.annual_discount_percent || 0);
    var promoBlock = plan.has_intro_promo
      ? '<p class="nsim-plan-price-before" data-nsim-price-before="' +
        plan.plan_id +
        '">Antes ' +
        money(plan.regular_monthly_price_clp) +
        " / mes</p>"
      : "";
    var initialPrice = plan.has_intro_promo
      ? plan.promo_monthly_price_clp
      : plan.monthly_price_clp;
    var subnote = plan.has_intro_promo
      ? Math.round(plan.promo_discount_percent) +
        "% de descuento por " +
        plan.promo_duration_months +
        " meses. Luego " +
        money(plan.regular_monthly_price_clp) +
        " / mes."
      : "Pago recurrente mensual.";
    var features = (plan.features || [])
      .map(function (f) {
        return renderFeatureItem(f);
      })
      .join("");

    return (
      '<article class="' +
      cardClass +
      '" data-nsim-plan="' +
      plan.plan_id +
      '" tabindex="0">' +
      ribbon +
      '<span class="nsim-plan-billing-badge" data-nsim-billing-label="' +
      plan.plan_id +
      '">Suscripción mensual</span>' +
      '<h3 class="nsim-plan-name">' +
      plan.label +
      "</h3>" +
      promoBlock +
      '<p class="nsim-plan-price" data-nsim-price="' +
      plan.plan_id +
      '" data-nsim-monthly="' +
      plan.monthly_price_clp +
      '" data-nsim-promo-monthly="' +
      (plan.has_intro_promo ? plan.promo_monthly_price_clp : plan.monthly_price_clp) +
      '" data-nsim-regular-monthly="' +
      plan.regular_monthly_price_clp +
      '" data-nsim-has-promo="' +
      (plan.has_intro_promo ? "1" : "0") +
      '" data-nsim-promo-discount="' +
      (plan.has_intro_promo ? Math.round(plan.promo_discount_percent) : 0) +
      '" data-nsim-promo-months="' +
      (plan.has_intro_promo ? plan.promo_duration_months : 0) +
      '" data-nsim-annual-price="' +
      plan.annual_price_clp +
      '" data-nsim-annual-eq="' +
      plan.monthly_equiv_annual_clp +
      '" data-nsim-annual-discount="' +
      discountLabel +
      '" data-nsim-annual-enabled="' +
      (plan.annual_enabled ? "1" : "0") +
      '">' +
      money(initialPrice) +
      " <span>/ mes</span></p>" +
      '<p class="nsim-plan-price-subnote" data-nsim-price-note="' +
      plan.plan_id +
      '">' +
      subnote +
      "</p>" +
      (plan.description
        ? '<p class="nsim-plan-desc">' + plan.description + "</p>"
        : "") +
      '<ul class="nsim-plan-features">' +
      features +
      "</ul>" +
      '<button type="button" class="nsim-btn-primary nsim-plan-cta" data-nsim-plan="' +
      plan.plan_id +
      '" data-nsim-cta-promo="' +
      (plan.cta_label || plan.cta_label_regular) +
      '" data-nsim-cta-regular="' +
      plan.cta_label_regular +
      '">' +
      (plan.has_intro_promo ? plan.cta_label : plan.cta_label_regular) +
      "</button></article>"
    );
  }

  function bindPlanCtas() {
    document.querySelectorAll(".nsim-plan-cta").forEach(function (button) {
      if (button.__nsimBound) return;
      button.__nsimBound = true;
      button.addEventListener("click", function () {
        openModal(button.getAttribute("data-nsim-plan"));
      });
    });
  }

  function renderPlanCards(plans) {
    var grid = $("nsim-plans-grid");
    var loading = $("nsim-plans-loading");
    var customCard = grid && grid.querySelector('[data-nsim-plan="custom"]');
    if (!grid) return;

    state.catalog = Array.isArray(plans) ? plans : [];
    state.catalogById = {};
    state.catalog.forEach(function (plan) {
      state.catalogById[plan.plan_id] = plan;
    });
    state.catalogLoaded = true;

    if (loading) loading.remove();

    grid.querySelectorAll('[data-nsim-plan]:not([data-nsim-plan="custom"])').forEach(function (node) {
      node.remove();
    });

    var html = state.catalog
      .map(function (plan) {
        return renderPlanCard(plan);
      })
      .join("");

    if (customCard) {
      customCard.insertAdjacentHTML("beforebegin", html);
    } else {
      grid.insertAdjacentHTML("afterbegin", html);
    }

    bindPlanCtas();
    updatePricing();
  }

  function fetchCatalog() {
    return fetch(origin() + "/api/public/sim-plans", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || data.success !== true || !Array.isArray(data.plans)) {
          throw new Error("Catálogo no disponible");
        }
        renderPlanCards(data.plans);
        var switchDiscount = document.querySelector("[data-nsim-switch-discount]");
        if (switchDiscount && data.annual_discount_default != null) {
          switchDiscount.textContent = "-" + Math.round(data.annual_discount_default) + "%";
        }
      })
      .catch(function () {
        var loading = $("nsim-plans-loading");
        if (loading) {
          loading.textContent =
            "No pudimos cargar los planes. Recarga la página o contáctanos.";
        }
      });
  }

  function updatePricing() {
    var switchDiscount = 20;
    document.querySelectorAll("[data-nsim-price]").forEach(function (node) {
      var annualEnabled = node.getAttribute("data-nsim-annual-enabled") !== "0";
      switchDiscount = discountFromNode(node);
      if (state.billing === "annual" && !annualEnabled) return;
      node.innerHTML =
        state.billing === "annual"
          ? money(annualEqFromNode(node)) + " <span>/ mes eq.</span>"
          : hasPromo(node)
            ? money(promoMonthlyFromNode(node)) + " <span>/ mes</span>"
            : money(node.getAttribute("data-nsim-monthly")) + " <span>/ mes</span>";
    });

    document.querySelectorAll("[data-nsim-price-before]").forEach(function (node) {
      var planId = node.getAttribute("data-nsim-price-before");
      var priceNode = document.querySelector('[data-nsim-price="' + planId + '"]');
      if (!priceNode) return;
      node.hidden = !(state.billing === "monthly" && hasPromo(priceNode));
    });

    document.querySelectorAll(".nsim-plan-card .nsim-plan-cta").forEach(function (btn) {
      var planId = btn.getAttribute("data-nsim-plan");
      if (planId === "custom") return;
      var priceNode = document.querySelector('[data-nsim-price="' + planId + '"]');
      if (!priceNode) return;
      var promoCta = btn.getAttribute("data-nsim-cta-promo") || "";
      var regularCta = btn.getAttribute("data-nsim-cta-regular") || promoCta;
      btn.textContent =
        state.billing === "monthly" && hasPromo(priceNode) ? promoCta : regularCta;
    });

    var switchDiscountEl = document.querySelector("[data-nsim-switch-discount]");
    if (switchDiscountEl) switchDiscountEl.textContent = "-" + Math.round(switchDiscount) + "%";

    document.querySelectorAll("[data-nsim-price-note]").forEach(function (node) {
      var planId = node.getAttribute("data-nsim-price-note");
      var monthlyNode = document.querySelector('[data-nsim-price="' + planId + '"]');
      if (!monthlyNode) return;
      var discount = discountFromNode(monthlyNode);
      var annualEnabled = monthlyNode.getAttribute("data-nsim-annual-enabled") !== "0";
      if (state.billing === "annual" && annualEnabled) {
        node.textContent =
          "Pago anual: " +
          money(annualTotalFromNode(monthlyNode)) +
          "/año · " +
          discount +
          "% de descuento.";
      } else if (state.billing === "monthly" && hasPromo(monthlyNode)) {
        var promoDisc = monthlyNode.getAttribute("data-nsim-promo-discount");
        var promoMonths = monthlyNode.getAttribute("data-nsim-promo-months");
        node.textContent =
          promoDisc +
          "% de descuento por " +
          promoMonths +
          " meses. Luego " +
          money(regularMonthlyFromNode(monthlyNode)) +
          " / mes.";
      } else {
        node.textContent =
          state.billing === "annual"
            ? "Suscripción anual recurrente por MercadoPago."
            : "Suscripción mensual recurrente por MercadoPago.";
      }
    });

    document.querySelectorAll("[data-nsim-billing-label]").forEach(function (node) {
      var monthlyNode = document.querySelector(
        '[data-nsim-price="' + node.getAttribute("data-nsim-billing-label") + '"]'
      );
      if (!monthlyNode) return;
      var discount = discountFromNode(monthlyNode);
      var annualEnabled = monthlyNode.getAttribute("data-nsim-annual-enabled") !== "0";
      node.textContent =
        state.billing === "annual" && annualEnabled
          ? "Membresía anual -" + discount + "%"
          : "Suscripción mensual";
    });

    document.querySelectorAll("[data-billing-cycle]").forEach(function (button) {
      var active = button.getAttribute("data-billing-cycle") === state.billing;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    if (state.open) {
      var submit = $("nsim-submit");
      if (submit && state.planId !== "custom") submit.textContent = submitLabel();
    }
  }

  function renderSummary() {
    var summary = $("nsim-modal-summary");
    if (!summary) return;
    if (state.planId === "custom") {
      summary.innerHTML =
        '<p class="nsim-modal-summary__plan">Plan a medida</p><p class="nsim-modal-summary__price">Cotización personalizada</p><ul class="nsim-modal-summary__list"><li>Múltiples números SIM</li><li>Volumen SMS personalizado</li><li>API, Webhooks y automatizaciones avanzadas</li></ul>';
      return;
    }

    var plan = getPlan(state.planId);
    var priceNode = document.querySelector('[data-nsim-price="' + state.planId + '"]');
    var planName = plan ? planLabel(plan) : state.planId;
    var priceHtml = "";
    var detailLines = [];
    var resolved =
      state.resolvedPricing &&
      state.resolvedPricing.plan_id === state.planId &&
      state.resolvedPricing.billing_cycle === state.billing
        ? state.resolvedPricing
        : null;

    if (state.billing === "annual" && priceNode) {
      var discount = discountFromNode(priceNode);
      priceHtml =
        '<p class="nsim-modal-summary__price">' +
        money(annualTotalFromNode(priceNode)) +
        " / año</p>" +
        '<p class="nsim-modal-summary__note">' +
        discount +
        "% de descuento anual</p>";
      detailLines.push("Modalidad: membresía anual");
      detailLines.push("1 número SIM real (suscripción anual)");
    } else if (resolved && resolved.promo_enabled && resolved.promo_monthly_price_clp) {
      priceHtml =
        '<p class="nsim-modal-summary__price-before">Antes ' +
        money(resolved.regular_monthly_price_clp || resolved.transaction_amount_clp) +
        " / mes</p>" +
        '<p class="nsim-modal-summary__price nsim-modal-summary__price--promo">' +
        money(resolved.transaction_amount_clp) +
        " / mes por " +
        (resolved.promo_duration_months || 6) +
        " meses</p>" +
        '<p class="nsim-modal-summary__note">Luego ' +
        money(resolved.post_promo_monthly_price_clp || resolved.regular_monthly_price_clp) +
        " / mes</p>";
      detailLines.push("Modalidad: pago mensual con promoción inicial");
      detailLines.push("1 número SIM real (suscripción mensual)");
    } else if (priceNode && hasPromo(priceNode)) {
      priceHtml =
        '<p class="nsim-modal-summary__price-before">Antes ' +
        money(regularMonthlyFromNode(priceNode)) +
        " / mes</p>" +
        '<p class="nsim-modal-summary__price nsim-modal-summary__price--promo">' +
        money(promoMonthlyFromNode(priceNode)) +
        " / mes por " +
        priceNode.getAttribute("data-nsim-promo-months") +
        " meses</p>" +
        '<p class="nsim-modal-summary__note">Luego ' +
        money(regularMonthlyFromNode(priceNode)) +
        " / mes</p>";
      detailLines.push("Modalidad: pago mensual con promoción inicial");
      detailLines.push("1 número SIM real (suscripción mensual)");
    } else {
      var monthlyAmount = resolved
        ? resolved.transaction_amount_clp
        : plan
          ? plan.monthly_price_clp
          : priceNode
            ? Number(priceNode.getAttribute("data-nsim-monthly"))
            : 0;
      priceHtml =
        '<p class="nsim-modal-summary__price">' + money(monthlyAmount) + " / mes</p>";
      detailLines.push("Modalidad: pago mensual");
      detailLines.push("1 número SIM real (suscripción mensual)");
    }

    if (plan && plan.includes_outbound_sms !== false && plan.included_sms) {
      detailLines.push(
        new Intl.NumberFormat("es-CL").format(plan.included_sms) +
          " SMS salientes incluidos cada mes"
      );
    } else if (plan) {
      detailLines.push("Sin SMS salientes incluidos");
    }
    detailLines.push("Agente Telvoice incluido");
    detailLines.push(
      state.billing === "annual"
        ? "Cobro anual recurrente por MercadoPago"
        : "Cobro mensual recurrente por MercadoPago"
    );

    summary.innerHTML =
      '<p class="nsim-modal-summary__plan">' +
      planName +
      "</p>" +
      priceHtml +
      '<ul class="nsim-modal-summary__list">' +
      detailLines
        .map(function (line) {
          return "<li>" + line + "</li>";
        })
        .join("") +
      "</ul>";
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
    var stale = pending.pricing_stale === true;
    if (
      !stale &&
      pending.expected_amount != null &&
      pending.amount != null &&
      Math.round(Number(pending.amount)) !== Math.round(Number(pending.expected_amount))
    ) {
      stale = true;
    }

    block.innerHTML =
      '<p class="nsim-pending-order__title">' +
      (stale
        ? "Tienes un checkout pendiente con precio anterior."
        : expired
          ? "Tienes una suscripción pendiente con reserva expirada."
          : "Ya tienes una suscripción pendiente para esta numeración.") +
      "</p>" +
      '<div class="nsim-pending-order__meta">' +
      (stale && pending.expected_amount != null
        ? "<p><strong>Precio vigente:</strong> " + money(pending.expected_amount) + "</p>"
        : "") +
      "<p><strong>Referencia:</strong> " +
      ref +
      "</p>" +
      "<p><strong>Monto pendiente:</strong> " +
      amount +
      "</p>" +
      "<p><strong>Numeración:</strong> " +
      number +
      "</p>" +
      (stale
        ? "<p>Al continuar crearemos un checkout nuevo con el precio vigente.</p>"
        : expired
          ? "<p>La reserva expiró. Contacta a Telvoice si necesitas reactivarla.</p>"
          : "") +
      "</div>" +
      (pending.payment_url && !expired && !stale
        ? '<button type="button" class="nsim-btn-primary nsim-pending-order__cta" id="nsim-continue-payment">Continuar suscripción</button>'
        : "");

    block.hidden = false;
    if (submitBtn) submitBtn.hidden = !!(pending.payment_url && !expired && !stale);

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
    var plan = getPlan(state.planId);
    var title = $("nsim-modal-title");
    var subtitle = $("nsim-modal-subtitle");
    var stepper = $("nsim-modal-stepper");
    var footnote = $("nsim-modal-footnote");
    var submit = $("nsim-submit");

    if (title) {
      title.textContent = custom
        ? "Solicitar plan a medida"
        : "Suscripción numeración SIM " + (plan ? planLabel(plan) : "");
    }
    if (subtitle) {
      subtitle.textContent = custom
        ? "Cuéntanos qué necesitas y nuestro equipo diseñará una solución para tu empresa."
        : state.billing === "annual"
          ? "Completa tus datos para iniciar una suscripción anual recurrente por MercadoPago."
          : "Completa tus datos para iniciar una suscripción mensual recurrente por MercadoPago.";
    }
    if (stepper) stepper.hidden = custom;
    if (footnote) {
      footnote.hidden = custom;
      footnote.textContent =
        state.billing === "annual"
          ? "La numeración se cobra como suscripción anual recurrente."
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

  function renderNumberEmpty(kind) {
    var emptyNode = $("nsim-number-empty");
    var picker = $("nsim-number-picker");
    var title = emptyNode && emptyNode.querySelector(".nsim-number-empty__title");
    var text = emptyNode && emptyNode.querySelector(".nsim-number-empty__text");
    var cta = emptyNode && emptyNode.querySelector(".nsim-number-empty__cta");
    state.inventoryEmpty = kind === "real";
    if (!kind) {
      if (emptyNode) emptyNode.hidden = true;
      return;
    }
    if (emptyNode) emptyNode.hidden = false;
    if (picker) picker.hidden = true;
    if (kind === "manual") {
      if (title) {
        title.textContent =
          "No hay numeraciones visibles para selección manual en este momento.";
      }
      if (text) {
        text.textContent = "Puedes usar auto-asignación para continuar.";
      }
      if (cta) cta.hidden = true;
      return;
    }
    if (title) {
      title.textContent = "No hay numeraciones disponibles en este momento.";
    }
    if (text) {
      text.textContent =
        "Puedes solicitar activación asistida con Telvoice.";
    }
    if (cta) cta.hidden = false;
  }

  function renderNumbers(numbers) {
    var picker = $("nsim-number-picker");
    var list = $("nsim-number-list");
    var limitHint = $("nsim-number-limit-hint");
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

    if (state.numbersLoading) {
      renderNumberEmpty(false);
      return;
    }

    if (
      state.assignmentMode === "auto" &&
      (state.canAutoAssign || state.availableTotal > 0 || state.numbers.length > 0)
    ) {
      renderNumberEmpty(false);
      if (picker) picker.hidden = true;
      updateSubmitState();
      return;
    }

    if (hasRealZeroStock()) {
      renderNumberEmpty("real");
      updateSubmitState();
      return;
    }

    renderNumberEmpty(false);

    if (state.assignmentMode === "auto") {
      if (picker) picker.hidden = true;
      updateSubmitState();
      return;
    }

    if (!state.numbers.length) {
      renderNumberEmpty("manual");
      updateSubmitState();
      return;
    }

    if (picker) picker.hidden = false;

    if (limitHint) {
      if (state.availableTotal > state.shownCount) {
        limitHint.textContent =
          "Mostramos " +
          state.shownCount +
          " numeraciones disponibles. También puedes usar asignación automática.";
        limitHint.hidden = false;
      } else {
        limitHint.hidden = true;
        limitHint.textContent = "";
      }
    }

    if (
      state.assignmentMode === "selected" &&
      (!state.selectedNumber ||
        !state.numbers.some(function (n) {
          return n.inventory_public_id === state.selectedNumber;
        }))
    ) {
      state.selectedNumber = state.numbers[0].inventory_public_id;
    }

    if (autoOption) {
      autoOption.classList.toggle("is-selected", state.assignmentMode === "auto");
      var autoInput = autoOption.querySelector('input[name="nsim-assignment"]');
      if (autoInput) autoInput.checked = state.assignmentMode === "auto";
    }

    list.innerHTML = state.numbers
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
          origin() +
            "/api/public/pending-sim-checkout?email=" +
            encodeURIComponent(email) +
            "&plan_id=" +
            encodeURIComponent(state.planId || "") +
            "&billing_cycle=" +
            encodeURIComponent(state.billing || "monthly"),
          { headers: { Accept: "application/json" } }
        )
          .then(function (res) {
            return res.json();
          })
          .catch(function () {
            return { has_pending_order: false };
          })
      : Promise.resolve({ has_pending_order: false });

    var numbersPromise = fetch(origin() + "/api/public/sim-available-numbers", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json();
      })
      .catch(function () {
        return { numbers: [], available: 0, can_auto_assign: false, _fetchError: true };
      });

    Promise.all([pendingPromise, numbersPromise]).then(function (results) {
      if (!state.open) return;
      state.numbersLoading = false;
      var pending = results[0] || { has_pending_order: false };
      state.resolvedPricing = pending.resolved_pricing || null;
      state.pendingOrder = pending.has_pending_order ? pending : null;
      renderPendingOrder(pending);
      renderSummary();
      var numbersPayload = results[1] || { numbers: [] };
      if (numbersPayload._fetchError) {
        setError("No pudimos cargar las numeraciones. Recarga e inténtalo de nuevo.");
        state.inventoryFetchFailed = true;
        state.canAutoAssign = false;
        state.availableTotal = 0;
        state.shownCount = 0;
        state.numbers = [];
        renderNumberSectionLoading(false);
        renderNumberEmpty(false);
        updateSubmitState();
        return;
      }
      syncInventoryState(numbersPayload);
      renderNumbers(state.numbers);
    });
  }

  function openModal(planId) {
    state.planId = planId;
    state.open = true;
    state.busy = false;
    state.pendingOrder = null;
    state.availableTotal = 0;
    state.shownCount = 0;
    state.canAutoAssign = false;
    state.selectedNumber = null;
    state.assignmentMode = "auto";
    state.numbers = [];
    state.numbersLoading = planId !== "custom";
    state.inventoryEmpty = false;
    state.inventoryFetchFailed = false;
    state.resolvedPricing = null;
    clearPersonalFormFields();
    setError("");
    renderNumberEmpty(false);
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
    renderNumberEmpty(false);
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
      planLabel(plan) +
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

    var plan = getPlan(state.planId);
    if (!plan) return setError(DEFAULT_ERROR);

    if (demo()) return showDemo(v, plan);

    if (state.numbersLoading) {
      return setError("Espera mientras cargamos las numeraciones disponibles.");
    }

    if (hasRealZeroStock()) {
      return setError(
        "No hay numeraciones disponibles en este momento. Contacta a Telvoice."
      );
    }

    if (state.assignmentMode === "selected" && !state.numbers.length) {
      return setError(
        "No hay numeraciones visibles para selección manual. Usa auto-asignación o contacta a Telvoice."
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
      billing_cycle: state.billing,
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
            throw new Error(
              "Tienes un checkout pendiente con precio anterior. Intenta nuevamente para generar uno nuevo."
            );
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
    document.documentElement.setAttribute("data-tv-sim-billing", state.billing);

    fetchCatalog().then(function () {
      try {
        var planParam = new URLSearchParams(window.location.search).get("plan");
        if (planParam && (getPlan(planParam) || planParam === "custom")) {
          var target = document.querySelector('[data-nsim-plan="' + planParam + '"]');
          if (target && target.scrollIntoView) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          if (planParam !== "custom") {
            setTimeout(function () {
              openModal(planParam);
            }, 350);
          }
        }
      } catch (e) {}
    });

    document.querySelectorAll("[data-billing-cycle]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.billing = button.getAttribute("data-billing-cycle") === "annual" ? "annual" : "monthly";
        document.documentElement.setAttribute("data-tv-sim-billing", state.billing);
        updatePricing();
        if (state.open) updateModal();
      });
    });

    bindPlanCtas();

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
