/**
 * Widget flotante del agente en panel /app — misma estética que landing (clases .tva-*).
 */

import {
  renderTelvoiceAgentWidgetShell,
  TELVOICE_AGENT_ISOTIPO,
} from "../agent/telvoice-agent-widget-ui.js";

export { TELVOICE_AGENT_ISOTIPO as PANEL_AGENT_ISOTIPO };

const ROOT_ID = "tv-panel-agent";
const FAB_ID = "tv-panel-agent-fab";
const PANEL_ID = "tv-panel-agent-panel";

/** @deprecated Usar renderTelvoiceAgentStylesheetLink() en app-shell */
export function getPanelAgentWidgetStyles(): string {
  return "";
}

export function renderPanelAgentWidget(): string {
  return renderTelvoiceAgentWidgetShell({
    variant: "app",
    rootId: ROOT_ID,
    fabId: FAB_ID,
    panelId: PANEL_ID,
  });
}

export function getPanelAgentWidgetScript(): string {
  return `(function () {
  var root = document.getElementById("${ROOT_ID}");
  if (!root) return;

  var fab = document.getElementById("${FAB_ID}");
  var panel = document.getElementById("${PANEL_ID}");
  var closeBtn = document.getElementById("${ROOT_ID}-close");
  var log = document.getElementById("${ROOT_ID}-log");
  var form = document.getElementById("${ROOT_ID}-form");
  var input = document.getElementById("${ROOT_ID}-input");
  var sendBtn = document.getElementById("${ROOT_ID}-send");
  var quick = document.getElementById("${ROOT_ID}-quick");

  var STORAGE_KEY = "tvp_agent_session";
  var sessionId = "";
  try {
    sessionId = localStorage.getItem(STORAGE_KEY) || "";
  } catch (e) {}

  var pendingActionId = null;
  var lastUserMessage = "";
  var lastAgentReply = "";
  var lastIntent = "";
  var lastConfidence = null;
  var typingEl = null;

  var quickActions = [
    { label: "Ver mi saldo", message: "¿Cuánto saldo tengo?" },
    { label: "Crear campaña", message: "Ayúdame a crear una campaña" },
    { label: "Últimos envíos", message: "Muéstrame mis últimos envíos" },
    { label: "Comprar más SMS", message: "Quiero comprar 15000 SMS" },
    { label: "Ayuda con DLR", message: "¿Por qué mi SMS está submitted?" },
    { label: "Optimizar mensaje", message: "Optimiza este mensaje: Hola cliente tenemos descuento hoy" }
  ];

  function setChatOpenLock(on) {
    try {
      var mobile = window.matchMedia("(max-width: 640px)").matches;
      document.documentElement.classList.toggle("tva-chat-open", on && mobile);
    } catch (e) {}
  }

  function setOpen(open) {
    root.classList.toggle("tva-root--chat-open", open);
    if (panel) panel.classList.toggle("is-open", open);
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    setChatOpenLock(open);
    if (open && input) {
      setTimeout(function () { input.focus(); }, 120);
    }
  }

  function removeTyping() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }

  function showTyping() {
    removeTyping();
    var wrap = document.createElement("div");
    wrap.className = "tva-msg-wrap tva-msg-wrap--bot";
    typingEl = document.createElement("div");
    typingEl.className = "tva-msg tva-msg--bot tva-msg--typing";
    typingEl.setAttribute("aria-busy", "true");
    typingEl.textContent = "Escribiendo…";
    wrap.appendChild(typingEl);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function appendBubble(role, text) {
    removeTyping();
    var wrap = document.createElement("div");
    wrap.className = "tva-msg-wrap tva-msg-wrap--" + (role === "user" ? "user" : "bot");
    var el = document.createElement("div");
    el.className = "tva-msg tva-msg--" + (role === "user" ? "user" : "bot");
    el.textContent = String(text || "").replace(/\\*\\*/g, "");
    wrap.appendChild(el);
    if (role !== "user" && sessionId) {
      var fb = document.createElement("div");
      fb.className = "tva-feedback";
      fb.setAttribute("role", "group");
      fb.setAttribute("aria-label", "Valorar respuesta");
      var up = document.createElement("button");
      up.type = "button";
      up.textContent = "👍 Me sirvió";
      up.addEventListener("click", function () { sendFeedback(5, ""); });
      var down = document.createElement("button");
      down.type = "button";
      down.textContent = "👎 No me sirvió";
      down.addEventListener("click", function () {
        var c = window.prompt("¿Qué faltó en la respuesta?");
        sendFeedback(1, c || "");
      });
      fb.appendChild(up);
      fb.appendChild(down);
      wrap.appendChild(fb);
    }
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  async function sendFeedback(rating, feedbackText) {
    if (!sessionId) return;
    try {
      await fetch("/api/app/agent/feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId,
          rating: rating,
          feedbackText: feedbackText,
          lastQuestion: lastUserMessage,
          lastReply: lastAgentReply,
          intent: lastIntent || undefined,
          confidence: lastConfidence
        })
      });
      appendBubble("bot", rating >= 4 ? "Gracias por tu feedback." : "Gracias, lo revisaremos para mejorar.");
    } catch (e) {}
  }

  function renderQuick() {
    if (!quick) return;
    quick.innerHTML = "";
    quickActions.forEach(function (qa) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = qa.label;
      b.addEventListener("click", function () {
        if (input) input.value = qa.message;
        if (form) form.requestSubmit();
      });
      quick.appendChild(b);
    });
  }

  async function loadHistory() {
    if (!sessionId) return;
    try {
      var res = await fetch("/api/app/agent/history?sessionId=" + encodeURIComponent(sessionId), {
        credentials: "same-origin"
      });
      var data = await res.json();
      if (!data.success || !data.messages) return;
      log.innerHTML = "";
      data.messages.forEach(function (m) {
        appendBubble(m.role === "user" ? "user" : "bot", m.content);
      });
    } catch (e) {}
  }

  async function sendMessage(text) {
    var msg = String(text || "").trim();
    if (!msg) return;
    lastUserMessage = msg;
    appendBubble("user", msg);
    if (input) input.value = "";
    if (sendBtn) sendBtn.disabled = true;
    showTyping();
    try {
      var res = await fetch("/api/app/agent/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          sessionId: sessionId || undefined,
          pendingActionId: pendingActionId,
          metadata: { page: window.location.pathname }
        })
      });
      var data = await res.json();
      removeTyping();
      if (!data.success) {
        appendBubble("bot", data.error || "No pude procesar tu mensaje.");
        return;
      }
      if (data.sessionId) {
        sessionId = data.sessionId;
        try { localStorage.setItem(STORAGE_KEY, sessionId); } catch (e) {}
      }
      pendingActionId = data.pendingActionId || null;
      lastAgentReply = data.reply || "";
      lastIntent = data.intent || "";
      lastConfidence = typeof data.confidence === "number" ? data.confidence : null;
      appendBubble("bot", data.reply || "");
      if (data.suggestedActions && data.suggestedActions.length) {
        var fromApi = data.suggestedActions.filter(function (a) { return a.message; }).slice(0, 6);
        if (fromApi.length) quickActions = fromApi;
        renderQuick();
      }
    } catch (e) {
      removeTyping();
      appendBubble("bot", "Error de conexión. Intenta de nuevo.");
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }

  fab.addEventListener("click", function () {
    var open = !root.classList.contains("tva-root--chat-open");
    setOpen(open);
    if (open && log && !log.childElementCount) {
      appendBubble("bot", "Hola, soy el asistente operativo Telvoice. ¿En qué te ayudo?");
      loadHistory();
    }
  });

  if (closeBtn) closeBtn.addEventListener("click", function () { setOpen(false); });
  if (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      sendMessage(input ? input.value : "");
    });
  }

  renderQuick();
})();`;
}
