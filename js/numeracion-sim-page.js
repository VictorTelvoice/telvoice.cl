/**
 * Landing dedicada — Numeración SIM real Telvoice
 * Modo demo: ?demo_numeracion=1 (sin MercadoPago, sin orden, sin Supabase)
 */
(function () {
  "use strict";

  function qs(id) {
    return document.getElementById(id);
  }

  function fmt(n) {
    return new Intl.NumberFormat("es-CL").format(Math.round(Number(n) || 0));
  }

  function formatClp(amount) {
    return "$" + fmt(amount);
  }

  var SIM_PLANS = {
    sim_starter: {
      plan_id: "sim_starter",
      displayName: "Starter",
      modalTitle: "Comprar numeración SIM Starter",
      total: 29990,
      checkout: true,
      submitLabel: "Ir a pagar Starter",
    },
    sim_pro: {
      plan_id: "sim_pro",
      displayName: "Pro",
      modalTitle: "Comprar numeración SIM Pro",
      total: 49990,
      checkout: true,
      submitLabel: "Ir a pagar Pro",
    },
    custom: {
      plan_id: "custom",
      displayName: "A medida",
      modalTitle: "Solicitar plan a medida",
      checkout: false,
      submitLabel: "Solicitar evaluación",
    },
  };

  var SIM_PLAN_AGENT_MAP = {
    sim_starter: "agent_start",
    sim_pro: "agent_pro",
  };

  var SIM_CHECKOUT_ERROR =
    "No pudimos iniciar el pago. Intenta nuevamente o solicita asistencia de Telvoice.";
  var SIM_NOT_ENABLED_ERROR =
    "La compra online de numeración SIM está habilitada solo para clientes autorizados durante la etapa de lanzamiento.";
  var SIM_NO_STOCK_ERROR =
    "No hay numeraciones disponibles para compra online en este momento. Déjanos tus datos y te contactaremos.";
  var SIM_NUMBER_TAKEN_ERROR =
    "Este número acaba de ser reservado. Elige otra numeración disponible.";

  function formatCheckoutError(data, fallbackMessage) {
    if (data && typeof data === "object") {
      var apiErr = data.error;
      if (typeof apiErr === "string" && apiErr.trim()) return apiErr.trim();
      if (apiErr && typeof apiErr === "object") {
        var code = typeof apiErr.code === "string" ? apiErr.code : "";
        var message = typeof apiErr.message === "string" ? apiErr.message.trim() : "";
        if (code === "PENDING_ORDER_EXISTS" || message.indexOf("orden pendiente") !== -1) {
          return "Ya tienes una orden pendiente. Continúa el pago anterior.";
        }
        if (code === "NO_STOCK" || code === "no_stock" || code === "NUMBER_UNAVAILABLE") {
          return SIM_NUMBER_TAKEN_ERROR;
        }
        if (code === "not_enabled" || code === "NOT_ENABLED") {
          return SIM_NOT_ENABLED_ERROR;
        }
        if (code === "VALIDATION_ERROR" && message.indexOf("plan_id SIM") !== -1) {
          return "La suscripción mensual aún no está disponible para este plan. Usa compra única o contacta a soporte.";
        }
        if (message) return message;
        if (code) return code;
      }
      if (typeof data.message === "string" && data.message.trim()) return data.message.trim();
    }
    if (typeof fallbackMessage === "string" && fallbackMessage.trim() && fallbackMessage !== "[object Object]") {
      return fallbackMessage.trim();
    }
    return SIM_CHECKOUT_ERROR;
  }

  var NUMBERS_PAGE_SIZE = 10;

  function agentApiOrigin() {
    return (
      (window.TELVOICE_CONFIG && window.TELVOICE_CONFIG.agentApiOrigin) ||
      "https://agent.telvoice.cl"
    );
  }

  var CHECKOUT_SUBTITLE =
    "Completa tus datos para crear la orden y continuar al pago seguro por MercadoPago.";
  var CUSTOM_SUBTITLE =
    "Cuéntanos qué necesitas y nuestro equipo diseñará una solución de numeración, SMS e integraciones para tu empresa.";

  function isNumeracionDemoMode() {
    try {
      return new URLSearchParams(window.location.search).get("demo_numeracion") === "1";
    } catch (e) {
      return false;
    }
  }

  var state = {
    simPlanId: "sim_starter",
    modalOpen: false,
    submitting: false,
    statusVisible: false,
    availableNumbers: [],
    numbersLimit: NUMBERS_PAGE_SIZE,
    selectedInventoryPublicId: null,
    pendingOrder: null,
    contextLoading: false,
  };

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

  function getPlan(planId) {
    return SIM_PLANS[planId] || null;
  }

  function renderModalSummary(planId) {
    var summary = qs("nsim-modal-summary");
    if (!summary) return;

    if (planId === "custom") {
      summary.innerHTML =
        '<p class="nsim-modal-summary__plan">Plan a medida</p>' +
        '<p class="nsim-modal-summary__price">Cotización personalizada</p>' +
        '<ul class="nsim-modal-summary__list">' +
        "<li>Múltiples números SIM</li>" +
        "<li>Volumen SMS personalizado</li>" +
        "<li>API, Webhooks y automatizaciones avanzadas</li>" +
        "</ul>";
      return;
    }
    if (planId === "sim_pro") {
      summary.innerHTML =
        '<p class="nsim-modal-summary__plan">Pro</p>' +
        '<p class="nsim-modal-summary__price">' +
        formatClp(49990) +
        " / mes</p>" +
        '<ul class="nsim-modal-summary__list">' +
        "<li>Todo lo que incluye Starter</li>" +
        "<li>2.000 SMS salientes incluidos</li>" +
        "<li>Bot Telegram y automatizaciones</li>" +
        "</ul>";
      return;
    }
    summary.innerHTML =
      '<p class="nsim-modal-summary__plan">Starter</p>' +
      '<p class="nsim-modal-summary__price">' +
      formatClp(29990) +
      " / mes</p>" +
      '<ul class="nsim-modal-summary__list">' +
      "<li>1 número SIM real</li>" +
      "<li>1.000 SMS salientes incluidos</li>" +
      "<li>Agente Telvoice incluido</li>" +
      "</ul>";
  }

  function updateModalChrome() {
    var plan = getPlan(state.simPlanId);
    if (!plan) return;

    var title = qs("nsim-modal-title");
    var subtitle = qs("nsim-modal-subtitle");
    var stepper = qs("nsim-modal-stepper");
    var footnote = qs("nsim-modal-footnote");
    var submitBtn = qs("nsim-submit");
    var isCustom = plan.plan_id === "custom";

    if (title) title.textContent = plan.modalTitle;
    if (subtitle) subtitle.textContent = isCustom ? CUSTOM_SUBTITLE : CHECKOUT_SUBTITLE;
    if (stepper) stepper.hidden = isCustom;
    if (footnote) footnote.hidden = isCustom;

    document.querySelectorAll(".nsim-field--checkout-only").forEach(function (el) {
      el.hidden = isCustom;
    });
    document.querySelectorAll(".nsim-field--custom-only").forEach(function (el) {
      el.hidden = !isCustom;
    });

    renderModalSummary(state.simPlanId);

    if (submitBtn && !state.submitting) submitBtn.textContent = plan.submitLabel;

    document.querySelectorAll("[data-nsim-plan]").forEach(function (card) {
      if (!card.classList.contains("nsim-plan-card")) return;
      var selected = card.getAttribute("data-nsim-plan") === state.simPlanId && state.modalOpen;
      card.classList.toggle("is-selected", selected);
    });

    refreshCheckoutContext();
  }

  function resetCheckoutContext() {
    state.availableNumbers = [];
    state.numbersLimit = NUMBERS_PAGE_SIZE;
    state.selectedInventoryPublicId = null;
    state.pendingOrder = null;
    state.contextLoading = false;
    hidePendingOrder();
    hideNumberPicker();
  }

  function clearPersonalFormFields() {
    ["nsim-nombre", "nsim-empresa", "nsim-telefono", "nsim-rut", "nsim-use-case", "nsim-volume"].forEach(function (id) {
      var el = qs(id);
      if (el) el.value = "";
    });
  }

  function hidePendingOrder() {
    var block = qs("nsim-pending-order");
    if (block) {
      block.hidden = true;
      block.innerHTML = "";
    }
  }

  function hideNumberPicker() {
    var picker = qs("nsim-number-picker");
    if (picker) picker.hidden = true;
    var list = qs("nsim-number-list");
    if (list) list.innerHTML = "";
    var more = qs("nsim-number-show-more");
    if (more) more.hidden = true;
  }

  function renderPendingOrder(pending) {
    var block = qs("nsim-pending-order");
    var submitBtn = qs("nsim-submit");
    if (!block) return;

    if (!pending || !pending.has_pending_order) {
      hidePendingOrder();
      if (submitBtn) submitBtn.hidden = false;
      return;
    }

    var ref = pending.public_reference || "—";
    var amount = pending.amount != null ? formatClp(pending.amount) : "—";
    var number = pending.selected_number || "Numeración reservada";
    var expired = pending.reservation_expired === true;
    var title = expired
      ? "Tienes una orden pendiente con reserva expirada."
      : "Ya tienes una orden pendiente para esta numeración.";

    block.innerHTML =
      '<p class="nsim-pending-order__title">' +
      title +
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
      (expired
        ? "<p>La reserva expiró. Contacta a Telvoice si necesitas reactivarla.</p>"
        : "") +
      "</div>" +
      (pending.payment_url && !expired
        ? '<button type="button" class="nsim-btn-primary nsim-pending-order__cta" id="nsim-continue-payment">Continuar pago</button>'
        : "");

    block.hidden = false;
    hideNumberPicker();

    if (submitBtn) {
      submitBtn.hidden = !!(pending.payment_url && !expired);
    }

    var continueBtn = qs("nsim-continue-payment");
    if (continueBtn && pending.payment_url) {
      continueBtn.addEventListener("click", function () {
        window.location.href = pending.payment_url;
      });
    }
  }

  function renderNumberPicker() {
    var picker = qs("nsim-number-picker");
    var list = qs("nsim-number-list");
    var moreBtn = qs("nsim-number-show-more");
    if (!picker || !list) return;

    if (
      state.simPlanId === "custom" ||
      state.statusVisible ||
      (state.pendingOrder &&
        state.pendingOrder.has_pending_order &&
        !state.pendingOrder.reservation_expired &&
        state.pendingOrder.payment_url)
    ) {
      hideNumberPicker();
      return;
    }

    var numbers = state.availableNumbers.slice(0, state.numbersLimit);
    if (!numbers.length) {
      hideNumberPicker();
      return;
    }

    if (!state.selectedInventoryPublicId && numbers[0]) {
      state.selectedInventoryPublicId = numbers[0].inventory_public_id;
    }

    list.innerHTML = numbers
      .map(function (item) {
        var selected =
          state.selectedInventoryPublicId === item.inventory_public_id;
        return (
          '<label class="nsim-number-option' +
          (selected ? " is-selected" : "") +
          '">' +
          '<input type="radio" name="nsim-number" value="' +
          item.inventory_public_id +
          '"' +
          (selected ? " checked" : "") +
          " />" +
          '<span class="nsim-number-option__body">' +
          '<span class="nsim-number-option__number">' +
          item.display_number +
          "</span>" +
          '<span class="nsim-number-option__note">Disponible para activación inmediata</span>' +
          "</span>" +
          "</label>"
        );
      })
      .join("");

    list.querySelectorAll('input[name="nsim-number"]').forEach(function (input) {
      input.addEventListener("change", function () {
        state.selectedInventoryPublicId = input.value;
        list.querySelectorAll(".nsim-number-option").forEach(function (el) {
          el.classList.toggle(
            "is-selected",
            el.querySelector('input[name="nsim-number"]').value === input.value
          );
        });
      });
    });

    picker.hidden = false;

    if (moreBtn) {
      moreBtn.hidden = !(state.availableNumbers.length > state.numbersLimit);
    }
  }

  function resetModalStatus() {
    state.statusVisible = false;
    var status = qs("nsim-modal-status");
    var form = qs("nsim-purchase-form");
    var summary = qs("nsim-modal-summary");
    var stepper = qs("nsim-modal-stepper");
    if (status) {
      status.hidden = true;
      status.innerHTML = "";
    }
    if (form) form.hidden = false;
    if (summary) summary.hidden = false;
    if (stepper && state.simPlanId !== "custom") stepper.hidden = false;
  }

  function showModalStatus(type, message, metaHtml) {
    state.statusVisible = true;
    var status = qs("nsim-modal-status");
    var form = qs("nsim-purchase-form");
    var summary = qs("nsim-modal-summary");
    var stepper = qs("nsim-modal-stepper");
    if (!status) return;

    if (form) form.hidden = true;
    if (summary) summary.hidden = true;
    if (stepper) stepper.hidden = true;

    var eyebrow = type === "demo" ? "Demo local" : type === "error" ? "Atención" : "Información";
    status.innerHTML =
      '<p class="nsim-modal-status__eyebrow">' +
      eyebrow +
      "</p>" +
      '<h3 class="nsim-modal-status__title">' +
      message +
      "</h3>" +
      (metaHtml ? '<div class="nsim-modal-status__meta">' + metaHtml + "</div>" : "") +
      (type === "demo"
        ? '<p class="nsim-modal-status__note">Después del pago, Telvoice reserva la numeración y coordina la activación en el panel del cliente.</p>'
        : "") +
      '<button type="button" class="nsim-btn-primary nsim-modal-status__close">Entendido</button>';

    status.hidden = false;
    status.querySelector(".nsim-modal-status__close").addEventListener("click", closePurchaseModal);
  }

  function openPurchaseModal(planId) {
    if (!SIM_PLANS[planId]) return;
    state.simPlanId = planId;
    state.modalOpen = true;
    state.submitting = false;
    setError("");
    clearPersonalFormFields();
    resetModalStatus();
    resetCheckoutContext();
    updateModalChrome();

    var modal = qs("nsim-purchase-modal");
    if (!modal) return;
    modal.removeAttribute("hidden");
    document.body.classList.add("nsim-modal-open");

    var first = qs("nsim-nombre");
    if (first) setTimeout(function () { first.focus(); }, 100);
  }

  function closePurchaseModal() {
    state.modalOpen = false;
    state.submitting = false;
    var modal = qs("nsim-purchase-modal");
    if (modal) modal.setAttribute("hidden", "");
    document.body.classList.remove("nsim-modal-open");
    resetModalStatus();
    setError("");
    setLoading(false);
    resetCheckoutContext();
    document.querySelectorAll(".nsim-plan-card[data-nsim-plan]").forEach(function (card) {
      card.classList.remove("is-selected");
    });
  }

  function setError(message) {
    var err = qs("nsim-form-error");
    if (!err) return;
    if (message) {
      err.textContent = message;
      err.hidden = false;
    } else {
      err.textContent = "";
      err.hidden = true;
    }
  }

  function setLoading(loading) {
    var btn = qs("nsim-submit");
    var plan = getPlan(state.simPlanId);
    if (!btn) return;
    btn.disabled = !!loading;
    btn.setAttribute("aria-busy", loading ? "true" : "false");
    if (loading) {
      btn.textContent =
        plan && plan.checkout ? "Redirigiendo a Mercado Pago…" : "Enviando solicitud…";
    } else if (plan) {
      btn.textContent = plan.submitLabel;
    }
  }

  function getFormValues() {
    return {
      nombre: (qs("nsim-nombre") && qs("nsim-nombre").value || "").trim(),
      empresa: (qs("nsim-empresa") && qs("nsim-empresa").value || "").trim(),
      email: (qs("nsim-email") && qs("nsim-email").value || "").trim(),
      telefono: (qs("nsim-telefono") && qs("nsim-telefono").value || "").trim(),
      rut: (qs("nsim-rut") && qs("nsim-rut").value || "").trim(),
      useCase: (qs("nsim-use-case") && qs("nsim-use-case").value || "").trim(),
      volume: (qs("nsim-volume") && qs("nsim-volume").value || "").trim(),
    };
  }

  function buildDemoMetaHtml(values, plan) {
    var parts = [];
    if (plan) {
      parts.push(
        "<p><strong>Plan:</strong> " +
          plan.displayName +
          (plan.total ? " · <strong>" + formatClp(plan.total) + " / mes</strong>" : "") +
          "</p>"
      );
    }
    if (values.nombre) parts.push("<p><strong>Nombre:</strong> " + values.nombre + "</p>");
    if (values.email) parts.push("<p><strong>Email:</strong> " + values.email + "</p>");
    if (values.empresa) parts.push("<p><strong>Empresa:</strong> " + values.empresa + "</p>");
    if (values.telefono) parts.push("<p><strong>Teléfono:</strong> " + values.telefono + "</p>");
    if (values.useCase) parts.push("<p><strong>Caso de uso:</strong> " + values.useCase + "</p>");
    if (values.volume) parts.push("<p><strong>Volumen estimado:</strong> " + values.volume + "</p>");
    return parts.join("");
  }

  function submitCustomRequest(values) {
    if (isNumeracionDemoMode()) {
      state.submitting = false;
      setLoading(false);
      showModalStatus(
        "demo",
        "Demo local: aquí se enviaría una solicitud comercial para diseñar un plan a medida.",
        buildDemoMetaHtml(values, getPlan("custom"))
      );
      return;
    }
    state.submitting = false;
    setLoading(false);
    window.location.href = "index.html#contacto";
  }

  function refreshCheckoutContext(emailOverride) {
    var hint = qs("nsim-stock-hint");
    if (!state.modalOpen || state.statusVisible || state.simPlanId === "custom") {
      refreshStockHint();
      return;
    }

    if (isNumeracionDemoMode()) {
      state.availableNumbers = [
        {
          inventory_public_id: "demo_pub_001",
          display_number: "+56 9 *** *** 513",
          suffix: "513",
        },
      ];
      state.selectedInventoryPublicId = "demo_pub_001";
      hidePendingOrder();
      renderNumberPicker();
      refreshStockHint();
      return;
    }

    var emailInput = qs("nsim-email");
    var email = (emailOverride || (emailInput && emailInput.value) || "").trim();
    var origin = agentApiOrigin();
    var pendingPromise = email
      ? fetch(
          origin +
            "/api/public/pending-sim-checkout?email=" +
            encodeURIComponent(email),
          { headers: { Accept: "application/json" } }
        )
          .then(function (res) {
            return res.json();
          })
          .catch(function () {
            return { has_pending_order: false };
          })
      : Promise.resolve({ has_pending_order: false });

    var numbersPromise = fetch(
      origin + "/api/public/sim-available-numbers?limit=50",
      { headers: { Accept: "application/json" } }
    )
      .then(function (res) {
        return res.json();
      })
      .catch(function () {
        return { numbers: [] };
      });

    state.contextLoading = true;
    Promise.all([pendingPromise, numbersPromise]).then(function (results) {
      if (!state.modalOpen || state.statusVisible) return;

      var pending = results[0] || { has_pending_order: false };
      var numbersData = results[1] || { numbers: [] };
      state.pendingOrder = pending.has_pending_order ? pending : null;
      state.availableNumbers = Array.isArray(numbersData.numbers)
        ? numbersData.numbers
        : [];

      renderPendingOrder(pending);

      if (
        pending.has_pending_order &&
        !pending.reservation_expired &&
        pending.payment_url
      ) {
        if (hint) hint.hidden = true;
        state.contextLoading = false;
        return;
      }

      renderNumberPicker();
      refreshStockHint();
      state.contextLoading = false;
    });
  }

  function refreshStockHint() {
    var hint = qs("nsim-stock-hint");
    if (!hint || !state.modalOpen || state.statusVisible) return;

    if (state.simPlanId === "custom") {
      hint.textContent =
        "Plan a medida: un especialista Telvoice te contactará para diseñar la solución.";
      hint.hidden = false;
      return;
    }
    if (isNumeracionDemoMode()) {
      hint.textContent = "Demo local: disponibilidad simulada para revisión visual.";
      hint.hidden = false;
      return;
    }
    var agentOrigin =
      (window.TELVOICE_CONFIG && window.TELVOICE_CONFIG.agentApiOrigin) ||
      "https://agent.telvoice.cl";
    fetch(agentOrigin + "/api/public/sim-availability", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (
          state.pendingOrder &&
          state.pendingOrder.has_pending_order &&
          !state.pendingOrder.reservation_expired &&
          state.pendingOrder.payment_url
        ) {
          hint.hidden = true;
          return;
        }
        if (state.availableNumbers.length > 0) {
          hint.hidden = true;
          return;
        }
        if (data && data.in_stock === false) {
          hint.textContent = SIM_NO_STOCK_ERROR;
          hint.hidden = false;
        } else {
          hint.hidden = true;
        }
      })
      .catch(function () {
        hint.hidden = true;
      });
  }

  function submitPurchaseModal(e) {
    if (e) e.preventDefault();
    if (state.submitting || state.statusVisible) return;

    var values = getFormValues();
    if (values.nombre.length < 2) {
      setError("Ingresa tu nombre.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      setError("Ingresa un email válido.");
      return;
    }

    setError("");
    state.submitting = true;
    setLoading(true);

    if (state.simPlanId === "custom") {
      submitCustomRequest(values);
      return;
    }

    var sim = getPlan(state.simPlanId);

    if (isNumeracionDemoMode()) {
      state.submitting = false;
      setLoading(false);
      showModalStatus(
        "demo",
        "Demo local: aquí se crearía la orden y serías redirigido al pago seguro por MercadoPago.",
        buildDemoMetaHtml(values, sim)
      );
      return;
    }

    var agentOrigin =
      (window.TELVOICE_CONFIG && window.TELVOICE_CONFIG.agentApiOrigin) ||
      "https://agent.telvoice.cl";
    var agentAddonId = SIM_PLAN_AGENT_MAP[state.simPlanId] || "agent_pro";

    if (
      state.pendingOrder &&
      state.pendingOrder.has_pending_order &&
      !state.pendingOrder.reservation_expired &&
      state.pendingOrder.payment_url
    ) {
      window.location.href = state.pendingOrder.payment_url;
      return;
    }

    var payload = {
      product_type: "sim_agent_bundle",
      sim_plan_id: state.simPlanId,
      agent_addon_id: agentAddonId,
      checkout_email: values.email,
      payer_name: values.nombre,
      company_name: values.empresa || undefined,
      phone: values.telefono || undefined,
      tax_id: values.rut || undefined,
    };

    if (state.selectedInventoryPublicId) {
      payload.inventory_public_id = state.selectedInventoryPublicId;
    } else if (state.availableNumbers[0]) {
      payload.inventory_public_id = state.availableNumbers[0].inventory_public_id;
    }

    fetch(agentOrigin + "/api/public/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return parseApiJson(res).then(function (data) {
          return { httpOk: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        var data = result.data || {};
        var checkoutUrl = data.checkout_url;
        if (!result.httpOk || data.success !== true || !checkoutUrl) {
          if (result.status === 403 && data.code === "not_enabled") {
            throw new Error(SIM_NOT_ENABLED_ERROR);
          }
          if (result.status === 409 && data.code === "no_stock") {
            throw new Error(SIM_NO_STOCK_ERROR);
          }
          if (result.status === 409 && data.code === "NUMBER_UNAVAILABLE") {
            refreshCheckoutContext(values.email);
            throw new Error(SIM_NUMBER_TAKEN_ERROR);
          }
          if (result.status === 409 && data.code === "PENDING_ORDER_EXISTS") {
            refreshCheckoutContext(values.email);
            throw new Error(
              "Ya tienes una orden pendiente para este correo. Usa Continuar pago."
            );
          }
          throw new Error(formatCheckoutError(data));
        }
        window.location.href = checkoutUrl;
      })
      .catch(function (err) {
        state.submitting = false;
        setLoading(false);
        if (isNumeracionDemoMode() && window.console) {
          console.debug("[nsim checkout]", err);
        }
        setError(formatCheckoutError(null, err && err.message));
      });
  }

  function initNav() {
    document.querySelectorAll(".site-nav-dropdown-toggle").forEach(function (toggle) {
      var menuId = toggle.getAttribute("aria-controls");
      var menu = menuId ? document.getElementById(menuId) : null;
      if (!menu) return;
      toggle.addEventListener("click", function () {
        var wrap = toggle.closest(".site-nav-dropdown");
        var open = wrap && wrap.classList.contains("is-open");
        document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (w) {
          var t = w.querySelector(".site-nav-dropdown-toggle");
          var m = w.querySelector(".site-nav-dropdown-menu");
          if (t && m) {
            w.classList.remove("is-open");
            t.setAttribute("aria-expanded", "false");
            m.setAttribute("hidden", "");
          }
        });
        if (!open && wrap) {
          wrap.classList.add("is-open");
          toggle.setAttribute("aria-expanded", "true");
          menu.removeAttribute("hidden");
        }
      });
    });

    var menuToggle = qs("menu-toggle");
    var mobilePanel = qs("mobile-panel");
    if (menuToggle && mobilePanel) {
      menuToggle.addEventListener("click", function () {
        var open = !mobilePanel.classList.contains("hidden");
        mobilePanel.classList.toggle("hidden", open);
        menuToggle.setAttribute("aria-expanded", open ? "false" : "true");
        var openIcon = qs("menu-icon-open");
        var closeIcon = qs("menu-icon-close");
        if (openIcon) openIcon.classList.toggle("hidden", !open);
        if (closeIcon) closeIcon.classList.toggle("hidden", open);
      });
    }

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".site-nav-dropdown")) {
        document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (wrap) {
          var t = wrap.querySelector(".site-nav-dropdown-toggle");
          var m = wrap.querySelector(".site-nav-dropdown-menu");
          if (t && m) {
            wrap.classList.remove("is-open");
            t.setAttribute("aria-expanded", "false");
            m.setAttribute("hidden", "");
          }
        });
      }
    });
  }

  function initPurchaseModal() {
    var closeBtn = qs("nsim-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closePurchaseModal);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.modalOpen) closePurchaseModal();
    });

    var form = qs("nsim-purchase-form");
    if (form) form.addEventListener("submit", submitPurchaseModal);

    var emailInput = qs("nsim-email");
    if (emailInput) {
      var emailTimer = null;
      emailInput.addEventListener("input", function () {
        if (!state.modalOpen || state.simPlanId === "custom") return;
        window.clearTimeout(emailTimer);
        emailTimer = window.setTimeout(function () {
          refreshCheckoutContext(emailInput.value.trim());
        }, 450);
      });
      emailInput.addEventListener("blur", function () {
        if (!state.modalOpen || state.simPlanId === "custom") return;
        refreshCheckoutContext(emailInput.value.trim());
      });
    }

    var showMoreBtn = qs("nsim-number-show-more");
    if (showMoreBtn) {
      showMoreBtn.addEventListener("click", function () {
        state.numbersLimit += NUMBERS_PAGE_SIZE;
        renderNumberPicker();
      });
    }
  }

  function init() {
    initNav();
    initPurchaseModal();

    document.querySelectorAll(".nsim-plan-cta").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var planId = btn.getAttribute("data-nsim-plan");
        if (planId) openPurchaseModal(planId);
      });
    });

    document.querySelectorAll("[data-scroll-to]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-scroll-to"));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
