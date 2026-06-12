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
      total: 29990,
      checkout: true,
      submitLabel: "Continuar con Starter",
    },
    sim_pro: {
      plan_id: "sim_pro",
      displayName: "Pro",
      total: 49990,
      checkout: true,
      submitLabel: "Continuar con Pro",
    },
    custom: {
      plan_id: "custom",
      displayName: "A medida",
      checkout: false,
      submitLabel: "Solicitar evaluación",
    },
  };

  var SIM_PLAN_AGENT_MAP = {
    sim_starter: "agent_start",
    sim_pro: "agent_pro",
  };

  var SIM_CHECKOUT_ERROR =
    "No pudimos iniciar el pago en este momento. Escríbenos para activar tu numeración SIM real.";
  var SIM_NO_STOCK_ERROR =
    "No hay numeración móvil disponible en este momento. Intenta más tarde o contáctanos.";

  function isNumeracionDemoMode() {
    try {
      return new URLSearchParams(window.location.search).get("demo_numeracion") === "1";
    } catch (e) {
      return false;
    }
  }

  var state = {
    simPlanId: "sim_starter",
    panelOpen: false,
    submitting: false,
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

  function buildDrawerSummaryHtml(planId) {
    if (planId === "custom") {
      return (
        '<p class="nsim-drawer-summary__plan">A medida</p>' +
        '<p class="nsim-drawer-summary__price">Cotización personalizada</p>' +
        '<ul class="nsim-drawer-summary__list">' +
        "<li>Número(s) SIM según necesidad</li>" +
        "<li>SMS según volumen</li>" +
        "<li>Integraciones y automatizaciones personalizadas</li>" +
        "</ul>"
      );
    }
    if (planId === "sim_pro") {
      return (
        '<p class="nsim-drawer-summary__plan">Pro</p>' +
        '<p class="nsim-drawer-summary__price">' +
        formatClp(49990) +
        " / mes</p>" +
        '<ul class="nsim-drawer-summary__list">' +
        "<li>Todo lo que incluye Starter</li>" +
        "<li>2.000 SMS salientes incluidos</li>" +
        "<li>Bot Telegram y automatizaciones</li>" +
        "</ul>"
      );
    }
    return (
      '<p class="nsim-drawer-summary__plan">Starter</p>' +
      '<p class="nsim-drawer-summary__price">' +
      formatClp(29990) +
      " / mes</p>" +
      '<ul class="nsim-drawer-summary__list">' +
      "<li>1 número SIM real</li>" +
      "<li>1.000 SMS salientes incluidos</li>" +
      "<li>Agente Telvoice incluido</li>" +
      "</ul>"
    );
  }

  function updateDrawerContent() {
    var plan = getPlan(state.simPlanId);
    if (!plan) return;

    var summary = qs("nsim-drawer-summary");
    if (summary) summary.innerHTML = buildDrawerSummaryHtml(state.simPlanId);

    var title = qs("nsim-drawer-title");
    var subtitle = qs("nsim-drawer-subtitle");
    if (plan.plan_id === "custom") {
      if (title) title.textContent = "Solicita un plan a medida";
      if (subtitle) {
        subtitle.textContent =
          "Cuéntanos tu volumen e integraciones. Telvoice diseña una propuesta comercial sin compra automática.";
      }
    } else {
      if (title) title.textContent = "Completa la compra de tu numeración SIM";
      if (subtitle) {
        subtitle.textContent =
          "Revisamos la disponibilidad, reservamos tu número y coordinamos la activación desde Telvoice.";
      }
    }

    var submitBtn = qs("nsim-submit");
    if (submitBtn && !state.submitting) submitBtn.textContent = plan.submitLabel;

    document.querySelectorAll("[data-nsim-plan]").forEach(function (card) {
      if (!card.classList.contains("nsim-plan-card")) return;
      var selected = card.getAttribute("data-nsim-plan") === state.simPlanId && state.panelOpen;
      card.classList.toggle("is-selected", selected);
    });

    refreshStockHint();
  }

  function openCheckoutPanel(planId) {
    if (!SIM_PLANS[planId]) return;
    state.simPlanId = planId;
    state.panelOpen = true;
    setError("");

    var drawer = qs("nsim-checkout-drawer");
    if (drawer) {
      drawer.removeAttribute("hidden");
      drawer.classList.add("is-open");
    }

    updateDrawerContent();

    requestAnimationFrame(function () {
      if (drawer) {
        drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }

  function closeCheckoutPanel() {
    state.panelOpen = false;
    var drawer = qs("nsim-checkout-drawer");
    if (drawer) {
      drawer.classList.remove("is-open");
      drawer.setAttribute("hidden", "");
    }
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
      btn.textContent = plan && plan.checkout ? "Redirigiendo a Mercado Pago…" : "Enviando solicitud…";
    } else if (plan) {
      btn.textContent = plan.submitLabel;
    }
  }

  function closeModal(overlay) {
    if (overlay) overlay.remove();
  }

  function showDemoCheckoutModal(planName, totalLabel) {
    var existing = qs("nsim-demo-modal");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "nsim-demo-modal";
    overlay.className = "nsim-demo-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div class="nsim-demo-modal__panel">' +
      '<p class="nsim-demo-modal__eyebrow">Demo local</p>' +
      "<h3>Demo local: aquí se crearía la orden y el pago MercadoPago.</h3>" +
      '<p class="nsim-demo-modal__note">Plan: <strong>' +
      planName +
      "</strong> · Total mensual: <strong>" +
      totalLabel +
      "</strong></p>" +
      '<p class="nsim-demo-modal__note">Modo demo: no se creó orden, no se llamó MercadoPago y no se reservó numeración real.</p>' +
      '<button type="button" class="nsim-btn-primary nsim-demo-modal__close">Entendido</button>' +
      "</div>";
    document.body.appendChild(overlay);
    overlay.querySelector(".nsim-demo-modal__close").addEventListener("click", function () {
      closeModal(overlay);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal(overlay);
    });
  }

  function showCustomDemoModal() {
    var existing = qs("nsim-demo-modal");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "nsim-demo-modal";
    overlay.className = "nsim-demo-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div class="nsim-demo-modal__panel">' +
      '<p class="nsim-demo-modal__eyebrow">Demo local</p>' +
      "<h3>Demo local: aquí se enviaría una solicitud comercial para diseñar un plan a medida.</h3>" +
      '<p class="nsim-demo-modal__note">Modo demo: no se creó solicitud real ni se llamó al checkout.</p>' +
      '<button type="button" class="nsim-btn-primary nsim-demo-modal__close">Entendido</button>' +
      "</div>";
    document.body.appendChild(overlay);
    overlay.querySelector(".nsim-demo-modal__close").addEventListener("click", function () {
      closeModal(overlay);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal(overlay);
    });
  }

  function submitCustomRequest() {
    if (isNumeracionDemoMode()) {
      state.submitting = false;
      setLoading(false);
      showCustomDemoModal();
      return;
    }
    state.submitting = false;
    setLoading(false);
    window.location.href = "index.html#contacto";
  }

  function refreshStockHint() {
    var hint = qs("nsim-stock-hint");
    if (!hint || !state.panelOpen) return;

    if (state.simPlanId === "custom") {
      hint.textContent = "Plan a medida: un especialista Telvoice te contactará para diseñar la solución.";
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

  function submitCheckout(e) {
    if (e) e.preventDefault();
    if (state.submitting) return;

    var nombre = (qs("nsim-nombre") && qs("nsim-nombre").value || "").trim();
    var email = (qs("nsim-email") && qs("nsim-email").value || "").trim();
    var empresa = (qs("nsim-empresa") && qs("nsim-empresa").value || "").trim();
    var telefono = (qs("nsim-telefono") && qs("nsim-telefono").value || "").trim();
    var rut = (qs("nsim-rut") && qs("nsim-rut").value || "").trim();
    var useCase = (qs("nsim-use-case") && qs("nsim-use-case").value || "").trim();

    if (nombre.length < 2) {
      setError("Ingresa tu nombre.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Ingresa un email válido.");
      return;
    }

    setError("");
    state.submitting = true;
    setLoading(true);

    if (state.simPlanId === "custom") {
      submitCustomRequest();
      return;
    }

    var sim = getPlan(state.simPlanId);

    if (isNumeracionDemoMode()) {
      state.submitting = false;
      setLoading(false);
      showDemoCheckoutModal(
        sim ? sim.displayName : "Numeración SIM",
        sim ? formatClp(sim.total) + " / mes" : "",
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
        checkout_email: email,
        payer_name: nombre,
        company_name: empresa || undefined,
        phone: telefono || undefined,
        tax_id: rut || undefined,
        use_case: useCase || undefined,
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

  function init() {
    initNav();

    document.querySelectorAll(".nsim-plan-cta").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var planId = btn.getAttribute("data-nsim-plan");
        if (planId) openCheckoutPanel(planId);
      });
    });

    var closeBtn = qs("nsim-drawer-close");
    if (closeBtn) closeBtn.addEventListener("click", closeCheckoutPanel);

    document.querySelectorAll("[data-scroll-to]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-scroll-to"));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    var form = qs("nsim-checkout-form");
    if (form) form.addEventListener("submit", submitCheckout);

    var submitBtn = qs("nsim-submit");
    if (submitBtn) submitBtn.addEventListener("click", submitCheckout);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
