/** Widget flotante del agente telvoice en el panel /app (SSR + script vanilla). */

export const PANEL_AGENT_ISOTIPO = "/assets/telvoice-agent-isotipo.png";

export function getPanelAgentWidgetStyles(): string {
  return `
    .tv-panel-agent {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      z-index: 400;
      font-family: Inter, system-ui, sans-serif;
    }
    .tv-panel-agent__fab {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      background: linear-gradient(135deg, #0ea5e9, #0052cc);
      box-shadow: 0 8px 28px rgba(0, 82, 204, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .tv-panel-agent__fab img {
      width: 34px;
      height: 34px;
      object-fit: contain;
    }
    .tv-panel-agent__fab:focus-visible {
      outline: 2px solid #7dd3fc;
      outline-offset: 3px;
    }
    .tv-panel-agent__panel {
      display: none;
      position: absolute;
      bottom: calc(100% + 12px);
      right: 0;
      width: min(380px, calc(100vw - 2rem));
      max-height: min(520px, calc(100vh - 6rem));
      background: #fff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
      flex-direction: column;
      overflow: hidden;
    }
    .tv-panel-agent--open .tv-panel-agent__panel {
      display: flex;
    }
    .tv-panel-agent__head {
      padding: 0.85rem 1rem;
      background: linear-gradient(135deg, #0a2458, #0c4a9e);
      color: #fff;
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .tv-panel-agent__head img {
      width: 32px;
      height: 32px;
    }
    .tv-panel-agent__head strong {
      display: block;
      font-size: 0.95rem;
      font-weight: 700;
      text-transform: lowercase;
    }
    .tv-panel-agent__head span {
      font-size: 0.72rem;
      opacity: 0.85;
    }
    .tv-panel-agent__close {
      margin-left: auto;
      background: transparent;
      border: none;
      color: #fff;
      cursor: pointer;
      padding: 0.25rem;
    }
    .tv-panel-agent__quick {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding: 0.55rem 0.65rem;
      border-bottom: 1px solid #f1f5f9;
      background: #f8fafc;
    }
    .tv-panel-agent__quick button {
      font-size: 0.72rem;
      padding: 0.3rem 0.55rem;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      background: #fff;
      cursor: pointer;
      color: #0f172a;
    }
    .tv-panel-agent__quick button:hover {
      border-color: #0ea5e9;
      color: #0369a1;
    }
    .tv-panel-agent__log {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      min-height: 200px;
      max-height: 280px;
    }
    .tv-panel-agent__bubble {
      max-width: 92%;
      padding: 0.55rem 0.75rem;
      border-radius: 12px;
      font-size: 0.84rem;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .tv-panel-agent__bubble--user {
      align-self: flex-end;
      background: #e0f2fe;
      color: #0c4a6e;
    }
    .tv-panel-agent__bubble--bot {
      align-self: flex-start;
      background: #f1f5f9;
      color: #0f172a;
    }
    .tv-panel-agent__feedback {
      display: flex;
      gap: 0.35rem;
      margin-top: 0.25rem;
      align-self: flex-start;
    }
    .tv-panel-agent__feedback button {
      font-size: 0.7rem;
      padding: 0.2rem 0.45rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
      color: #64748b;
    }
    .tv-panel-agent__form {
      display: flex;
      gap: 0.35rem;
      padding: 0.65rem;
      border-top: 1px solid #e2e8f0;
    }
    .tv-panel-agent__form input {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 0.5rem 0.65rem;
      font-size: 0.88rem;
    }
    .tv-panel-agent__form button {
      border: none;
      border-radius: 10px;
      background: #0052cc;
      color: #fff;
      padding: 0 0.85rem;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.85rem;
    }
    .tv-panel-agent__form button:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    @media (max-width: 480px) {
      .tv-panel-agent {
        right: 0.75rem;
        bottom: 0.75rem;
      }
      .tv-panel-agent__panel {
        width: calc(100vw - 1.5rem);
      }
    }
  `;
}

export function renderPanelAgentWidget(): string {
  return `<div class="tv-panel-agent" id="tv-panel-agent" aria-live="polite">
    <div class="tv-panel-agent__panel" id="tv-panel-agent-panel" role="dialog" aria-label="Asistente telvoice">
      <div class="tv-panel-agent__head">
        <img src="${PANEL_AGENT_ISOTIPO}" alt="" width="32" height="32" decoding="async" />
        <div>
          <strong>telvoice</strong>
          <span>Asistente de tu empresa</span>
        </div>
        <button type="button" class="tv-panel-agent__close" id="tv-panel-agent-close" aria-label="Cerrar chat">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="tv-panel-agent__quick" id="tv-panel-agent-quick"></div>
      <div class="tv-panel-agent__log" id="tv-panel-agent-log"></div>
      <form class="tv-panel-agent__form" id="tv-panel-agent-form">
        <input type="text" id="tv-panel-agent-input" placeholder="Escribe tu consulta…" autocomplete="off" maxlength="2000" />
        <button type="submit" id="tv-panel-agent-send">Enviar</button>
      </form>
    </div>
    <button type="button" class="tv-panel-agent__fab" id="tv-panel-agent-fab" aria-label="Abrir asistente telvoice" aria-expanded="false" aria-controls="tv-panel-agent-panel">
      <img src="${PANEL_AGENT_ISOTIPO}" alt="" width="34" height="34" decoding="async" />
    </button>
  </div>`;
}

export function getPanelAgentWidgetScript(): string {
  return `<script>
(function () {
  var root = document.getElementById("tv-panel-agent");
  if (!root) return;

  var fab = document.getElementById("tv-panel-agent-fab");
  var panel = document.getElementById("tv-panel-agent-panel");
  var closeBtn = document.getElementById("tv-panel-agent-close");
  var log = document.getElementById("tv-panel-agent-log");
  var form = document.getElementById("tv-panel-agent-form");
  var input = document.getElementById("tv-panel-agent-input");
  var sendBtn = document.getElementById("tv-panel-agent-send");
  var quick = document.getElementById("tv-panel-agent-quick");

  var STORAGE_KEY = "tvp_agent_session";
  var sessionId = "";
  try {
    sessionId = localStorage.getItem(STORAGE_KEY) || "";
  } catch (e) {}

  var pendingActionId = null;

  var quickActions = [
    { label: "Ver mi saldo", message: "¿Cuánto saldo tengo?" },
    { label: "Crear campaña", message: "Ayúdame a crear una campaña" },
    { label: "Últimos envíos", message: "Muéstrame mis últimos envíos" },
    { label: "Comprar más SMS", message: "Quiero comprar 15000 SMS" },
    { label: "Ayuda con DLR", message: "¿Por qué mi SMS está submitted?" },
    { label: "Optimizar mensaje", message: "Optimiza este mensaje para usar 1 segmento" }
  ];

  function setOpen(open) {
    root.classList.toggle("tv-panel-agent--open", open);
    fab.setAttribute("aria-expanded", open ? "true" : "false");
  }

  var lastUserMessage = "";

  function appendBubble(role, text) {
    var wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = role === "user" ? "flex-end" : "flex-start";
    var el = document.createElement("div");
    el.className = "tv-panel-agent__bubble tv-panel-agent__bubble--" + (role === "user" ? "user" : "bot");
    el.textContent = text.replace(/\\*\\*/g, "");
    wrap.appendChild(el);
    if (role !== "user" && sessionId) {
      var fb = document.createElement("div");
      fb.className = "tv-panel-agent__feedback";
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
          lastQuestion: lastUserMessage
        })
      });
      appendBubble("bot", rating >= 4 ? "Gracias por tu feedback." : "Gracias, lo revisaremos para mejorar.");
    } catch (e) {}
  }

  function renderQuick() {
    quick.innerHTML = "";
    quickActions.forEach(function (qa) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = qa.label;
      b.addEventListener("click", function () {
        input.value = qa.message;
        form.requestSubmit();
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
    input.value = "";
    sendBtn.disabled = true;
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
      if (!data.success) {
        appendBubble("bot", data.error || "No pude procesar tu mensaje.");
        return;
      }
      if (data.sessionId) {
        sessionId = data.sessionId;
        try { localStorage.setItem(STORAGE_KEY, sessionId); } catch (e) {}
      }
      pendingActionId = data.pendingActionId || null;
      appendBubble("bot", data.reply || "");
      if (data.suggestedActions && data.suggestedActions.length) {
        quickActions = data.suggestedActions.filter(function (a) { return a.message; }).slice(0, 6);
        if (!quickActions.length) quickActions = [
          { label: "Ver mi saldo", message: "¿Cuánto saldo tengo?" }
        ];
        renderQuick();
      }
    } catch (e) {
      appendBubble("bot", "Error de conexión. Intenta de nuevo.");
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  fab.addEventListener("click", function () {
    var open = !root.classList.contains("tv-panel-agent--open");
    setOpen(open);
    if (open) {
      if (!log.childElementCount) {
        appendBubble("bot", "Hola, soy el asistente operativo Telvoice. ¿En qué te ayudo?");
        loadHistory();
      }
      input.focus();
    }
  });

  closeBtn.addEventListener("click", function () { setOpen(false); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    sendMessage(input.value);
  });

  renderQuick();
})();
</script>`;
}
