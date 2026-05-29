/**
 * Widget flotante admin — misma estética que landing; accesos rápidos seguros (solo navegación).
 */

import { renderTelvoiceAgentWidgetShell } from "../agent/telvoice-agent-widget-ui.js";

const ROOT_ID = "tv-admin-agent";
const FAB_ID = "tv-admin-agent-fab";
const PANEL_ID = "tv-admin-agent-panel";

export function renderAdminAgentWidget(): string {
  return renderTelvoiceAgentWidgetShell({
    variant: "admin",
    rootId: ROOT_ID,
    fabId: FAB_ID,
    panelId: PANEL_ID,
    showInput: true,
    inputPlaceholder: "Probar una frase (solo vista previa local)…",
  });
}

export function getAdminAgentWidgetScript(): string {
  return `<script>
(function () {
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

  var quickLinks = [
    { label: "Preguntas sin respuesta", href: "/admin/agent-training/unanswered" },
    { label: "Feedback", href: "/admin/agent-training/feedback" },
    { label: "Base de conocimiento", href: "/admin/knowledge" },
    { label: "Hub Agente Telvoice", href: "/admin/agent-training" },
    { label: "Conversaciones web", href: "/admin/web-agent/sessions" },
    { label: "Probar intención", message: "quiero comprar 30000 mensajes" }
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
    if (open && input) setTimeout(function () { input.focus(); }, 120);
  }

  function appendBubble(role, text) {
    var wrap = document.createElement("div");
    wrap.className = "tva-msg-wrap tva-msg-wrap--" + (role === "user" ? "user" : "bot");
    var el = document.createElement("div");
    el.className = "tva-msg tva-msg--" + (role === "user" ? "user" : "bot");
    el.textContent = text;
    wrap.appendChild(el);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function renderQuick() {
    if (!quick) return;
    quick.innerHTML = "";
    quickLinks.forEach(function (item) {
      if (item.href) {
        var a = document.createElement("a");
        a.className = "tva-quick-link";
        a.href = item.href;
        a.textContent = item.label;
        quick.appendChild(a);
        return;
      }
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = item.label;
      b.addEventListener("click", function () {
        if (input) input.value = item.message || "";
        if (form) form.requestSubmit();
      });
      quick.appendChild(b);
    });
  }

  function handleSubmit(text) {
    var msg = String(text || "").trim();
    if (!msg) return;
    appendBubble("user", msg);
    if (input) input.value = "";
    appendBubble(
      "bot",
      "Vista previa local del superadmin. Para entrenar o revisar respuestas usa las acciones rápidas o las secciones Agente Telvoice. No se ejecutan cambios en producción desde este chat."
    );
  }

  fab.addEventListener("click", function () {
    var open = !root.classList.contains("tva-root--chat-open");
    setOpen(open);
    if (open && log && !log.childElementCount) {
      appendBubble(
        "bot",
        "Hola, soy el asistente visual de entrenamiento Telvoice. Usa los accesos rápidos para ir a preguntas sin respuesta, feedback o conocimiento."
      );
    }
  });

  if (closeBtn) closeBtn.addEventListener("click", function () { setOpen(false); });
  if (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      handleSubmit(input ? input.value : "");
      if (sendBtn) sendBtn.disabled = false;
    });
  }

  renderQuick();
})();
</script>`;
}
