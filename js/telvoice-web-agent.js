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
  var CHAT_STATE_KEY = "tva_chat_state";
  var HERO_AGENT_DIALOG_VERSION = "20260610_v3";
  var HERO_EMBED_STATE_KEY = "tva_hero_embed_" + HERO_AGENT_DIALOG_VERSION;

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
      return localStorage.getItem(SESSION_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setSessionId(id) {
    try {
      if (id) {
        localStorage.setItem(SESSION_KEY, id);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function persistChatState() {
    try {
      localStorage.setItem(
        CHAT_STATE_KEY,
        JSON.stringify({
          sessionId: getSessionId(),
          welcomed: state.welcomed,
          messages: state.messages,
          drawerQuick: state.drawerQuick,
          drawerCtas: state.drawerCtas,
        }),
      );
    } catch (e) {
      /* ignore */
    }
  }

  function restoreChatState() {
    try {
      var raw = localStorage.getItem(CHAT_STATE_KEY);
      if (!raw) {
        return false;
      }
      var saved = JSON.parse(raw);
      if (saved.sessionId) {
        setSessionId(saved.sessionId);
      }
      if (Array.isArray(saved.messages) && saved.messages.length) {
        state.messages = saved.messages;
        state.welcomed = true;
      } else if (saved.welcomed) {
        state.welcomed = true;
      }
      if (saved.drawerQuick) {
        state.drawerQuick = saved.drawerQuick;
      }
      if (saved.drawerCtas) {
        state.drawerCtas = saved.drawerCtas;
      }
      return state.messages.length > 0;
    } catch (e) {
      return false;
    }
  }

  function heroEmbedStorage() {
    try {
      return window.sessionStorage;
    } catch (e) {
      return null;
    }
  }

  function persistHeroEmbedState() {
    if (isLabLanding()) {
      return;
    }
    var store = heroEmbedStorage();
    if (!store) {
      return;
    }
    try {
      store.setItem(
        HERO_EMBED_STATE_KEY,
        JSON.stringify({
          version: HERO_AGENT_DIALOG_VERSION,
          messages: heroEmbedState.messages,
          drawerQuick: heroEmbedState.drawerQuick,
          drawerCtas: heroEmbedState.drawerCtas,
          lastIntent: heroEmbedState.lastIntent,
          presentationDone: heroEmbedState.presentationDone,
          mode: heroEmbedState.mode,
        }),
      );
    } catch (e) {
      /* ignore */
    }
  }

  function clearLegacyHeroEmbedStorage() {
    try {
      [
        "tva_hero_embed_lab",
        "tva_hero_embed_lab_v2",
        "tva_hero_embed_20260610_v3",
      ].forEach(function (key) {
        localStorage.removeItem(key);
        if (heroEmbedStorage()) {
          heroEmbedStorage().removeItem(key);
        }
      });
    } catch (e) {
      /* ignore */
    }
  }

  function restoreHeroEmbedState() {
    if (!isLabLanding()) {
      return false;
    }
    var store = heroEmbedStorage();
    if (!store) {
      return false;
    }
    try {
      var raw = store.getItem(HERO_EMBED_STATE_KEY);
      if (!raw) {
        return false;
      }
      var saved = JSON.parse(raw);
      if (saved.version !== HERO_AGENT_DIALOG_VERSION) {
        store.removeItem(HERO_EMBED_STATE_KEY);
        return false;
      }
      heroEmbedState.messages = Array.isArray(saved.messages) ? saved.messages : [];
      heroEmbedState.drawerQuick = saved.drawerQuick || [];
      heroEmbedState.drawerCtas = saved.drawerCtas || [];
      heroEmbedState.lastIntent = saved.lastIntent || null;
      heroEmbedState.presentationDone = !!saved.presentationDone;
      heroEmbedState.mode = saved.mode || (heroEmbedState.messages.length ? "interaction" : "presentation");
      return heroEmbedState.messages.length > 0 || heroEmbedState.presentationDone;
    } catch (e) {
      return false;
    }
  }

  function renderStoredMessages() {
    messageContainers().forEach(function (container) {
      container.innerHTML = "";
    });
    state.messages.forEach(function (msg) {
      if (msg && msg.text) {
        appendMessageAll(msg.role === "user" ? "user" : "bot", msg.text);
      }
    });
  }

  function pushStoredMessage(role, text) {
    if (!text) {
      return;
    }
    state.messages.push({ role: role, text: text });
    persistChatState();
  }

  function resumeChatFromServer() {
    var sessionId = getSessionId();
    if (!sessionId || String(sessionId).indexOf("local-") === 0) {
      return Promise.resolve(false);
    }
    return fetch(apiUrl("/api/web-agent/resume"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_token: getVisitorKey(),
        visitor_key: getVisitorKey(),
        session_id: sessionId,
        current_url: window.location.href,
      }),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var data;
          try {
            data = text ? JSON.parse(text) : {};
          } catch (e) {
            return null;
          }
          if (!res.ok || !data.ok || !data.has_history) {
            return null;
          }
          return data;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function applyResumeData(data) {
    if (!data) {
      return;
    }
    if (data.session_id) {
      setSessionId(data.session_id);
    }
    if (Array.isArray(data.messages) && data.messages.length) {
      state.messages = data.messages.map(function (m) {
        return { role: m.role, text: m.text };
      });
      state.welcomed = true;
      renderStoredMessages();
    }
    if (data.quick_actions) {
      state.drawerQuick = data.quick_actions;
    }
    if (data.ctas) {
      state.drawerCtas = data.ctas;
    }
    syncActionDrawer(state.drawerQuick, state.drawerCtas);
    persistChatState();
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function appendMessage(container, role, text) {
    var div = document.createElement("div");
    var isBot = role !== "user";
    div.className = "tva-msg tva-msg--" + (isBot ? "bot" : "user");

    if (isBot && usesAgentAvatarIn(container)) {
      div.classList.add("tva-msg--with-avatar");
      var avatar = document.createElement("picture");
      avatar.className = "tva-msg-avatar-wrap";
      avatar.innerHTML =
        '<source type="image/webp" srcset="' +
        escHtml(labAgentProfileWebpUrl()) +
        '" />' +
        '<img class="tva-msg-avatar" src="' +
        escHtml(labAgentProfilePngUrl()) +
        '" alt="" width="40" height="40" decoding="async" draggable="false" />';
      var bubble = document.createElement("div");
      bubble.className = "tva-msg-bubble";
      bubble.textContent = text;
      div.appendChild(avatar);
      div.appendChild(bubble);
    } else {
      div.textContent = text;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function embedUsesAccordion(drawer) {
    return (
      !!drawer &&
      !!drawer.suggestionsPanel &&
      drawer.suggestionsPanel.classList.contains("tva-suggestions-panel--accordion")
    );
  }

  function embedPanelIsOpen(drawer) {
    return (
      embedUsesAccordion(drawer) &&
      drawer.suggestionsPanel.classList.contains("is-expanded")
    );
  }

  function collapseDrawerUi(drawer) {
    if (!drawer || !drawer.suggestionsPanel) {
      return;
    }
    if (embedUsesAccordion(drawer)) {
      drawer.suggestionsPanel.classList.remove("is-expanded");
      drawer.suggestionsPanel.setAttribute("aria-hidden", "true");
    } else {
      drawer.suggestionsPanel.hidden = true;
    }
    if (drawer.suggestionsToggle) {
      drawer.suggestionsToggle.setAttribute("aria-expanded", "false");
      drawer.suggestionsToggle.classList.remove("is-open");
    }
  }

  function updateDrawerHint(drawer) {
    if (!drawer || !drawer.suggestions) {
      return;
    }
    if (embedUsesAccordion(drawer)) {
      return;
    }
    if (!drawer.suggestionsDot) {
      return;
    }
    var collapsed = drawer.suggestionsPanel && drawer.suggestionsPanel.hidden;
    var hasContent =
      !drawer.suggestions.hidden &&
      ((drawer.quick && drawer.quick.children.length > 0) ||
        (drawer.drawerCtas && drawer.drawerCtas.children.length > 0));
    var showHint = hasContent && collapsed;
    drawer.suggestionsDot.hidden = !showHint;
    drawer.suggestions.classList.toggle("has-hint", showHint);
  }

  function collapseActionDrawer() {
    if (usesPanelAgentUi()) {
      if (els.suggestions) {
        els.suggestions.hidden = false;
      }
      if (els.suggestionsPanel) {
        els.suggestionsPanel.hidden = false;
      }
      updateActionDrawerHint();
      return;
    }
    collapseDrawerUi(els);
    updateActionDrawerHint();
  }

  function collapseEmbedActionDrawer() {
    collapseDrawerUi(elsEmbed);
    updateEmbedActionDrawerHint();
  }

  function updateActionDrawerHint() {
    updateDrawerHint(els);
  }

  function updateEmbedActionDrawerHint() {
    updateDrawerHint(elsEmbed);
  }

  function toggleSuggestionsDrawer(drawer, afterToggle) {
    if (!drawer || !drawer.suggestionsPanel || !drawer.suggestionsToggle) {
      return;
    }
    var open;
    if (embedUsesAccordion(drawer)) {
      open = !embedPanelIsOpen(drawer);
      drawer.suggestionsPanel.classList.toggle("is-expanded", open);
      drawer.suggestionsPanel.setAttribute("aria-hidden", open ? "false" : "true");
    } else {
      open = drawer.suggestionsPanel.hidden;
      drawer.suggestionsPanel.hidden = !open;
    }
    drawer.suggestionsToggle.setAttribute("aria-expanded", open ? "true" : "false");
    drawer.suggestionsToggle.classList.toggle("is-open", open);
    if (typeof afterToggle === "function") {
      afterToggle();
    }
  }

  function toggleSuggestions() {
    toggleSuggestionsDrawer(els, updateActionDrawerHint);
  }

  function toggleEmbedSuggestions() {
    toggleSuggestionsDrawer(elsEmbed, updateEmbedActionDrawerHint);
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
        if (container === elsEmbed.quick) {
          collapseEmbedActionDrawer();
        } else {
          collapseActionDrawer();
        }
      });
      container.appendChild(btn);
    });
  }

  var DRAWER_CTA_TYPES = { register: true, advisor: true };

  function splitCtas(ctas) {
    var drawer = [];
    var conversation = [];
    (ctas || []).forEach(function (cta) {
      if (!cta || cta.type === "lead") {
        return;
      }
      if (DRAWER_CTA_TYPES[cta.type]) {
        drawer.push(cta);
      } else {
        conversation.push(cta);
      }
    });
    return { drawer: drawer, conversation: conversation };
  }

  function renderCtaButtons(container, ctas, options) {
    container.innerHTML = "";
    var opts = options || {};
    ctas.forEach(function (cta) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = cta.label || "Continuar";
      if (cta.type === "register" || cta.type === "advisor") {
        btn.className = "tva-cta--secondary";
      }
      btn.addEventListener("click", function () {
        handleCta(cta);
        if (opts.collapseDrawer) {
          if (container === elsEmbed.drawerCtas) {
            collapseEmbedActionDrawer();
          } else {
            collapseActionDrawer();
          }
        }
      });
      container.appendChild(btn);
    });
    return ctas.length;
  }

  function syncActionDrawer(quickActions, ctas) {
    var onQuick = function (id, label) {
      if (isLabLanding()) {
        handleLabFloatQuick(id, label);
        return;
      }
      appendMessageAll("user", label);
      pushStoredMessage("user", label);
      sendToApi({ quick_action: id, message: label });
    };
    var onEmbedQuick = function (id, label) {
      if (isLabLanding() && embedEnabled()) {
        handleHeroEmbedQuick(id, label);
        return;
      }
      if (handleHeroEmbedQuick(id, label)) {
        return;
      }
      appendMessageAll("user", label);
      pushStoredMessage("user", label);
      sendToApi({ quick_action: id, message: label });
    };
    var split = splitCtas(ctas);
    var quickForEmbed =
      quickActions && quickActions.length ? quickActions : getHeroEmbedQuickDefaults();

    renderQuickActions(els.quick, quickActions, onQuick);
    if (elsEmbed.quick) {
      renderQuickActions(elsEmbed.quick, quickForEmbed, onEmbedQuick);
    }

    renderCtaButtons(els.drawerCtas, split.drawer, { collapseDrawer: true });
    if (elsEmbed.drawerCtas) {
      renderCtaButtons(elsEmbed.drawerCtas, split.drawer, { collapseDrawer: true });
    }

    var convCount = 0;
    if (els.conversationActions) {
      convCount = renderCtaButtons(els.conversationActions, split.conversation, {
        collapseDrawer: false,
      });
      els.conversationActions.hidden = convCount === 0;
    }
    if (elsEmbed.conversationActions) {
      var embedConvCount = renderCtaButtons(
        elsEmbed.conversationActions,
        split.conversation,
        { collapseDrawer: false },
      );
      elsEmbed.conversationActions.hidden = embedConvCount === 0;
    }

    var hasQuick = quickActions && quickActions.length > 0;
    var hasDrawer = hasQuick || split.drawer.length > 0;

    if (els.suggestions) {
      els.suggestions.hidden = !hasDrawer;
      if (!hasDrawer) {
        collapseActionDrawer();
      } else {
        collapseActionDrawer();
        updateActionDrawerHint();
      }
    }

    if (elsEmbed.suggestions) {
      var showEmbedDrawer = embedEnabled() && hasDrawer;
      elsEmbed.suggestions.hidden = !showEmbedDrawer;
      if (!showEmbedDrawer) {
        collapseEmbedActionDrawer();
      } else {
        collapseEmbedActionDrawer();
        updateEmbedActionDrawerHint();
      }
    }
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

  function isMobileViewport() {
    return window.matchMedia("(max-width: 640px)").matches;
  }

  /** En móvil el chat tapa el modal de compra (z-index mayor); cerrar antes del checkout. */
  function dismissChatForCheckout() {
    if (isMobileViewport() && state.open) {
      closePanel();
    }
  }

  function scrollToPageHash(hash) {
    if (!hash) {
      return false;
    }
    var id = hash.replace(/^#/, "");
    var target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    }
    return false;
  }

  function handleCta(cta) {
    if (!cta) {
      return;
    }
    if (cta.type === "pay") {
      dismissChatForCheckout();
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
      window.location.href = (API_BASE || "/") + "#calculadora";
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
    if (cta.hash === "#precios" || cta.hash === "#calculadora" || cta.type === "pay") {
      if (scrollToPageHash(cta.hash || "#calculadora")) {
        return;
      }
      window.location.href = (API_BASE || "/") + (cta.hash || "#calculadora");
      return;
    }
    if (cta.type === "lead") {
      sendToApi({ message: "Quiero dejar mis datos para comprar" });
    }
  }

  var HERO_EMBED_DEFAULT_QUICK = [
    { id: "own_number", label: "Número exclusivo" },
    { id: "quote", label: "Campañas SMS" },
    { id: "validate_account", label: "Validaciones SMS" },
    { id: "precios", label: "Ver precios" },
    { id: "try_agent", label: "Probar el agente" },
  ];

  var HERO_EMBED_QUICK = [
    { id: "own_number", label: "Quiero un número exclusivo" },
    { id: "validate_account", label: "Validar cuentas por SMS" },
    { id: "quote", label: "Operar campañas SMS" },
    { id: "receive_sms", label: "Recibir SMS de clientes" },
    { id: "how_it_works", label: "¿Cómo funciona?" },
    { id: "try_agent", label: "Probar el agente" },
  ];

  var LAB_FLOAT_WELCOME =
    "Hola, soy el Agente Especializado de Telvoice.\nPuedo ayudarte con campañas SMS, numeración exclusiva y validaciones por SMS.";

  var LAB_FLOAT_QUICK = [
    { id: "own_number", label: "Quiero un número exclusivo" },
    { id: "quote", label: "Operar campañas SMS" },
    { id: "validate_account", label: "Validar cuentas por SMS" },
    { id: "servicios", label: "Ver servicios Telvoice" },
    { id: "try_agent", label: "Probar el agente" },
  ];

  var LAB_HERO_LINK_KEY = "tva_lab_hero_link_v1";

  var HERO_EMBED_INTRO_LINES = [
    "Hola, soy el Agente Especializado de Telvoice.",
    "Puedo operar sobre un número exclusivo de tu empresa.",
    "Con ese número puedes enviar y recibir SMS sin usar el teléfono personal de un gerente.",
    "También puedo ayudarte a preparar campañas SMS, validar contactos y estimar consumo.",
    "Si necesitas validar cuentas, podemos trabajar con SMS y OTP autorizados sobre una numeración propia.",
    "La idea es simple: tu empresa tiene un canal SMS profesional, controlado y preparado para operar.",
    "¿Quieres conocer números exclusivos, campañas SMS o probar el agente?",
  ];

  var MAIN_HERO_EMBED_INTRO_LINES = [
    "Hola, soy el Agente comercial de Telvoice.",
    "Te ayudo a elegir bolsas SMS, estimar consumo y preparar campañas en Chile.",
    "Puedes comprar saldo online, revisar precios por volumen y resolver dudas de operación.",
    "¿Quieres ver precios, armar una campaña o probar cómo funciona?",
  ];

  var MAIN_HERO_EMBED_QUICK = [
    { id: "precios", label: "Ver precios SMS" },
    { id: "quote", label: "Armar una campaña" },
    { id: "how_it_works", label: "¿Cómo funciona?" },
    { id: "try_agent", label: "Probar el agente" },
  ];

  var HERO_QUICK_INTENT_MAP = {
    own_number: "numero_exclusivo",
    validate_account: "validar_cuentas",
    quote: "campanas_sms",
    receive_sms: "recibir_sms",
    how_it_works: "como_funciona",
    try_agent: "probar_agente",
    numero_validaciones: "validar_cuentas",
    numero_campanas: "campanas_sms",
    numero_interna: "numero_exclusivo",
    val_usuarios: "validar_cuentas",
    val_clientes: "validar_cuentas",
    val_plataformas: "validar_cuentas",
    val_telvoice: "default",
    recv_clientes: "recv_clientes",
    recv_internos: "recv_internos",
    camp_vol_1000: "camp_vol_1000",
    camp_vol_5000: "camp_vol_5000",
    camp_cotizar: "precios",
    precios: "precios",
    servicios: "servicios",
  };

  var heroEmbedState = {
    messages: [],
    drawerQuick: [],
    drawerCtas: [],
    lastIntent: null,
    presentationDone: false,
    mode: "presentation",
  };

  var heroEmbedSeedActive = false;
  var heroEmbedSeedTimers = [];
  var heroEmbedLoading = false;

  var state = {
    open: false,
    loading: false,
    welcomed: false,
    messages: [],
    drawerQuick: [],
    drawerCtas: [],
  };

  var els = {};
  var elsEmbed = {};

  function embedEnabled() {
    return !!elsEmbed.root;
  }

  function getEmbedSelector() {
    if (window.TELVOICE_WEB_AGENT_EMBED) {
      return window.TELVOICE_WEB_AGENT_EMBED;
    }
    var loaderScript = document.querySelector(
      'script[data-embed-target][src*="telvoice-web-agent-loader"]',
    );
    if (loaderScript) {
      var fromAttr = loaderScript.getAttribute("data-embed-target");
      if (fromAttr) {
        window.TELVOICE_WEB_AGENT_EMBED = fromAttr;
        return fromAttr;
      }
    }
    var target = document.getElementById("hero-agent-embed");
    if (target) {
      return "#hero-agent-embed";
    }
    return null;
  }

  function messageContainers() {
    var list = [];
    if (els.messages) {
      list.push(els.messages);
    }
    if (elsEmbed.messages) {
      list.push(elsEmbed.messages);
    }
    return list;
  }

  function appendMessageAll(role, text) {
    messageContainers().forEach(function (container) {
      appendMessage(container, role, text);
    });
  }

  function scrollMessagesToBottom() {
    messageContainers().forEach(function (container) {
      container.scrollTop = container.scrollHeight;
    });
  }

  function setSubmitDisabled(disabled) {
    [els.form, elsEmbed.form].forEach(function (form) {
      if (!form) {
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = disabled;
      }
    });
  }

  function removeTypingIndicators() {
    messageContainers().forEach(function (container) {
      container.querySelectorAll(".tva-msg--typing").forEach(function (node) {
        node.remove();
      });
    });
  }

  function labAgentFloatingPngUrl() {
    return asset("assets/telvoice-agent-floating-clean.png");
  }

  function labAgentFloatingWebpUrl() {
    return asset("assets/telvoice-agent-floating-clean.webp");
  }

  function labAgentProfilePngUrl() {
    return asset("assets/telvoice-agent-profile.png");
  }

  function labAgentProfileWebpUrl() {
    return asset("assets/telvoice-agent-profile.webp");
  }

  function labAgentAvatarPngUrl(context) {
    return context === "launcher"
      ? labAgentFloatingPngUrl()
      : labAgentProfilePngUrl();
  }

  function labAgentAvatarWebpUrl(context) {
    return context === "launcher"
      ? labAgentFloatingWebpUrl()
      : labAgentProfileWebpUrl();
  }

  function agentIsotipoUrl() {
    if (usesPanelAgentUi()) {
      return labAgentFloatingPngUrl();
    }
    return asset("public/telvoice-agent-isotipo.png");
  }

  function renderLabAgentAntennaGlowMarkup() {
    return '<span class="telvoice-agent-antenna-glow" role="status" aria-label="En línea"></span>';
  }

  function renderLabAgentImageMarkup(opts) {
    var context = (opts && opts.context) || "default";
    var withLife = context === "launcher";
    var cls =
      "telvoice-agent-avatar agent-live-motion telvoice-agent-avatar--" +
      context;
    var imgs =
      '<picture>' +
      '<source type="image/webp" srcset="' +
      escHtml(labAgentAvatarWebpUrl(context)) +
      '" />' +
      '<img class="telvoice-agent-avatar__img" src="' +
      escHtml(labAgentAvatarPngUrl(context)) +
      '" alt="" decoding="async" draggable="false" />' +
      "</picture>";
    var life = withLife ? renderLabAgentAntennaGlowMarkup() : "";

    return '<span class="' + cls + '">' + imgs + life + "</span>";
  }

  function mountLabAgentIsotipo(slot, opts) {
    if (!slot) {
      return;
    }
    if (typeof opts === "string") {
      opts = { context: opts };
    }
    slot.innerHTML = renderLabAgentImageMarkup(opts);
    slot.classList.add("tva-agent-iso-slot");
  }

  function initLabAgentIsotipos() {
    mountLabAgentIsotipo(document.getElementById("lab-phone-agent-iso"), {
      context: "phone",
    });
    mountLabAgentIsotipo(document.getElementById("hero-phone-agent-iso"), {
      context: "phone",
    });
    if (!usesPanelAgentUi()) {
      return;
    }
    mountLabAgentIsotipo(
      document.querySelector("#telvoice-web-agent .tva-launcher-iso"),
      { context: "launcher" },
    );
    mountLabAgentIsotipo(
      document.querySelector("#telvoice-web-agent .tva-header-iso"),
      { context: "header" },
    );
  }

  function submitUserMessage(text) {
    var clean = (text || "").trim();
    if (!clean || state.loading) {
      return;
    }
    if (isLabLanding()) {
      appendFloatMessage("user", clean);
      sendToApiLab({ message: clean });
      return;
    }
    appendMessageAll("user", clean);
    pushStoredMessage("user", clean);
    sendToApi({ message: clean });
  }

  function submitHeroEmbedMessage(text) {
    var clean = (text || "").trim();
    if (!clean || heroEmbedLoading) {
      return;
    }
    if (heroEmbedSeedActive) {
      cancelHeroEmbedSeed();
    }
    heroEmbedState.mode = "interaction";
    appendHeroEmbedUser(clean);
    sendToApiForEmbed({ message: clean });
  }

  function bindChatForm(form, input, onSubmit) {
    if (!form || !input) {
      return;
    }
    var handler = onSubmit || submitUserMessage;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = (input.value || "").trim();
      if (!text) {
        return;
      }
      if (handler === submitUserMessage && state.loading) {
        return;
      }
      if (handler === submitHeroEmbedMessage && heroEmbedLoading) {
        return;
      }
      input.value = "";
      handler(text);
    });
  }

  function isLabLanding() {
    return /landing-agent-lab/.test(window.location.pathname || "");
  }

  function hasHeroEmbedSlot() {
    return !!document.getElementById("hero-agent-embed");
  }

  function usesPanelAgentUi() {
    return (
      isLabLanding() ||
      hasHeroEmbedSlot() ||
      window.TELVOICE_WEB_AGENT_PANEL_UI === true
    );
  }

  function usesAgentAvatarIn(container) {
    if (!container) {
      return false;
    }
    if (container.id === "tva-embed-messages") {
      return true;
    }
    return container.id === "tva-messages" && usesPanelAgentUi();
  }

  function getHeroEmbedIntroLines() {
    return isLabLanding() ? HERO_EMBED_INTRO_LINES : MAIN_HERO_EMBED_INTRO_LINES;
  }

  function getHeroEmbedQuickDefaults() {
    return isLabLanding() ? HERO_EMBED_QUICK : MAIN_HERO_EMBED_QUICK;
  }

  function expandEmbedSuggestions() {
    if (!elsEmbed.suggestionsPanel || !elsEmbed.suggestionsToggle) {
      return;
    }
    elsEmbed.suggestionsPanel.classList.add("is-expanded");
    elsEmbed.suggestionsPanel.setAttribute("aria-hidden", "false");
    elsEmbed.suggestionsToggle.setAttribute("aria-expanded", "true");
    elsEmbed.suggestionsToggle.classList.add("is-open");
  }

  function normalizeHeroText(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function detectHeroIntent(text, quickId) {
    if (quickId && HERO_QUICK_INTENT_MAP[quickId]) {
      return HERO_QUICK_INTENT_MAP[quickId];
    }
    var t = normalizeHeroText(text);
    if (!t) {
      return "default";
    }
    if (/precio|precios|bolsa|saldo|comprar|costo/.test(t)) {
      return "precios";
    }
    if (/validar|validacion|validaciones|otp|cuentas|codigo|verificar/.test(t)) {
      return "validar_cuentas";
    }
    if (/campana|campanas|masivo|csv|promocion|promociones|base/.test(t)) {
      return "campanas_sms";
    }
    if (/recibir|respuesta|respuestas|entrante|inbound|cliente responde/.test(t)) {
      return "recibir_sms";
    }
    if (/probar|demo|panel|entrar/.test(t) && /agente/.test(t)) {
      return "probar_agente";
    }
    if (/probar|demo|panel/.test(t)) {
      return "probar_agente";
    }
    if (/como funciona|cómo funciona|funciona/.test(t)) {
      return "como_funciona";
    }
    if (/servicio|servicios/.test(t)) {
      return "servicios";
    }
    if (/numero|exclusiv|propio|dedicado|linea|sim/.test(t)) {
      return "numero_exclusivo";
    }
    if (/agente/.test(t)) {
      return "probar_agente";
    }
    return "default";
  }

  function getHeroIntentResponse(intent, userText) {
    if (intent === "camp_vol_1000") {
      return {
        replies: [
          "Con 1.000 SMS puedes arrancar campañas de recordatorio, promoción o aviso operativo. El agente te ayuda a validar contactos y estimar consumo antes de enviar.",
        ],
        quick: HERO_EMBED_QUICK,
        ctas: [{ hash: "#precios", label: "Ver bolsas SMS", type: "pay" }],
      };
    }
    if (intent === "camp_vol_5000") {
      return {
        replies: [
          "Con 5.000 SMS ya puedes operar campañas recurrentes con más margen de prueba y segmentación. Telvoice valida contactos y confirma antes de debitar saldo.",
        ],
        quick: HERO_EMBED_QUICK,
        ctas: [{ hash: "#precios", label: "Ver bolsas SMS", type: "pay" }],
      };
    }
    if (intent === "recv_clientes") {
      return {
        replies: [
          "Recibir respuestas de clientes en un número Telvoice te permite centralizar gestión comercial y soporte sin mezclar conversaciones en celulares personales.",
        ],
        quick: HERO_EMBED_QUICK,
        ctas: [{ hash: "#numeracion", label: "Ver numeración Telvoice", type: "pay" }],
      };
    }
    if (intent === "recv_internos") {
      return {
        replies: [
          "Para mensajes internos, una numeración dedicada separa comunicación operativa del tráfico comercial y mantiene trazabilidad empresarial.",
        ],
        quick: HERO_EMBED_QUICK,
        ctas: [],
      };
    }
    var t = normalizeHeroText(userText);
    if (intent === "val_usuarios" || (intent === "validar_cuentas" && /usuario/.test(t))) {
      return {
        replies: [
          "Para validar usuarios, una numeración propia Telvoice permite enviar o recibir códigos SMS autorizados con trazabilidad empresarial.",
          "¿Quieres estimar volumen o revisar cómo integrarlo a tu operación?",
        ],
        quick: HERO_EMBED_QUICK,
        ctas: [{ hash: "#numeracion", label: "Ver numeración Telvoice", type: "pay" }],
      };
    }
    if (intent === "numero_exclusivo") {
      return {
        replies: [
          "Un número exclusivo Telvoice permite que tu empresa tenga una identidad SMS propia. Puedes usarlo para enviar y recibir mensajes, validar cuentas, centralizar comunicaciones y evitar usar el número personal de un gerente.",
          "¿Lo quieres para validaciones, campañas o comunicación interna?",
        ],
        quick: [
          { id: "numero_validaciones", label: "Validaciones" },
          { id: "numero_campanas", label: "Campañas SMS" },
          { id: "numero_interna", label: "Comunicación interna" },
          { id: "try_agent", label: "Probar el agente" },
        ],
        ctas: [],
      };
    }
    if (intent === "validar_cuentas") {
      return {
        replies: [
          "Perfecto. Para validaciones, lo ideal es usar una numeración propia Telvoice. Así tu empresa puede enviar o recibir códigos SMS sin depender de un número personal.",
          "Telvoice puede ayudarte con validaciones SMS autorizadas usando numeración propia. Es útil para cuentas, accesos, confirmaciones y procesos donde necesitas un canal controlado por tu empresa.",
          "¿Buscas validar usuarios, recibir OTP o enviar códigos propios?",
        ],
        quick: [
          { id: "val_usuarios", label: "Usuarios" },
          { id: "val_clientes", label: "Clientes" },
          { id: "val_plataformas", label: "Plataformas internas" },
          { id: "val_telvoice", label: "Hablar con Telvoice" },
        ],
        ctas: [],
      };
    }
    if (intent === "campanas_sms") {
      return {
        replies: [
          "Para campañas SMS, Telvoice permite comprar saldo, preparar una base CSV, validar contactos, estimar segmentos y confirmar antes de enviar. Es ideal para promociones, recordatorios y notificaciones.",
          "¿Cuántos SMS estimas enviar en tu primera campaña?",
        ],
        quick: [
          { id: "camp_vol_1000", label: "Hasta 1.000 SMS" },
          { id: "camp_vol_5000", label: "Hasta 5.000 SMS" },
          { id: "camp_cotizar", label: "Cotizar volumen" },
          { id: "try_agent", label: "Probar el agente" },
        ],
        ctas: [{ hash: "#precios", label: "Ver bolsas SMS", type: "pay" }],
      };
    }
    if (intent === "recibir_sms") {
      return {
        replies: [
          "Con numeración propia, tu empresa puede recibir respuestas SMS y usarlas para gestión comercial, soporte, confirmaciones o procesos internos. La clave es centralizar esas respuestas en un canal empresarial, no en un teléfono personal.",
          "¿Quieres recibir respuestas de clientes o mensajes internos de tu equipo?",
        ],
        quick: [
          { id: "recv_clientes", label: "Respuestas de clientes" },
          { id: "recv_internos", label: "Mensajes internos" },
          { id: "own_number", label: "Número exclusivo" },
          { id: "try_agent", label: "Probar el agente" },
        ],
        ctas: [],
      };
    }
    if (intent === "probar_agente") {
      return {
        replies: [
          "Puedes probar el agente desde el panel Telvoice. Ahí la experiencia está conectada a tu cuenta para cotizar, comprar saldo, preparar campañas y revisar estados.",
        ],
        quick: HERO_EMBED_QUICK,
        ctas: [
          {
            type: "register",
            label: "Probar el agente",
            url: "https://agent.telvoice.cl/login",
          },
        ],
      };
    }
    if (intent === "precios") {
      return {
        replies: [
          "Puedes comenzar comprando una bolsa SMS y luego usar el agente para calcular consumo según tu campaña. Para volúmenes mayores, Telvoice puede orientar una configuración más empresarial.",
        ],
        quick: HERO_EMBED_QUICK,
        ctas: [{ hash: "#precios", label: "Ver bolsas SMS", type: "pay" }],
      };
    }
    if (intent === "servicios") {
      return {
        replies: [
          "Telvoice cubre numeración exclusiva, campañas SMS, validaciones autorizadas y operación asistida desde el panel. Puedo orientarte según tu caso de uso.",
        ],
        quick: LAB_FLOAT_QUICK,
        ctas: [{ hash: "#servicios", label: "Ver servicios Telvoice", type: "pay" }],
      };
    }
    if (intent === "como_funciona") {
      return {
        replies: [
          "Telvoice combina tres líneas: un número SMS exclusivo para tu empresa, campañas con validación previa y validaciones autorizadas sobre numeración propia.",
          "El agente te ayuda a cotizar, preparar envíos y operar con confirmación explícita antes de debitar saldo.",
          "¿Qué quieres revisar primero?",
        ],
        quick: [
          { id: "own_number", label: "Número exclusivo" },
          { id: "quote", label: "Campañas SMS" },
          { id: "validate_account", label: "Validaciones" },
          { id: "try_agent", label: "Probar el agente" },
        ],
        ctas: [],
      };
    }
    return {
      replies: [
        "Puedo ayudarte en tres caminos: activar un número exclusivo para tu empresa, operar campañas SMS o revisar validaciones autorizadas por SMS. ¿Cuál quieres explorar primero?",
      ],
      quick: HERO_EMBED_DEFAULT_QUICK,
      ctas: [],
    };
  }

  function renderHeroEmbedMessages() {
    if (!elsEmbed.messages) {
      return;
    }
    elsEmbed.messages.innerHTML = "";
    heroEmbedState.messages.forEach(function (msg) {
      if (msg && msg.text) {
        appendMessage(
          elsEmbed.messages,
          msg.role === "user" ? "user" : "bot",
          msg.text,
        );
      }
    });
    scrollHeroEmbedToBottom();
  }

  function scrollHeroEmbedToBottom() {
    if (elsEmbed.messages) {
      elsEmbed.messages.scrollTop = elsEmbed.messages.scrollHeight;
    }
  }

  function appendHeroEmbedUser(text) {
    heroEmbedState.messages.push({ role: "user", text: text });
    if (elsEmbed.messages) {
      appendMessage(elsEmbed.messages, "user", text);
      scrollHeroEmbedToBottom();
    }
    persistHeroEmbedState();
  }

  function appendHeroEmbedBot(text, animated) {
    heroEmbedState.messages.push({ role: "bot", text: text });
    if (elsEmbed.messages) {
      var div = appendMessage(elsEmbed.messages, "bot", text);
      if (animated && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        div.classList.add("tva-msg--enter");
      }
      scrollHeroEmbedToBottom();
    }
    persistHeroEmbedState();
  }

  function setHeroEmbedSubmitDisabled(disabled) {
    if (!elsEmbed.form) {
      return;
    }
    var btn = elsEmbed.form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = disabled;
    }
    if (elsEmbed.input) {
      elsEmbed.input.disabled = disabled;
    }
  }

  function filterRegisterAdvisorCtas(ctas) {
    return (ctas || []).filter(function (cta) {
      return cta && cta.type !== "register" && cta.type !== "advisor";
    });
  }

  function syncHeroEmbedDrawer(quickActions, ctas) {
    heroEmbedState.drawerQuick =
      quickActions && quickActions.length ? quickActions : getHeroEmbedQuickDefaults();
    heroEmbedState.drawerCtas = filterRegisterAdvisorCtas(ctas);
    if (!elsEmbed.quick) {
      return;
    }
    renderQuickActions(elsEmbed.quick, heroEmbedState.drawerQuick, function (id, label) {
      handleHeroEmbedQuick(id, label);
    });
    if (elsEmbed.drawerCtas) {
      renderCtaButtons(elsEmbed.drawerCtas, heroEmbedState.drawerCtas, {
        collapseDrawer: true,
      });
    }
    if (elsEmbed.conversationActions) {
      var embedConvCount = renderCtaButtons(
        elsEmbed.conversationActions,
        heroEmbedState.drawerCtas,
        { collapseDrawer: false },
      );
      elsEmbed.conversationActions.hidden = embedConvCount === 0;
    }
    if (elsEmbed.suggestions) {
      elsEmbed.suggestions.hidden = false;
      updateEmbedActionDrawerHint();
    }
    persistHeroEmbedState();
  }

  function deliverHeroEmbedReplies(replies, quick, ctas, index) {
    index = index || 0;
    if (!replies || index >= replies.length) {
      syncHeroEmbedDrawer(quick || getHeroEmbedQuickDefaults(), ctas || []);
      expandEmbedSuggestions();
      persistHeroEmbedState();
      return;
    }
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var typingMs = reduced ? 0 : 360;
    var gapMs = reduced ? 0 : index === 0 ? 0 : 420;
    window.setTimeout(function () {
      if (typingMs > 0 && index === 0) {
        showEmbedTyping();
      }
      window.setTimeout(function () {
        hideEmbedTyping();
        appendHeroEmbedBot(replies[index], true);
        heroEmbedState.lastIntent = heroEmbedState.lastIntent;
        if (index + 1 < replies.length) {
          deliverHeroEmbedReplies(replies, quick, ctas, index + 1);
        } else {
          syncHeroEmbedDrawer(quick || getHeroEmbedQuickDefaults(), ctas || []);
          expandEmbedSuggestions();
          persistHeroEmbedState();
        }
      }, typingMs);
    }, gapMs);
  }

  function respondHeroEmbedLocally(intent, userText) {
    heroEmbedState.mode = "interaction";
    heroEmbedState.lastIntent = intent;
    var resp = getHeroIntentResponse(intent, userText);
    deliverHeroEmbedReplies(resp.replies, resp.quick, resp.ctas);
  }

  function isLocalDevHost() {
    return /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname || "");
  }

  function sendToApiForEmbed(payload) {
    if (heroEmbedLoading) {
      return;
    }
    heroEmbedLoading = true;
    setHeroEmbedSubmitDisabled(true);
    showEmbedTyping();

    if (isLabLanding() && isLocalDevHost()) {
      window.setTimeout(function () {
        hideEmbedTyping();
        var intent = detectHeroIntent(
          payload.message || "",
          payload.quick_action || null,
        );
        respondHeroEmbedLocally(intent, payload.message || "");
        heroEmbedLoading = false;
        setHeroEmbedSubmitDisabled(false);
      }, 420);
      return;
    }

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
            throw new Error("invalid");
          }
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "unavailable");
          }
          return data;
        });
      })
      .then(function (data) {
        hideEmbedTyping();
        heroEmbedState.mode = "interaction";
        if (data.session_id || data.session_token) {
          setSessionId(data.session_id || data.session_token);
        }
        if (data.reply) {
          appendHeroEmbedBot(data.reply, true);
        }
        syncHeroEmbedDrawer(
          data.quick_actions || heroEmbedState.drawerQuick,
          data.ctas || heroEmbedState.drawerCtas,
        );
        expandEmbedSuggestions();
      })
      .catch(function () {
        hideEmbedTyping();
        var intent = detectHeroIntent(
          payload.message || "",
          payload.quick_action || null,
        );
        respondHeroEmbedLocally(intent, payload.message || "");
      })
      .finally(function () {
        heroEmbedLoading = false;
        setHeroEmbedSubmitDisabled(false);
      });
  }
  function showEmbedTyping() {
    if (!elsEmbed.messages) {
      return;
    }
    var typing = appendMessage(elsEmbed.messages, "bot", "Escribiendo…");
    typing.classList.add("tva-msg--typing");
    scrollHeroEmbedToBottom();
  }

  function hideEmbedTyping() {
    if (!elsEmbed.messages) {
      return;
    }
    elsEmbed.messages.querySelectorAll(".tva-msg--typing").forEach(function (node) {
      node.remove();
    });
  }

  function scheduleHeroEmbedSeed(fn, delayMs) {
    var id = window.setTimeout(fn, delayMs);
    heroEmbedSeedTimers.push(id);
    return id;
  }

  function cancelHeroEmbedSeed() {
    if (!heroEmbedSeedActive) {
      return;
    }
    heroEmbedSeedActive = false;
    heroEmbedSeedTimers.forEach(function (id) {
      window.clearTimeout(id);
    });
    heroEmbedSeedTimers = [];
    hideEmbedTyping();
  }

  function finishHeroEmbedSeed() {
    heroEmbedSeedTimers.forEach(function (id) {
      window.clearTimeout(id);
    });
    heroEmbedSeedTimers = [];
    heroEmbedSeedActive = false;
    heroEmbedState.presentationDone = true;
    heroEmbedState.mode = "interaction";
    hideEmbedTyping();
    syncHeroEmbedDrawer(getHeroEmbedQuickDefaults(), []);
    expandEmbedSuggestions();
    persistHeroEmbedState();
  }

  function handleHeroEmbedQuick(id, label) {
    if (!embedEnabled()) {
      return false;
    }
    cancelHeroEmbedSeed();
    heroEmbedState.mode = "interaction";
    appendHeroEmbedUser(label);
    if (id === "try_agent") {
      respondHeroEmbedLocally("probar_agente", label);
      return true;
    }
    if (id === "val_telvoice") {
      window.open("https://agent.telvoice.cl/login", "_blank", "noopener,noreferrer");
      return true;
    }
    if (id === "servicios") {
      respondHeroEmbedLocally("servicios", label);
      window.location.hash = "#servicios";
      return true;
    }
    sendToApiForEmbed({ quick_action: id, message: label });
    return true;
  }

  function seedHeroEmbedConversation() {
    cancelHeroEmbedSeed();
    heroEmbedState.messages = [];
    heroEmbedState.drawerQuick = [];
    heroEmbedState.drawerCtas = [];
    heroEmbedState.presentationDone = false;
    heroEmbedState.mode = "presentation";
    heroEmbedState.lastIntent = null;
    if (elsEmbed.messages) {
      elsEmbed.messages.innerHTML = "";
    }
    if (elsEmbed.conversationActions) {
      elsEmbed.conversationActions.hidden = true;
      elsEmbed.conversationActions.innerHTML = "";
    }
    if (elsEmbed.quick) {
      elsEmbed.quick.innerHTML = "";
    }
    if (elsEmbed.drawerCtas) {
      elsEmbed.drawerCtas.innerHTML = "";
    }
    collapseEmbedActionDrawer();
    renderHeroEmbedMessages();
    heroEmbedSeedActive = true;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var typingMs = reduced ? 0 : 400;
    var pauseMs = reduced ? 0 : 2800;
    var index = 0;

    function deliverNext() {
      if (!heroEmbedSeedActive) {
        return;
      }
      if (index >= getHeroEmbedIntroLines().length) {
        finishHeroEmbedSeed();
        return;
      }
      if (typingMs > 0) {
        showEmbedTyping();
      }
      scheduleHeroEmbedSeed(function () {
        if (!heroEmbedSeedActive) {
          return;
        }
        hideEmbedTyping();
        appendHeroEmbedBot(getHeroEmbedIntroLines()[index], true);
        index += 1;
        if (index >= getHeroEmbedIntroLines().length) {
          finishHeroEmbedSeed();
          return;
        }
        scheduleHeroEmbedSeed(deliverNext, pauseMs);
      }, typingMs);
    }

    deliverNext();
  }

  function resetHeroAgentDemo() {
    if (!embedEnabled()) {
      return;
    }
    clearLegacyHeroEmbedStorage();
    var store = heroEmbedStorage();
    if (store) {
      try {
        store.removeItem(HERO_EMBED_STATE_KEY);
      } catch (e) {
        /* ignore */
      }
    }
    cancelHeroEmbedSeed();
    heroEmbedLoading = false;
    setHeroEmbedSubmitDisabled(false);
    heroEmbedState.messages = [];
    heroEmbedState.drawerQuick = [];
    heroEmbedState.drawerCtas = [];
    heroEmbedState.lastIntent = null;
    heroEmbedState.presentationDone = false;
    heroEmbedState.mode = "presentation";
    if (elsEmbed.messages) {
      elsEmbed.messages.innerHTML = "";
    }
    if (elsEmbed.conversationActions) {
      elsEmbed.conversationActions.hidden = true;
      elsEmbed.conversationActions.innerHTML = "";
    }
    if (elsEmbed.quick) {
      elsEmbed.quick.innerHTML = "";
    }
    if (elsEmbed.drawerCtas) {
      elsEmbed.drawerCtas.innerHTML = "";
    }
    collapseEmbedActionDrawer();
  }

  function startHeroAgentPresentation() {
    if (!embedEnabled()) {
      return;
    }
    resetHeroAgentDemo();
    seedHeroEmbedConversation();
  }

  function appendFloatMessage(role, text, animated) {
    state.messages.push({ role: role, text: text });
    if (els.messages) {
      var div = appendMessage(els.messages, role, text);
      if (animated && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        div.classList.add("tva-msg--enter");
      }
      scrollFloatToBottom();
    }
    persistChatState();
  }

  function scrollFloatToBottom() {
    if (els.messages) {
      els.messages.scrollTop = els.messages.scrollHeight;
    }
  }

  function showFloatTyping() {
    if (!els.messages) {
      return;
    }
    hideFloatTyping();
    var typing = appendMessage(els.messages, "bot", "Escribiendo…");
    typing.classList.add("tva-msg--typing");
    scrollFloatToBottom();
  }

  function hideFloatTyping() {
    if (!els.messages) {
      return;
    }
    els.messages.querySelectorAll(".tva-msg--typing").forEach(function (node) {
      node.remove();
    });
  }

  function deliverLabFloatReplies(replies, quick, ctas, index) {
    index = index || 0;
    if (!replies || index >= replies.length) {
      state.drawerQuick = quick || LAB_FLOAT_QUICK;
      state.drawerCtas = ctas || [];
      syncActionDrawer(state.drawerQuick, state.drawerCtas);
      if (els.suggestions) {
        els.suggestions.hidden = false;
        collapseActionDrawer();
        updateActionDrawerHint();
      }
      persistChatState();
      return;
    }
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var typingMs = reduced ? 0 : index === 0 ? 320 : 0;
    var gapMs = reduced ? 0 : index === 0 ? 0 : 380;
    window.setTimeout(function () {
      if (typingMs > 0) {
        showFloatTyping();
      }
      window.setTimeout(function () {
        hideFloatTyping();
        appendFloatMessage("bot", replies[index], true);
        if (index + 1 < replies.length) {
          deliverLabFloatReplies(replies, quick, ctas, index + 1);
        } else {
          deliverLabFloatReplies(replies, quick, ctas, replies.length);
        }
      }, typingMs);
    }, gapMs);
  }

  function respondLabFloatLocally(intent, userText) {
    var resp = getHeroIntentResponse(intent, userText);
    deliverLabFloatReplies(resp.replies, resp.quick, resp.ctas);
  }

  function welcomeLabFloatPanel() {
    appendFloatMessage("bot", LAB_FLOAT_WELCOME, true);
    state.drawerQuick = LAB_FLOAT_QUICK;
    syncActionDrawer(LAB_FLOAT_QUICK, []);
    persistChatState();
  }

  function handleLabFloatQuick(id, label) {
    appendFloatMessage("user", label);
    if (id === "try_agent") {
      respondLabFloatLocally("probar_agente", label);
      return;
    }
    if (id === "servicios") {
      respondLabFloatLocally("servicios", label);
      window.location.hash = "#servicios";
      return;
    }
    if (id === "val_telvoice") {
      window.open("https://agent.telvoice.cl/login", "_blank", "noopener,noreferrer");
      return;
    }
    sendToApiLab({ quick_action: id, message: label });
  }

  function setFloatSubmitDisabled(disabled) {
    if (!els.form) {
      return;
    }
    var btn = els.form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = disabled;
    }
    if (els.input) {
      els.input.disabled = disabled;
    }
  }

  function sendToApiLab(payload) {
    if (state.loading) {
      return;
    }
    state.loading = true;
    setFloatSubmitDisabled(true);
    showFloatTyping();

    function finishLocal(intent) {
      hideFloatTyping();
      respondLabFloatLocally(intent, payload.message || "");
      state.loading = false;
      setFloatSubmitDisabled(false);
    }

    if (isLocalDevHost()) {
      window.setTimeout(function () {
        finishLocal(
          detectHeroIntent(payload.message || "", payload.quick_action || null),
        );
      }, 420);
      return;
    }

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
            throw new Error("invalid");
          }
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "error");
          }
          return data;
        });
      })
      .then(function (data) {
        hideFloatTyping();
        if (data.reply) {
          appendFloatMessage("bot", data.reply, true);
        }
        if (data.quick_actions) {
          state.drawerQuick = data.quick_actions;
        }
        if (data.ctas !== undefined) {
          state.drawerCtas = data.ctas;
        }
        syncActionDrawer(state.drawerQuick, state.drawerCtas);
        persistChatState();
        scrollFloatToBottom();
      })
      .catch(function () {
        finishLocal(
          detectHeroIntent(payload.message || "", payload.quick_action || null),
        );
      })
      .finally(function () {
        state.loading = false;
        setFloatSubmitDisabled(false);
      });
  }

  function initLabHeroConnection() {
    if (!isLabLanding() || !embedEnabled()) {
      return;
    }
    var hero = document.querySelector(".lab-hero--phone-lead");
    var floatRoot = document.getElementById("telvoice-web-agent");
    if (!hero || !floatRoot) {
      return;
    }

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var seen = false;
    try {
      seen = sessionStorage.getItem(LAB_HERO_LINK_KEY) === "1";
    } catch (e) {
      seen = false;
    }

    if (reduced || seen) {
      hero.classList.add("lab-hero--agent-ready");
      floatRoot.classList.add("tva-root--lab-ready");
      return;
    }

    try {
      sessionStorage.setItem(LAB_HERO_LINK_KEY, "1");
    } catch (e) {
      /* ignore */
    }

    window.requestAnimationFrame(function () {
      hero.classList.add("lab-hero--agent-linking");
      floatRoot.classList.add("tva-root--lab-enter");
      window.setTimeout(function () {
        hero.classList.add("lab-hero--agent-ready");
        hero.classList.remove("lab-hero--agent-linking");
        floatRoot.classList.add("tva-root--lab-ready");
        floatRoot.classList.remove("tva-root--lab-enter");
      }, 1350);
    });
  }

  function buildUi() {
    var iso = agentIsotipoUrl();
    var lab = usesPanelAgentUi();
    var root = document.createElement("div");
    root.className = lab ? "tva-root tva-root--lab" : "tva-root";
    root.id = "telvoice-web-agent";
    var headerHtml = lab
      ? '<div class="tva-header tva-header--lab">' +
        '<div class="tva-header-brand">' +
        '<span class="tva-header-iso" aria-hidden="true"></span>' +
        '<div class="tva-header-text"><h2 id="tva-title">Agente Telvoice</h2>' +
        '<p class="tva-header-role">Especialista comercial</p></div></div>' +
        '<span class="tva-header-status">En línea</span>' +
        '<button type="button" class="tva-close" aria-label="Cerrar chat"><span aria-hidden="true">×</span></button></div>'
      : '<div class="tva-header">' +
        '<img src="' +
        escHtml(iso) +
        '" alt="" width="40" height="40" decoding="async" data-tva-iso="1" />' +
        '<div class="tva-header-text"><h2 id="tva-title">Agente comercial Telvoice</h2><p>Cotiza SMS para Chile</p></div>' +
        '<button type="button" class="tva-close" aria-label="Cerrar chat"><span aria-hidden="true">×</span></button></div>';
    var inputPlaceholder = lab
      ? "Consulta sobre numeración, campañas o validaciones…"
      : "Escribe tu mensaje…";
    var suggestionsHtml = lab
      ? '<div class="tva-suggestions" id="tva-suggestions">' +
        '<div class="tva-suggestions-panel" id="tva-suggestions-panel">' +
        '<div class="tva-quick" id="tva-quick"></div>' +
        '<div class="tva-drawer-ctas" id="tva-drawer-ctas"></div>' +
        "</div></div>"
      : '<div class="tva-suggestions" id="tva-suggestions" hidden>' +
        '<button type="button" class="tva-suggestions-toggle" id="tva-suggestions-toggle" aria-expanded="false" aria-controls="tva-suggestions-panel" aria-label="Ver sugerencias y acciones">' +
        '<span class="tva-suggestions-chevron" aria-hidden="true"></span>' +
        '<span class="tva-suggestions-dot" aria-hidden="true"></span>' +
        "</button>" +
        '<div class="tva-suggestions-panel" id="tva-suggestions-panel" hidden>' +
        '<div class="tva-quick" id="tva-quick"></div>' +
        '<div class="tva-drawer-ctas" id="tva-drawer-ctas"></div>' +
        "</div></div>";
    root.innerHTML =
      '<div class="tva-launcher-wrap">' +
      '<button type="button" class="tva-launcher" aria-expanded="false" aria-controls="tva-panel" aria-label="Abrir agente comercial Telvoice">' +
      (lab
        ? '<span class="tva-launcher-iso" aria-hidden="true"></span>'
        : '<img src="' +
          escHtml(iso) +
          '" alt="" width="48" height="48" decoding="async" data-tva-iso="1" />') +
      (lab ? "" : '<span class="tva-launcher-online" aria-hidden="true" title="En línea"></span>') +
      "</button></div>" +
      '<div id="tva-panel" class="tva-panel' +
      (lab ? " tva-panel--lab" : "") +
      '" role="dialog" aria-labelledby="tva-title" aria-modal="true">' +
      headerHtml +
      suggestionsHtml +
      '<div class="tva-messages" id="tva-messages" aria-live="polite"></div>' +
      '<div class="tva-conversation-actions" id="tva-conversation-actions" hidden></div>' +
      '<form class="tva-form" id="tva-form">' +
      '<input type="text" id="tva-input" placeholder="' +
      escHtml(inputPlaceholder) +
      '" autocomplete="off" maxlength="2000" />' +
      '<button type="submit">Enviar</button>' +
      "</form>" +
      "</div>";

    document.body.appendChild(root);

    root.querySelectorAll("[data-tva-iso]").forEach(function (img) {
      img.addEventListener("error", function () {
        if (img.dataset.fallback) return;
        img.dataset.fallback = "1";
        img.src = isLabLanding()
          ? labAgentProfilePngUrl()
          : asset("assets/telvoice-agent-isotipo.png");
      });
    });

    els.root = root;
    els.launcher = qs(".tva-launcher", root);
    els.panel = qs(".tva-panel", root);
    els.messages = qs("#tva-messages", root);
    els.suggestions = qs("#tva-suggestions", root);
    els.suggestionsToggle = qs("#tva-suggestions-toggle", root);
    els.suggestionsPanel = qs("#tva-suggestions-panel", root);
    els.suggestionsDot = qs(".tva-suggestions-dot", root);
    els.quick = qs("#tva-quick", root);
    els.drawerCtas = qs("#tva-drawer-ctas", root);
    els.conversationActions = qs("#tva-conversation-actions", root);
    els.form = qs("#tva-form", root);
    els.input = qs("#tva-input", root);
    els.close = qs(".tva-close", root);

    els.launcher.addEventListener("click", togglePanel);
    els.close.addEventListener("click", closePanel);
    if (els.suggestionsToggle) {
      els.suggestionsToggle.addEventListener("click", toggleSuggestions);
    }
    if (els.input) {
      els.input.addEventListener("focus", function () {
        setTimeout(syncMobileViewport, 80);
        setTimeout(syncMobileViewport, 320);
      });
    }

    bindChatForm(els.form, els.input);
    bindChatViewportLock();
  }

  function buildEmbedUi(targetSelector) {
    var target = document.querySelector(targetSelector);
    if (!target || document.getElementById("telvoice-web-agent-embed")) {
      return;
    }

    var embedRoot = document.createElement("div");
    embedRoot.className =
      "tva-root tva-root--embedded tva-root--hero-embed tva-root--lab tva-root--inline-open";
    embedRoot.id = "telvoice-web-agent-embed";
    embedRoot.innerHTML =
      '<div class="tva-panel tva-panel--inline is-open" role="region" aria-label="Agente comercial Telvoice">' +
      '<div class="tva-suggestions" id="tva-embed-suggestions">' +
      '<button type="button" class="tva-suggestions-toggle" id="tva-embed-suggestions-toggle" aria-expanded="false" aria-controls="tva-embed-suggestions-panel" aria-label="Ver sugerencias y acciones">' +
      '<span class="tva-suggestions-chevron" aria-hidden="true"></span>' +
      '<span class="tva-suggestions-toggle-text">Sugerencias</span>' +
      "</button>" +
      '<div class="tva-suggestions-panel tva-suggestions-panel--accordion" id="tva-embed-suggestions-panel" aria-hidden="true">' +
      '<div class="tva-quick" id="tva-embed-quick"></div>' +
      '<div class="tva-drawer-ctas" id="tva-embed-drawer-ctas"></div>' +
      "</div></div>" +
      '<div class="tva-messages" id="tva-embed-messages" aria-live="polite"></div>' +
      '<div class="tva-conversation-actions" id="tva-embed-conversation-actions" hidden></div>' +
      '<form class="tva-form" id="tva-embed-form">' +
      '<input type="text" id="tva-embed-input" placeholder="Escribe tu mensaje…" autocomplete="off" maxlength="2000" />' +
      '<button type="submit">Enviar</button>' +
      "</form></div>";

    target.appendChild(embedRoot);

    elsEmbed.root = embedRoot;
    elsEmbed.panel = qs(".tva-panel", embedRoot);
    elsEmbed.messages = qs("#tva-embed-messages", embedRoot);
    elsEmbed.suggestions = qs("#tva-embed-suggestions", embedRoot);
    elsEmbed.suggestionsToggle = qs("#tva-embed-suggestions-toggle", embedRoot);
    elsEmbed.suggestionsPanel = qs("#tva-embed-suggestions-panel", embedRoot);
    elsEmbed.suggestionsDot = null;
    elsEmbed.quick = qs("#tva-embed-quick", embedRoot);
    elsEmbed.drawerCtas = qs("#tva-embed-drawer-ctas", embedRoot);
    elsEmbed.conversationActions = qs("#tva-embed-conversation-actions", embedRoot);
    elsEmbed.form = qs("#tva-embed-form", embedRoot);
    elsEmbed.input = qs("#tva-embed-input", embedRoot);

    bindChatForm(elsEmbed.form, elsEmbed.input, submitHeroEmbedMessage);
    if (elsEmbed.suggestionsToggle) {
      elsEmbed.suggestionsToggle.addEventListener("click", toggleEmbedSuggestions);
    }
    collapseEmbedActionDrawer();
  }

  function togglePanel() {
    if (state.open) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function setChatOpenLock(on) {
    try {
      var mobile = window.matchMedia("(max-width: 640px)").matches;
      document.documentElement.classList.toggle("tva-chat-open", on && mobile);
    } catch (e) {
      /* ignore */
    }
  }

  function bindChatViewportLock() {
    if (els._chatLockBound) {
      return;
    }
    els._chatLockBound = true;
    var mq = window.matchMedia("(max-width: 640px)");
    var sync = function () {
      if (state.open) {
        setChatOpenLock(true);
      }
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", sync);
    } else if (typeof mq.addListener === "function") {
      mq.addListener(sync);
    }
  }

  function syncMobileViewport() {
    if (!els.root || !state.open) {
      return;
    }
    var offset = 0;
    if (window.visualViewport) {
      var vv = window.visualViewport;
      offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    }
    els.root.style.setProperty("--tva-kb-offset", offset + "px");
    if (els.messages) {
      els.messages.scrollTop = els.messages.scrollHeight;
    }
  }

  function bindMobileViewport() {
    if (!window.visualViewport || els._vvBound) {
      return;
    }
    els._vvBound = true;
    var onVv = function () {
      syncMobileViewport();
    };
    window.visualViewport.addEventListener("resize", onVv);
    window.visualViewport.addEventListener("scroll", onVv);
  }

  function openPanel() {
    state.open = true;
    els.root.classList.add("tva-root--chat-open");
    els.panel.classList.remove("is-closing");
    els.panel.classList.add("is-open");
    els.launcher.setAttribute("aria-expanded", "true");
    setChatOpenLock(true);
    bindMobileViewport();
    syncMobileViewport();
    if (!state.welcomed && state.messages.length === 0) {
      state.welcomed = true;
      if (usesPanelAgentUi()) {
        welcomeLabFloatPanel();
      } else {
        sendToApi({ message: "" });
      }
    } else {
      state.welcomed = true;
    }
    setTimeout(function () {
      els.input.focus({ preventScroll: true });
      syncMobileViewport();
    }, 280);
  }

  function finishClosePanel() {
    state.open = false;
    els.root.classList.remove("tva-root--chat-open");
    els.panel.classList.remove("is-open", "is-closing");
    els.launcher.setAttribute("aria-expanded", "false");
    setChatOpenLock(false);
    if (els.root) {
      els.root.style.removeProperty("--tva-kb-offset");
    }
    if (els.input) {
      els.input.blur();
    }
  }

  function closePanel() {
    if (
      isLabLanding() &&
      els.panel &&
      els.panel.classList.contains("is-open") &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      els.panel.classList.add("is-closing");
      els.launcher.setAttribute("aria-expanded", "false");
      window.setTimeout(finishClosePanel, 300);
      return;
    }
    finishClosePanel();
  }

  function applyResponse(data) {
    if (data.session_id || data.session_token) {
      setSessionId(data.session_id || data.session_token);
    }
    if (data.reply) {
      appendMessageAll("bot", data.reply);
      pushStoredMessage("bot", data.reply);
    }
    if (data.quick_actions) {
      state.drawerQuick = data.quick_actions;
    }
    if (data.ctas !== undefined) {
      state.drawerCtas = data.ctas;
    }
    syncActionDrawer(state.drawerQuick, state.drawerCtas);
    persistChatState();
    scrollMessagesToBottom();
  }

  function sendToApi(payload) {
    if (isLabLanding()) {
      sendToApiLab(payload);
      return;
    }
    if (state.loading) {
      return;
    }
    state.loading = true;
    setSubmitDisabled(true);
    removeTypingIndicators();
    messageContainers().forEach(function (container) {
      var typing = appendMessage(container, "bot", "Escribiendo…");
      typing.classList.add("tva-msg--typing");
    });

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
        removeTypingIndicators();
        applyResponse(data);
      })
      .catch(function (err) {
        removeTypingIndicators();
        appendMessageAll(
          "bot",
          "No pude conectar con el agente en este momento. " +
            (err.message || "Intenta de nuevo.") +
            "\n\nPuedes revisar bolsas SMS en el sitio o volver a intentar en unos minutos.",
        );
      })
      .finally(function () {
        state.loading = false;
        setSubmitDisabled(false);
      });
  }

  function redirectToCheckout(payload) {
    try {
      sessionStorage.setItem("tva_pending_checkout", JSON.stringify(payload));
    } catch (e) {
      /* ignore */
    }
    window.location.href = (API_BASE || "/") + "#calculadora";
  }

  function openAgentChat(options) {
    if (!els.panel) {
      var launcher = document.querySelector(".tva-launcher");
      if (launcher) {
        launcher.click();
      }
      return;
    }
    openPanel();
    var msg =
      options && options.message ? String(options.message).trim() : "";
    if (msg) {
      sendToApi({ message: msg });
    }
  }

  window.TELVOICE_OPEN_AGENT = openAgentChat;

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

  function initEmbedOnly() {
    var embedSelector = getEmbedSelector();
    if (!embedSelector || document.getElementById("telvoice-web-agent-embed")) {
      return;
    }
    try {
      buildEmbedUi(embedSelector);
      startHeroAgentPresentation();
    } catch (embedErr) {
      console.warn("[Telvoice agent] embed init failed:", embedErr);
    }
  }

  function markAgentUiReady() {
    var floatRoot = document.getElementById("telvoice-web-agent");
    var embedRoot = document.getElementById("telvoice-web-agent-embed");
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (floatRoot) {
          floatRoot.classList.add("tva-root--ready");
        }
        if (embedRoot) {
          embedRoot.classList.add("tva-root--ready");
        }
      });
    });
  }

  function init() {
    try {
      if (!document.getElementById("telvoice-web-agent")) {
        buildUi();
      }
      initEmbedOnly();
      initLabHeroConnection();
      initLabAgentIsotipos();
      var heroEmbedActive = embedEnabled();
      if (!heroEmbedActive) {
        if (state.messages.length === 0) {
          restoreChatState();
        }
        if (state.messages.length > 0) {
          renderStoredMessages();
          syncActionDrawer(state.drawerQuick, state.drawerCtas);
        }
      }
      resumeChatFromServer().then(function (data) {
        if (heroEmbedActive) {
          return;
        }
        if (data && data.messages && data.messages.length) {
          applyResumeData(data);
        }
      });
      initPendingCheckoutOnLanding();
    } catch (err) {
      console.warn("[Telvoice agent] init failed:", err);
    } finally {
      markAgentUiReady();
    }
  }

  window.TELVOICE_WEB_AGENT_INIT = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
