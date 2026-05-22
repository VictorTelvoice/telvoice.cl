/**
 * FloatingSalesAgent + SalesAgentChatWidget — agente comercial Telvoice.cl
 */
(function () {
  "use strict";

  var CFG = window.TELVOICE_CONFIG || {};
  var ROOT = window.TELVOICE_WEB_AGENT_ROOT || "";
  var API_BASE = (CFG.apiOrigin || "").replace(/\/$/, "");
  var VISITOR_KEY = "tva_visitor";
  var SESSION_KEY = "tva_session";

  function asset(path) {
    return ROOT + path;
  }

  function apiUrl(path) {
    if (API_BASE.indexOf("http") === 0) {
      return API_BASE + path;
    }
    return path;
  }

  function qs(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function getVisitorKey() {
    try {
      var existing = localStorage.getItem(VISITOR_KEY);
      if (existing && existing.length >= 12) {
        return existing;
      }
      var id =
        "tva_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 12);
      localStorage.setItem(VISITOR_KEY, id);
      return id;
    } catch (e) {
      return "tva_" + Math.random().toString(36).slice(2, 16);
    }
  }

  function getSessionId() {
    try {
      return sessionStorage.getItem(SESSION_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setSessionId(id) {
    try {
      if (id) {
        sessionStorage.setItem(SESSION_KEY, id);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function appendMessage(container, role, text) {
    var div = document.createElement("div");
    div.className = "tva-msg tva-msg--" + (role === "user" ? "user" : "bot");
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function renderQuickActions(container, actions, onClick) {
    container.innerHTML = "";
    (actions || []).forEach(function (action) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = action.label;
      btn.dataset.actionId = action.id;
      btn.addEventListener("click", function () {
        onClick(action.id, action.label);
      });
      container.appendChild(btn);
    });
  }

  function renderCtas(container, ctas) {
    container.innerHTML = "";
    if (!ctas || !ctas.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    ctas.forEach(function (cta) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = cta.label || "Continuar";
      if (cta.type === "register" || cta.type === "advisor") {
        btn.className = "tva-cta--secondary";
      }
      btn.addEventListener("click", function () {
        handleCta(cta);
      });
      container.appendChild(btn);
    });
  }

  function planFromCalcSms(sms) {
    var tiers = CFG.volumeTiers || [];
    var vol = Math.round(Number(sms));
    if (!vol || vol < 1000) {
      return null;
    }
    vol = Math.ceil(vol / 1000) * 1000;
    if (vol < 1000) {
      vol = 1000;
    }
    var tier = null;
    for (var i = tiers.length - 1; i >= 0; i--) {
      if (vol >= tiers[i].min) {
        tier = tiers[i];
        break;
      }
    }
    if (!tier && tiers.length) {
      tier = tiers[0];
    }
    if (!tier) {
      return null;
    }
    var net = vol * tier.pxSMS;
    var tax = Math.round(net * (CFG.ivaRate || 0.19));
    return {
      planId: "calc",
      calcSms: vol,
      planName: "Bolsa " + vol.toLocaleString("es-CL") + " SMS",
      sms: vol,
      net_amount: net,
      tax_amount: tax,
      total_amount: net + tax,
      source: "web_agent",
    };
  }

  function handleCta(cta) {
    if (!cta) {
      return;
    }
    if (cta.type === "pay" && cta.calc_sms) {
      var payload = planFromCalcSms(cta.calc_sms);
      if (payload && typeof window.TELVOICE_OPEN_CHECKOUT === "function") {
        window.TELVOICE_OPEN_CHECKOUT(payload);
        return;
      }
      if (payload) {
        redirectToCheckout(payload);
        return;
      }
      window.location.href = (API_BASE || "/") + "#precios";
      return;
    }
    if (cta.type === "register" && cta.url) {
      window.open(cta.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (cta.type === "advisor") {
      var email = CFG.salesEmail || "ventas@telvoice.net";
      window.location.href =
        "mailto:" +
        email +
        "?subject=" +
        encodeURIComponent("Consulta comercial Telvoice.cl") +
        "&body=" +
        encodeURIComponent(
          "Hola, quiero hablar con un asesor sobre bolsas SMS en Chile.",
        );
      return;
    }
    if (cta.hash === "#precios" || cta.type === "pay") {
      window.location.href = (API_BASE || "/") + "#precios";
      return;
    }
    if (cta.type === "lead") {
      sendToApi({ message: "Quiero dejar mis datos para comprar" });
    }
  }

  var state = {
    open: false,
    loading: false,
    welcomed: false,
  };

  var els = {};

  function agentIsotipoUrl() {
    return asset("public/telvoice-agent-isotipo.png");
  }

  function buildUi() {
    var iso = agentIsotipoUrl();
    var root = document.createElement("div");
    root.className = "tva-root";
    root.id = "telvoice-web-agent";
    root.innerHTML =
      '<div class="tva-launcher-wrap">' +
      '<span class="tva-badge" aria-hidden="true">Asesor en línea</span>' +
      '<button type="button" class="tva-launcher" aria-expanded="false" aria-controls="tva-panel" aria-label="Abrir agente comercial Telvoice">' +
      '<img src="' +
      escHtml(iso) +
      '" alt="" width="48" height="48" decoding="async" data-tva-iso="1" />' +
      "</button></div>" +
      '<div id="tva-panel" class="tva-panel" role="dialog" aria-labelledby="tva-title" aria-modal="true">' +
      '<div class="tva-header">' +
      '<img src="' +
      escHtml(iso) +
      '" alt="" width="40" height="40" decoding="async" data-tva-iso="1" />' +
      '<div class="tva-header-text"><h2 id="tva-title">Agente Telvoice</h2><p>Cotiza SMS para Chile</p></div>' +
      '<button type="button" class="tva-close" aria-label="Cerrar chat"><span aria-hidden="true">×</span></button>' +
      "</div>" +
      '<div class="tva-messages" id="tva-messages" aria-live="polite"></div>' +
      '<div class="tva-quick" id="tva-quick"></div>' +
      '<div class="tva-ctas" id="tva-ctas" hidden></div>' +
      '<form class="tva-form" id="tva-form">' +
      '<input type="text" id="tva-input" placeholder="Escribe tu mensaje…" autocomplete="off" maxlength="2000" />' +
      '<button type="submit">Enviar</button>' +
      "</form>" +
      "</div>";

    document.body.appendChild(root);

    root.querySelectorAll("[data-tva-iso]").forEach(function (img) {
      img.addEventListener("error", function () {
        if (img.dataset.fallback) return;
        img.dataset.fallback = "1";
        img.src = asset("assets/telvoice-agent-isotipo.png");
      });
    });

    els.root = root;
    els.launcher = qs(".tva-launcher", root);
    els.panel = qs(".tva-panel", root);
    els.messages = qs("#tva-messages", root);
    els.quick = qs("#tva-quick", root);
    els.ctas = qs("#tva-ctas", root);
    els.form = qs("#tva-form", root);
    els.input = qs("#tva-input", root);
    els.close = qs(".tva-close", root);

    els.launcher.addEventListener("click", togglePanel);
    els.close.addEventListener("click", closePanel);
    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = (els.input.value || "").trim();
      if (!text || state.loading) {
        return;
      }
      els.input.value = "";
      appendMessage(els.messages, "user", text);
      sendToApi({ message: text });
    });
  }

  function togglePanel() {
    if (state.open) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    state.open = true;
    els.root.classList.add("tva-root--chat-open");
    els.panel.classList.add("is-open");
    els.launcher.setAttribute("aria-expanded", "true");
    if (!state.welcomed) {
      state.welcomed = true;
      sendToApi({ message: "" });
    }
    setTimeout(function () {
      els.input.focus();
    }, 200);
  }

  function closePanel() {
    state.open = false;
    els.root.classList.remove("tva-root--chat-open");
    els.panel.classList.remove("is-open");
    els.launcher.setAttribute("aria-expanded", "false");
  }

  function applyResponse(data) {
    if (data.session_id || data.session_token) {
      setSessionId(data.session_id || data.session_token);
    }
    if (data.reply) {
      appendMessage(els.messages, "bot", data.reply);
    }
    if (data.quick_actions) {
      renderQuickActions(els.quick, data.quick_actions, function (id, label) {
        appendMessage(els.messages, "user", label);
        sendToApi({ quick_action: id });
      });
    }
    renderCtas(els.ctas, data.ctas);
  }

  function sendToApi(payload) {
    if (state.loading) {
      return;
    }
    state.loading = true;
    var submitBtn = els.form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
    }
    var typing = appendMessage(els.messages, "bot", "Escribiendo…");
    typing.classList.add("tva-msg--typing");

    fetch(apiUrl("/api/web-agent/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_token: getVisitorKey(),
        visitor_key: getVisitorKey(),
        session_id: getSessionId(),
        current_url: window.location.href,
        page_url: window.location.href,
        landing_page: window.location.pathname,
        message: payload.message || "",
        quick_action: payload.quick_action || null,
      }),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var data;
          try {
            data = text ? JSON.parse(text) : {};
          } catch (parseErr) {
            throw new Error(
              res.ok
                ? "Respuesta inválida del servidor."
                : "El agente no está disponible temporalmente.",
            );
          }
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "Error del agente comercial");
          }
          return data;
        });
      })
      .then(function (data) {
        typing.remove();
        applyResponse(data);
      })
      .catch(function (err) {
        typing.remove();
        appendMessage(
          els.messages,
          "bot",
          "No pude conectar con el agente en este momento. " +
            (err.message || "Intenta de nuevo.") +
            "\n\nTambién puedes escribir a ventas@telvoice.net o usar la calculadora en Precios.",
        );
      })
      .finally(function () {
        state.loading = false;
        if (submitBtn) {
          submitBtn.disabled = false;
        }
      });
  }

  function redirectToCheckout(payload) {
    try {
      sessionStorage.setItem("tva_pending_checkout", JSON.stringify(payload));
    } catch (e) {
      /* ignore */
    }
    window.location.href = (API_BASE || "/") + "#precios";
  }

  function initPendingCheckoutOnLanding() {
    if (!document.getElementById("compra-modal")) {
      return;
    }
    var pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem("tva_pending_checkout") || "null");
      sessionStorage.removeItem("tva_pending_checkout");
    } catch (e) {
      pending = null;
    }
    var calc = new URLSearchParams(window.location.search).get("agent_calc");
    if (calc && !pending) {
      pending = planFromCalcSms(calc);
    }
    if (pending && typeof window.TELVOICE_OPEN_CHECKOUT === "function") {
      setTimeout(function () {
        window.TELVOICE_OPEN_CHECKOUT(pending);
      }, 800);
    }
  }

  function init() {
    if (document.getElementById("telvoice-web-agent")) {
      return;
    }
    buildUi();
    initPendingCheckoutOnLanding();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
