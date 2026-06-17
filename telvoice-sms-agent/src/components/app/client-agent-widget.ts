/**
 * Widget flotante del agente en panel /app — misma estética que landing (clases .tva-*).
 */

import {
  renderTelvoiceAgentWidgetShell,
  TELVOICE_AGENT_FLOATING_PNG,
  TELVOICE_AGENT_FLOATING_WEBP,
  TELVOICE_AGENT_PROFILE_PNG,
  TELVOICE_AGENT_PROFILE_WEBP,
} from "../agent/telvoice-agent-widget-ui.js";

export { TELVOICE_AGENT_FLOATING_PNG as PANEL_AGENT_ISOTIPO };

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
    showCsvAttach: true,
    inputPlaceholder: "Escribe tu mensaje…",
  });
}

export function getPanelAgentWidgetScript(): string {
  return `(function () {
  var root = document.getElementById("${ROOT_ID}");
  if (!root) return;

  var AGENT_FLOAT_PNG = "${TELVOICE_AGENT_FLOATING_PNG}";
  var AGENT_FLOAT_WEBP = "${TELVOICE_AGENT_FLOATING_WEBP}";
  var AGENT_PROFILE_PNG = "${TELVOICE_AGENT_PROFILE_PNG}";
  var AGENT_PROFILE_WEBP = "${TELVOICE_AGENT_PROFILE_WEBP}";

  function mountAgentImage(slot, context) {
    if (!slot) return;
    var png = context === "launcher" ? AGENT_FLOAT_PNG : AGENT_PROFILE_PNG;
    var webp = context === "launcher" ? AGENT_FLOAT_WEBP : AGENT_PROFILE_WEBP;
    var life = context === "launcher" ? '<span class="telvoice-agent-antenna-glow" role="status" aria-label="En línea"></span>' : "";
    slot.innerHTML =
      '<span class="telvoice-agent-avatar agent-live-motion telvoice-agent-avatar--' + context + '">' +
      '<picture><source type="image/webp" srcset="' + webp + '" />' +
      '<img class="telvoice-agent-avatar__img" src="' + png + '" alt="" decoding="async" draggable="false" /></picture>' +
      life + "</span>";
    slot.classList.add("tva-agent-iso-slot");
  }

  mountAgentImage(document.querySelector("#${ROOT_ID} .tva-launcher-iso"), "launcher");
  mountAgentImage(document.querySelector("#${ROOT_ID} .tva-header-iso"), "header");

  var fab = document.getElementById("${FAB_ID}");
  var panel = document.getElementById("${PANEL_ID}");
  var closeBtn = document.getElementById("${ROOT_ID}-close");
  var minimizeBtn = document.getElementById("${ROOT_ID}-minimize");
  var log = document.getElementById("${ROOT_ID}-log");
  var form = document.getElementById("${ROOT_ID}-form");
  var input = document.getElementById("${ROOT_ID}-input");
  var sendBtn = document.getElementById("${ROOT_ID}-send");
  var quick = document.getElementById("${ROOT_ID}-quick");
  var csvInput = document.getElementById("${ROOT_ID}-csv");
  var attachBtn = document.getElementById("${ROOT_ID}-attach");
  var fileHint = document.getElementById("${ROOT_ID}-file-hint");
  var fileNameEl = document.getElementById("${ROOT_ID}-file-name");
  var fileMetaEl = document.getElementById("${ROOT_ID}-file-meta");
  var fileLabelEl = document.getElementById("${ROOT_ID}-file-label");
  var fileClearBtn = document.getElementById("${ROOT_ID}-file-clear");

  var STORAGE_KEY = "tvp_agent_session";
  var csvChipState = { name: "", validCount: null };
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

  function setAttachVisible(show) {
    if (attachBtn) {
      attachBtn.hidden = !show;
    }
    if (csvInput && !show) {
      csvInput.value = "";
    }
  }

  setAttachVisible(false);

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
    typingEl.className = "tva-msg tva-msg--bot tva-msg--typing tva-msg--with-avatar";
    typingEl.setAttribute("aria-busy", "true");
    var avatar = document.createElement("picture");
    avatar.className = "tva-msg-avatar-wrap";
    avatar.innerHTML =
      '<source type="image/webp" srcset="' + AGENT_PROFILE_WEBP + '" />' +
      '<img class="tva-msg-avatar" src="' + AGENT_PROFILE_PNG + '" alt="" width="40" height="40" decoding="async" draggable="false" />';
    var bubble = document.createElement("div");
    bubble.className = "tva-msg-bubble";
    bubble.textContent = "Escribiendo…";
    typingEl.appendChild(avatar);
    typingEl.appendChild(bubble);
    wrap.appendChild(typingEl);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function appendBubble(role, text, turnCtx) {
    removeTyping();
    var wrap = document.createElement("div");
    wrap.className = "tva-msg-wrap tva-msg-wrap--" + (role === "user" ? "user" : "bot");
    var el = document.createElement("div");
    el.className = "tva-msg tva-msg--" + (role === "user" ? "user" : "bot") + " tva-msg--enter";
    var cleanText = String(text || "").replace(/\\*\\*/g, "");
    if (role === "user") {
      el.textContent = cleanText;
    } else {
      el.classList.add("tva-msg--with-avatar");
      var avatar = document.createElement("picture");
      avatar.className = "tva-msg-avatar-wrap";
      avatar.innerHTML =
        '<source type="image/webp" srcset="' + AGENT_PROFILE_WEBP + '" />' +
        '<img class="tva-msg-avatar" src="' + AGENT_PROFILE_PNG + '" alt="" width="40" height="40" decoding="async" draggable="false" />';
      var bubble = document.createElement("div");
      bubble.className = "tva-msg-bubble";
      bubble.textContent = cleanText;
      el.appendChild(avatar);
      el.appendChild(bubble);
    }
    wrap.appendChild(el);
    if (role !== "user" && sessionId) {
      var ctx = turnCtx || {
        user: lastUserMessage,
        agent: lastAgentReply,
        intent: lastIntent,
        confidence: lastConfidence
      };
      var fb = document.createElement("div");
      fb.className = "tva-feedback";
      fb.setAttribute("role", "group");
      fb.setAttribute("aria-label", "Valorar respuesta");
      var up = document.createElement("button");
      up.type = "button";
      up.textContent = "👍 Me sirvió";
      up.addEventListener("click", function () { sendFeedback(5, "", ctx); });
      var down = document.createElement("button");
      down.type = "button";
      down.textContent = "👎 No me sirvió";
      down.addEventListener("click", function () {
        var c = window.prompt("¿Qué faltó en la respuesta?");
        sendFeedback(1, c || "", ctx);
      });
      fb.appendChild(up);
      fb.appendChild(down);
      wrap.appendChild(fb);
    }
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  async function sendFeedback(rating, feedbackText, turnCtx) {
    if (!sessionId) return;
    var ctx = turnCtx || {
      user: lastUserMessage,
      agent: lastAgentReply,
      intent: lastIntent,
      confidence: lastConfidence
    };
    try {
      await fetch("/api/app/agent/feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId,
          rating: rating,
          feedbackText: feedbackText,
          lastQuestion: ctx.user || lastUserMessage,
          lastReply: ctx.agent || lastAgentReply,
          intent: ctx.intent || lastIntent || undefined,
          confidence: ctx.confidence != null ? ctx.confidence : lastConfidence
        })
      });
      appendBubble("bot", rating >= 4 ? "Gracias por tu feedback." : "Gracias, lo revisaremos para mejorar.");
    } catch (e) {}
  }

  function truncateFileName(name, maxLen) {
    var n = String(name || "planilla.csv");
    var max = maxLen || 28;
    if (n.length <= max) return n;
    var ext = n.lastIndexOf(".") > 0 ? n.slice(n.lastIndexOf(".")) : "";
    var baseMax = Math.max(8, max - ext.length - 1);
    return n.slice(0, baseMax) + "…" + ext;
  }

  function clearCsvChip() {
    csvChipState = { name: "", validCount: null };
    if (fileHint) {
      fileHint.hidden = true;
      fileHint.classList.remove("tva-csv-chip-wrap--loading");
    }
    if (fileNameEl) fileNameEl.textContent = "";
    if (fileMetaEl) fileMetaEl.textContent = "";
    if (fileLabelEl) fileLabelEl.textContent = "CSV cargado";
    if (csvInput) csvInput.value = "";
  }

  function showCsvChip(opts) {
    if (!fileHint) return;
    var name = opts.name || "planilla.csv";
    csvChipState.name = name;
    csvChipState.validCount = opts.validCount != null ? opts.validCount : null;
    fileHint.hidden = false;
    fileHint.classList.toggle("tva-csv-chip-wrap--loading", !!opts.uploading);
    if (fileLabelEl) {
      fileLabelEl.textContent = opts.uploading ? "Subiendo CSV…" : "CSV cargado";
    }
    if (fileNameEl) {
      fileNameEl.textContent = "· " + truncateFileName(name);
    }
    if (fileMetaEl) {
      if (opts.uploading) {
        fileMetaEl.textContent = "";
      } else if (opts.validCount != null && opts.validCount >= 0) {
        fileMetaEl.textContent =
          "· " + opts.validCount + " contacto" + (opts.validCount === 1 ? "" : "s") + " válido" + (opts.validCount === 1 ? "" : "s");
      } else {
        fileMetaEl.textContent = "";
      }
    }
  }

  function renderQuick() {
    if (!quick) return;
    quick.innerHTML = "";
    quickActions.forEach(function (qa) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = qa.label;
      if (qa.variant === "primary" || qa.href) {
        b.classList.add("tva-quick--primary");
      }
      if (qa.message === "__attach_csv__") {
        b.classList.add("tva-quick--attach");
      }
      b.addEventListener("click", function () {
        if (qa.message === "__attach_csv__") {
          triggerCsvPick();
          return;
        }
        if (qa.href) {
          window.location.href = qa.href;
          return;
        }
        if (input) input.value = qa.message || "";
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
      var pendingUser = "";
      data.messages.forEach(function (m) {
        if (m.role === "user") {
          pendingUser = m.content;
          appendBubble("user", m.content);
        } else {
          var meta = m.metadata || {};
          appendBubble("bot", m.content, {
            user: pendingUser,
            agent: m.content,
            intent: meta.intent || "",
            confidence: typeof meta.confidence === "number" ? meta.confidence : null
          });
        }
      });
    } catch (e) {}
  }

  function applyAgentResponse(data) {
    if (data.sessionId) {
      sessionId = data.sessionId;
      try { localStorage.setItem(STORAGE_KEY, sessionId); } catch (e) {}
    }
    if (data.resetFlow) {
      pendingActionId = null;
    } else {
      pendingActionId = data.pendingActionId || null;
    }
    lastAgentReply = data.reply || "";
    lastIntent = data.intent || "";
    lastConfidence = typeof data.confidence === "number" ? data.confidence : null;
    appendBubble("bot", data.reply || "", {
      user: lastUserMessage,
      agent: lastAgentReply,
      intent: lastIntent,
      confidence: lastConfidence
    });
    if (data.suggestedActions && data.suggestedActions.length) {
      var fromApi = data.suggestedActions.slice(0, 8);
      quickActions = fromApi;
      renderQuick();
    }
    if (data.clearCsvUpload) {
      clearCsvChip();
    }
    setAttachVisible(data.showAttachButton === true);
    if (data.closeWidget) {
      setOpen(false);
    }
  }

  function triggerCsvPick() {
    if (csvInput) csvInput.click();
  }

  async function uploadCsvFile(file) {
    if (!file || !sessionId) return;
    if (file.size > 5 * 1024 * 1024) {
      appendBubble("bot", "El archivo supera 5 MB. Usa una planilla más pequeña.");
      clearCsvChip();
      return;
    }
    var name = file.name || "planilla.csv";
    showCsvChip({ name: name, uploading: true });
    lastUserMessage = "Adjunté planilla: " + name;
    appendBubble("user", lastUserMessage);
    showTyping();
    try {
      var text = await file.text();
      var res = await fetch("/api/app/agent/upload-csv", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId, csvText: text, fileName: name })
      });
      var data = await res.json();
      removeTyping();
      if (!data.success) {
        appendBubble("bot", data.error || "No pude leer la planilla.");
        clearCsvChip();
        return;
      }
      applyAgentResponse(data);
      var chip = data.csvFileChip || {};
      showCsvChip({
        name: chip.fileName || name,
        validCount: chip.validCount != null ? chip.validCount : null,
        uploading: false
      });
    } catch (e) {
      removeTyping();
      appendBubble("bot", "Error al subir la planilla. Intenta de nuevo.");
    }
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
          userTimezone: (function () {
            try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return undefined; }
          })(),
          userLocalHour: new Date().getHours(),
          metadata: { page: window.location.pathname }
        })
      });
      var data = await res.json();
      removeTyping();
      if (!data.success) {
        appendBubble("bot", data.error || "No pude procesar tu mensaje.");
        return;
      }
      applyAgentResponse(data);
    } catch (e) {
      removeTyping();
      appendBubble("bot", "Error de conexión. Intenta de nuevo.");
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }

  function agentChrome(action) {
    try {
      document.dispatchEvent(new CustomEvent("telvoice:agent-chrome", { detail: { action: action } }));
    } catch (e) {}
  }

  document.addEventListener("telvoice:agent-panel-close", function () {
    setOpen(false);
  });

  fab.addEventListener("click", function () {
    if (document.body.classList.contains("tva-floating-agent-minimized")) {
      agentChrome("restore");
      return;
    }
    var open = !root.classList.contains("tva-root--chat-open");
    setOpen(open);
    if (open && log && !log.childElementCount) {
      appendBubble("bot", "Hola, soy el asistente operativo Telvoice. ¿En qué te ayudo?");
      loadHistory();
    }
  });

  if (closeBtn) closeBtn.addEventListener("click", function () { setOpen(false); agentChrome("hide"); });
  if (minimizeBtn) minimizeBtn.addEventListener("click", function () { setOpen(false); agentChrome("minimize"); });
  if (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      sendMessage(input ? input.value : "");
    });
  }

  if (attachBtn && csvInput) {
    attachBtn.addEventListener("click", function () { triggerCsvPick(); });
    csvInput.addEventListener("change", function () {
      var file = csvInput.files && csvInput.files[0];
      if (file) uploadCsvFile(file);
      csvInput.value = "";
    });
  }

  if (fileClearBtn) {
    fileClearBtn.addEventListener("click", function () {
      clearCsvChip();
      if (input) input.focus();
    });
  }

  renderQuick();
})();`;
}
