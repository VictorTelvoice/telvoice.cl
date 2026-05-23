import { escapeHtml } from "../../utils/html.js";

export function renderKpiCard(options: {
  label: string;
  value: string;
  hint?: string;
  icon?: string;
  variant?: "default" | "primary" | "success" | "warn" | "danger";
}): string {
  const variant = options.variant ?? "default";
  return `<article class="tv-kpi tv-kpi--${variant}">
    <div class="tv-kpi__head">
      ${options.icon ? `<span class="material-symbols-outlined tv-kpi__icon" aria-hidden="true">${escapeHtml(options.icon)}</span>` : ""}
      <span class="tv-kpi__label">${escapeHtml(options.label)}</span>
    </div>
    <div class="tv-kpi__value">${escapeHtml(options.value)}</div>
    ${options.hint ? `<p class="tv-kpi__hint">${escapeHtml(options.hint)}</p>` : ""}
  </article>`;
}

export function renderQuickAction(options: {
  href: string;
  label: string;
  description: string;
  icon: string;
}): string {
  return `<a href="${escapeHtml(options.href)}" class="tv-quick">
    <span class="material-symbols-outlined tv-quick__icon" aria-hidden="true">${escapeHtml(options.icon)}</span>
    <span class="tv-quick__text">
      <span class="tv-quick__label">${escapeHtml(options.label)}</span>
      <span class="tv-quick__desc">${escapeHtml(options.description)}</span>
    </span>
    <span class="material-symbols-outlined tv-quick__arrow" aria-hidden="true">chevron_right</span>
  </a>`;
}

export function renderSectionTitle(title: string, subtitle?: string): string {
  return `<header class="tv-section-head">
    <h2 class="tv-section-head__title">${escapeHtml(title)}</h2>
    ${subtitle ? `<p class="tv-section-head__sub">${escapeHtml(subtitle)}</p>` : ""}
  </header>`;
}

export function renderChartBars(
  labels: string[],
  values: number[],
  maxValue?: number,
): string {
  const max = maxValue ?? Math.max(...values, 1);
  const bars = labels
    .map((label, i) => {
      const v = values[i] ?? 0;
      const pct = Math.round((v / max) * 100);
      return `<div class="tv-chart__col">
        <div class="tv-chart__bar-wrap">
          <div class="tv-chart__bar" style="height:${pct}%"></div>
        </div>
        <span class="tv-chart__label">${escapeHtml(label)}</span>
        <span class="tv-chart__val">${escapeHtml(String(v))}</span>
      </div>`;
    })
    .join("");
  return `<div class="tv-chart" role="img" aria-label="Envíos por día">${bars}</div>`;
}

export function renderRouteStatusChile(
  routes: { name: string; status: "ok" | "warn" | "err" }[],
): string {
  const items = routes
    .map(
      (r) => `<li class="tv-route tv-route--${r.status}">
        <span class="tv-route__dot" aria-hidden="true"></span>
        <span class="tv-route__name">${escapeHtml(r.name)}</span>
        <span class="tv-route__status">${r.status === "ok" ? "Operativo" : r.status === "warn" ? "Degradado" : "Alerta"}</span>
      </li>`,
    )
    .join("");
  return `<ul class="tv-routes">${items}</ul>`;
}

export function renderPlaceholderPanel(
  title: string,
  message: string,
): string {
  return `<div class="tv-placeholder">
    <span class="material-symbols-outlined tv-placeholder__icon" aria-hidden="true">construction</span>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(message)}</p>
  </div>`;
}
