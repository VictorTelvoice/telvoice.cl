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
      name: "Starter",
      displayName: "Starter",
      sms: 1000,
      total: 19990,
    },
    sim_pro: {
      plan_id: "sim_pro",
      name: "Pro",
      displayName: "Pro",
      sms: 2000,
      total: 39990,
    },
    sim_power: {
      plan_id: "sim_power",
      name: "Power",
      displayName: "Power",
      sms: 4000,
      total: 99990,
    },
  };

  var SIM_PLAN_AGENT_MAP = {
    sim_starter: "agent_start",
    sim_pro: "agent_pro",
    sim_power: "agent_business",
  };

  var AGENT_LABELS = {
    agent_start: "Agente Start",
    agent_pro: "Agente Pro",
    agent_business: "Agente Business",
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

  function updateSummary() {
    var sim = SIM_PLANS[state.simPlanId];
    if (!sim) return;

    var agentId = SIM_PLAN_AGENT_MAP[state.simPlanId] || "agent_pro";
    var agentLabel = AGENT_LABELS[agentId] || "Agente Telvoice";

    var planSelect = qs("nsim-plan-select");
    if (planSelect) planSelect.value = state.simPlanId;

    var rows = {
      "nsim-summary-plan": sim.displayName,
      "nsim-summary-sim": "1 número SIM real incluido",
      "nsim-summary-sms": fmt(sim.sms) + " SMS salientes / mes",
      "nsim-summary-agent": agentLabel.replace(/^Agente\s+/i, "Agente Telvoice "),
      "nsim-summary-total": formatClp(sim.total) + " / mes",
    };

    Object.keys(rows).forEach(function (id) {
      var el = qs(id);
      if (el) el.textContent = rows[id];
    });

    document.querySelectorAll("[data-nsim-plan]").forEach(function (card) {
      var selected = card.getAttribute("data-nsim-plan") === state.simPlanId;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function selectPlan(planId) {
    if (!SIM_PLANS[planId]) return;
    state.simPlanId = planId;
    updateSummary();
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
    if (!btn) return;
    btn.disabled = !!loading;
    btn.setAttribute("aria-busy", loading ? "true" : "false");
    btn.textContent = loading ? "Redirigiendo a Mercado Pago…" : "Comprar numeración SIM";
  }

  function showDemoModal(planName, totalLabel) {
    var existing = qs("nsim-demo-modal");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "nsim-demo-modal";
    overlay.className = "nsim-demo-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "nsim-demo-modal-title");
    overlay.innerHTML =
      '<div class="nsim-demo-modal__panel">' +
      '<p class="nsim-demo-modal__eyebrow">Demo local</p>' +
      '<h3 id="nsim-demo-modal-title">Demo local: aquí se crearía la orden y el pago MercadoPago.</h3>' +
      '<p class="nsim-demo-modal__note">Plan: <strong>' +
      planName +
      "</strong> · Total mensual: <strong>" +
      totalLabel +
      "</strong></p>" +
      "<ul class=\"nsim-demo-modal__list\">" +
      "<li>Se reservaría una numeración móvil por 30 minutos.</li>" +
      "<li>Se crearía una orden pendiente de pago en Telvoice.</li>" +
      "<li>Al aprobarse el pago, Telvoice activa la numeración.</li>" +
      "<li>El cliente accede al panel para operar el número y el agente incluido.</li>" +
      "</ul>" +
      '<p class="nsim-demo-modal__note">Modo demo: no se creó orden, no se llamó MercadoPago y no se reservó numeración real.</p>' +
      '<button type="button" class="nsim-btn-primary nsim-demo-modal__close">Entendido</button>' +
      "</div>";
    document.body.appendChild(overlay);
    overlay.querySelector(".nsim-demo-modal__close").addEventListener("click", function () {
      overlay.remove();
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  function refreshStockHint() {
    var hint = qs("nsim-stock-hint");
    if (!hint) return;
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

    var sim = SIM_PLANS[state.simPlanId];

    if (isNumeracionDemoMode()) {
      state.submitting = false;
      setLoading(false);
      showDemoModal(
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
    updateSummary();
    refreshStockHint();

    document.querySelectorAll("[data-nsim-plan]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest(".nsim-plan-cta")) return;
        selectPlan(el.getAttribute("data-nsim-plan") || "sim_starter");
      });
    });

    document.querySelectorAll(".nsim-plan-cta").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var planId = btn.getAttribute("data-nsim-plan");
        if (planId) selectPlan(planId);
        var checkout = qs("nsim-checkout");
        if (checkout) checkout.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    var planSelect = qs("nsim-plan-select");
    if (planSelect) {
      planSelect.addEventListener("change", function () {
        selectPlan(planSelect.value);
      });
    }

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
