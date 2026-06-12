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

    refreshStockHint();
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
    resetModalStatus();
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

    fetch(agentOrigin + "/api/public/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        product_type: "sim_agent_bundle",
        sim_plan_id: state.simPlanId,
        agent_addon_id: agentAddonId,
        checkout_email: values.email,
        payer_name: values.nombre,
        company_name: values.empresa || undefined,
        phone: values.telefono || undefined,
        tax_id: values.rut || undefined,
        use_case: values.useCase || undefined,
      }),
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
          throw new Error((data && (data.error || data.message)) || SIM_CHECKOUT_ERROR);
        }
        window.location.href = checkoutUrl;
      })
      .catch(function (err) {
        state.submitting = false;
        setLoading(false);
        setError((err && err.message) || SIM_CHECKOUT_ERROR);
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
