import { escapeHtml } from "../../utils/html.js";

export function renderPageHeader(options: {
  title: string;
  /** Texto plano (se escapa). */
  subtitle?: string;
  /** HTML interno de confianza (badges, etc.). No usar con input de usuario. */
  subtitleHtml?: string;
  actions?: string;
}): string {
  const sub =
    options.subtitleHtml ??
    escapeHtml(options.subtitle ?? "");
  return `<header class="tv-page-head tv-page-head--row">
    <div>
      <h1 class="tv-page-title">${escapeHtml(options.title)}</h1>
      <p class="tv-page-sub">${sub}</p>
    </div>
    ${options.actions ? `<div class="tv-page-actions">${options.actions}</div>` : ""}
  </header>`;
}

export function renderBtn(
  label: string,
  opts?: {
    href?: string;
    type?: "button" | "submit";
    variant?: "primary" | "secondary" | "ghost" | "campaign";
    disabled?: boolean;
    title?: string;
    icon?: string;
  },
): string {
  const variant = opts?.variant ?? "secondary";
  const cls =
    variant === "campaign"
      ? "tv-btn-campaign"
      : `btn btn-${variant === "primary" ? "primary" : variant === "ghost" ? "ghost" : "secondary"}`;
  const icon = opts?.icon
    ? `<span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">${escapeHtml(opts.icon)}</span>`
    : "";
  const inner = `${icon}${escapeHtml(label)}`;
  const dis = opts?.disabled ? " disabled" : "";
  const title = opts?.title ? ` title="${escapeHtml(opts.title)}"` : "";
  if (opts?.href && !opts.disabled) {
    return `<a href="${escapeHtml(opts.href)}" class="${cls}"${title}>${inner}</a>`;
  }
  return `<button type="${opts?.type ?? "button"}" class="${cls}"${dis}${title}>${inner}</button>`;
}

export function renderTabs(
  tabs: { id: string; label: string; count?: number }[],
  activeId: string,
  groupName: string,
): string {
  const items = tabs
    .map((t) => {
      const active = t.id === activeId;
      const count =
        t.count !== undefined
          ? `<span class="tv-tab__count">${escapeHtml(String(t.count))}</span>`
          : "";
      return `<button type="button" class="tv-tab${active ? " tv-tab--active" : ""}" data-tv-tab="${escapeHtml(t.id)}" data-tv-tab-group="${escapeHtml(groupName)}" aria-selected="${active}">${escapeHtml(t.label)}${count}</button>`;
    })
    .join("");
  return `<div class="tv-tabs" role="tablist" data-tv-tab-group="${escapeHtml(groupName)}">${items}</div>`;
}

export function renderModeCards(
  modes: {
    id: string;
    label: string;
    description: string;
    icon: string;
  }[],
  activeId: string,
): string {
  return `<div class="tv-mode-grid" data-tv-send-mode-root>
    ${modes
      .map(
        (m) => `<button type="button" class="tv-mode-card${m.id === activeId ? " tv-mode-card--active" : ""}" data-tv-send-mode="${escapeHtml(m.id)}">
        <span class="material-symbols-outlined tv-mode-card__icon" aria-hidden="true">${escapeHtml(m.icon)}</span>
        <span class="tv-mode-card__label">${escapeHtml(m.label)}</span>
        <span class="tv-mode-card__desc">${escapeHtml(m.description)}</span>
      </button>`,
      )
      .join("")}
  </div>`;
}

export function renderStatChip(label: string, value: string, variant?: string): string {
  return `<div class="tv-stat-chip tv-stat-chip--${variant ?? "default"}">
    <span class="tv-stat-chip__label">${escapeHtml(label)}</span>
    <span class="tv-stat-chip__value">${escapeHtml(value)}</span>
  </div>`;
}

export function renderCodeBlock(code: string, title?: string): string {
  return `<div class="tv-code">
    ${title ? `<div class="tv-code__title">${escapeHtml(title)}</div>` : ""}
    <pre><code>${escapeHtml(code)}</code></pre>
  </div>`;
}

export function renderMobilePreview(sender: string, message: string): string {
  return `<div class="tv-phone">
    <div class="tv-phone__bar">
      <span class="tv-phone__time">09:41</span>
      <span class="tv-phone__signal">SMS</span>
    </div>
    <div class="tv-phone__header">${escapeHtml(sender)}</div>
    <div class="tv-phone__body">
      <div class="tv-phone__bubble">${escapeHtml(message)}</div>
    </div>
  </div>`;
}

/** Mockup estilo hero landing (telvoice.cl) — pantalla con notch y burbuja SMS. */
export function renderHeroPhonePreview(options: {
  senderLabel: string;
  senderSub?: string;
  message: string;
  bubbleId?: string;
  compact?: boolean;
}): string {
  const msg = options.message.trim() || "Hola, tu mensaje aparecerá aquí.";
  const compactCls = options.compact ? " tv-hero-phone--compact" : "";
  const bubbleAttr = options.bubbleId
    ? ` id="${escapeHtml(options.bubbleId)}"`
    : "";
  const initial = (options.senderLabel.charAt(0) || "T").toUpperCase();
  const sub = options.senderSub
    ? `<div class="tv-hero-phone__app-sub">${escapeHtml(options.senderSub)}</div>`
    : "";
  return `<div class="tv-hero-phone${compactCls}">
    <div class="tv-hero-phone__notch" aria-hidden="true"></div>
    <div class="tv-hero-phone__screen">
      <div class="tv-hero-phone__app-head">
        <div class="tv-hero-phone__avatar" aria-hidden="true">${escapeHtml(initial)}</div>
        <div>
          <div class="tv-hero-phone__app-title">${escapeHtml(options.senderLabel)}</div>
          ${sub}
        </div>
      </div>
      <div class="tv-hero-phone__messages">
        <div class="tv-hero-phone__bubble tv-hero-phone__bubble--in"${bubbleAttr}>${escapeHtml(msg)}</div>
      </div>
    </div>
  </div>`;
}

export function renderStatusBadgeLabel(status: string): string {
  const map: Record<string, string> = {
    delivered: "Entregado",
    entregado: "Entregado",
    pending: "Pendiente",
    pendiente: "Pendiente",
    failed: "Fallido",
    fallido: "Fallido",
    expired: "Expirado",
    rejected: "Rechazado",
    responded: "Respondido",
    optout: "Opt-out",
    submitted: "Enviado",
    active: "Activo",
    ok: "OK",
  };
  const key = status.toLowerCase();
  return map[key] ?? status;
}

export function renderInboxStatusBadge(status: string): string {
  const clsMap: Record<string, string> = {
    entregado: "ok",
    delivered: "ok",
    enviado: "ok",
    submitted: "ok",
    pendiente: "warn",
    pending: "warn",
    fallido: "err",
    failed: "err",
    rechazado: "err",
    rejected: "err",
    expirado: "muted",
    expired: "muted",
    respondido: "primary",
    responded: "primary",
    optout: "muted",
  };
  const key = status.toLowerCase();
  const label = renderStatusBadgeLabel(status);
  const cls = clsMap[key] ?? "muted";
  return `<span class="badge badge-${cls === "primary" ? "ok" : cls} tv-badge-inbox tv-badge-inbox--${cls}">${escapeHtml(label)}</span>`;
}

export function renderHttpBadge(code: number): string {
  let cls = "badge-muted";
  if (code >= 200 && code < 300) cls = "badge-ok";
  else if (code >= 400 && code < 500) cls = "badge-warn";
  else if (code >= 500) cls = "badge-err";
  return `<span class="badge ${cls}">${escapeHtml(String(code))}</span>`;
}

export function renderPanel(title: string, body: string, extraClass = ""): string {
  return `<section class="tv-panel ${extraClass}">
    <header class="tv-section-head"><h2 class="tv-section-head__title">${escapeHtml(title)}</h2></header>
    <div class="tv-panel__body">${body}</div>
  </section>`;
}

export function renderNotice(text: string, variant: "info" | "warn" = "info"): string {
  const cls = variant === "warn" ? "alert-warn" : "tv-notice";
  return `<div class="alert ${cls} tv-notice-block">${escapeHtml(text)}</div>`;
}

export function renderFilterBar(innerHtml: string): string {
  return `<div class="tv-filters tv-filters--wrap">${innerHtml}</div>`;
}

export function renderFilterField(
  label: string,
  inputHtml: string,
): string {
  return `<label class="tv-filter-field"><span class="tv-filter-field__label">${escapeHtml(label)}</span>${inputHtml}</label>`;
}

export function renderMiniChart(
  title: string,
  labels: string[],
  values: number[],
  variant: "primary" | "purple" | "success" | "warn" = "primary",
): string {
  const max = Math.max(...values, 1);
  const bars = labels
    .map((label, i) => {
      const v = values[i] ?? 0;
      const pct = Math.round((v / max) * 100);
      return `<div class="tv-mini-chart__col">
        <div class="tv-mini-chart__bar-wrap"><div class="tv-mini-chart__bar tv-mini-chart__bar--${variant}" style="height:${pct}%"></div></div>
        <span class="tv-mini-chart__label">${escapeHtml(label)}</span>
      </div>`;
    })
    .join("");
  return `<div class="tv-mini-chart">
    <div class="tv-mini-chart__title">${escapeHtml(title)}</div>
    <div class="tv-mini-chart__bars">${bars}</div>
  </div>`;
}

export function renderPerformanceBadge(
  level: "excelente" | "normal" | "bajo" | "revisar",
): string {
  const map = {
    excelente: ["ok", "Excelente"],
    normal: ["ok", "Normal"],
    bajo: ["warn", "Bajo rendimiento"],
    revisar: ["err", "Revisar errores"],
  } as const;
  const [cls, label] = map[level];
  return `<span class="badge badge-${cls}">${label}</span>`;
}

export function renderInsightList(items: string[]): string {
  const lis = items
    .map(
      (t) => `<li class="tv-insight">
        <span class="material-symbols-outlined" aria-hidden="true">insights</span>
        <span>${escapeHtml(t)}</span>
      </li>`,
    )
    .join("");
  return `<ul class="tv-insights">${lis}</ul>`;
}

export function renderCollapsible(title: string, body: string, open = false): string {
  return `<details class="tv-details"${open ? " open" : ""}>
    <summary>${escapeHtml(title)}</summary>
    <div class="tv-details__body">${body}</div>
  </details>`;
}

/** Script mínimo para tabs, modos de envío y bandeja (sin bundler). */
export function renderAdminUiScript(): string {
  return `<script>
(function () {
  document.querySelectorAll("[data-tv-tab-group]").forEach(function (group) {
    var name = group.getAttribute("data-tv-tab-group");
    var panels = document.querySelectorAll('[data-tv-tab-panel="' + name + '"]');
    group.querySelectorAll("[data-tv-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-tv-tab");
        group.querySelectorAll("[data-tv-tab]").forEach(function (b) {
          b.classList.toggle("tv-tab--active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        panels.forEach(function (p) {
          p.hidden = p.getAttribute("data-tv-tab-id") !== id;
        });
      });
    });
  });
  var modeRoot = document.querySelector("[data-tv-send-mode-root]");
  if (modeRoot) {
    var panels = document.querySelectorAll("[data-tv-send-panel]");
    modeRoot.querySelectorAll("[data-tv-send-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-tv-send-mode");
        modeRoot.querySelectorAll("[data-tv-send-mode]").forEach(function (b) {
          b.classList.toggle("tv-mode-card--active", b === btn);
        });
        panels.forEach(function (p) {
          p.hidden = p.getAttribute("data-tv-send-panel") !== id;
        });
        var sched = document.querySelector("[data-tv-schedule-fields]");
        if (sched) sched.hidden = id !== "scheduled";
        var mass = document.querySelector("[data-tv-mass-fields]");
        if (mass) mass.hidden = id !== "mass";
        var tpl = document.querySelector("[data-tv-template-fields]");
        if (tpl) tpl.hidden = id !== "template";
        var single = document.querySelector("[data-tv-single-fields]");
        if (single) single.hidden = id !== "single";
      });
    });
  }
  document.querySelectorAll("[data-tv-inbox-row]").forEach(function (row) {
    row.addEventListener("click", function () {
      var id = row.getAttribute("data-tv-inbox-row");
      document.querySelectorAll("[data-tv-inbox-row]").forEach(function (r) {
        r.classList.toggle("tv-inbox-row--active", r === row);
      });
      var detail = document.querySelector("[data-tv-inbox-detail]");
      var tpl = document.getElementById("tv-inbox-detail-" + id);
      if (detail && tpl) detail.innerHTML = tpl.innerHTML;
    });
  });
  var msg = document.getElementById("textmessage");
  var prev = document.querySelector(".tv-phone__bubble");
  if (msg && prev) {
    msg.addEventListener("input", function () {
      prev.textContent = msg.value || "Vista previa del mensaje…";
      var len = document.querySelector("[data-tv-char-count]");
      if (len) len.textContent = String(msg.value.length);
      var seg = document.querySelector("[data-tv-segments]");
      if (seg) seg.textContent = String(Math.max(1, Math.ceil(msg.value.length / 160)));
    });
  }
  document.querySelectorAll("[data-tv-contact-row]").forEach(function (row) {
    row.addEventListener("click", function () {
      var id = row.getAttribute("data-tv-contact-row");
      document.querySelectorAll("[data-tv-contact-row]").forEach(function (r) {
        r.classList.toggle("tv-inbox-row--active", r === row);
      });
      var detail = document.querySelector("[data-tv-contact-detail]");
      var tpl = document.getElementById("tv-contact-detail-" + id);
      if (detail && tpl) detail.innerHTML = tpl.innerHTML;
    });
  });
  document.querySelectorAll("[data-tv-chat-ticket]").forEach(function (row) {
    row.addEventListener("click", function () {
      var id = row.getAttribute("data-tv-chat-ticket");
      document.querySelectorAll("[data-tv-chat-ticket]").forEach(function (r) {
        r.classList.toggle("tv-inbox-row--active", r === row);
      });
      var msgs = document.querySelector("[data-tv-chat-messages]");
      var meta = document.querySelector("[data-tv-chat-meta]");
      var tplM = document.getElementById("tv-chat-msgs-" + id);
      var tplMeta = document.getElementById("tv-chat-meta-" + id);
      if (msgs && tplM) msgs.innerHTML = tplM.innerHTML;
      if (meta && tplMeta) meta.innerHTML = tplMeta.innerHTML;
    });
  });
  document.querySelectorAll("[data-tv-template-card]").forEach(function (card) {
    card.addEventListener("click", function () {
      document.querySelectorAll("[data-tv-template-card]").forEach(function (c) {
        c.classList.toggle("tv-template-card--active", c === card);
      });
      var editor = document.querySelector("[data-tv-template-editor]");
      var tpl = document.getElementById("tv-template-editor-" + card.getAttribute("data-tv-template-card"));
      if (editor && tpl) editor.innerHTML = tpl.innerHTML;
    });
  });
})();
</script>`;
}
