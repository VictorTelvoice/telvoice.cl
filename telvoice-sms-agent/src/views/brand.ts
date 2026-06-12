import { escapeHtml } from "../utils/html.js";

/** Marca visual alineada con telvoice.cl (landing). */
export const TV_BRAND = {
  name: "telvoice",
  isotipo: "/assets/telvoice-isotipo.png",
} as const;

export function brandPageTitle(pageTitle: string): string {
  return `${pageTitle} | ${TV_BRAND.name}`;
}

export function renderBrandIsotipo(size = 32): string {
  return `<img src="${TV_BRAND.isotipo}" alt="" width="${size}" height="${size}" class="tv-brand-isotipo" decoding="async" aria-hidden="true" />`;
}

export function renderFaviconLink(): string {
  return `<link rel="icon" href="${TV_BRAND.isotipo}" type="image/png" sizes="any" />`;
}

/** Wordmark del sidebar y pantallas de auth. */
export function renderBrandWordmark(): string {
  return `<span class="tv-brand-wordmark">${TV_BRAND.name}</span>`;
}

export function renderSidebarBrand(
  href: string,
  options?: { subtitle?: string; badge?: string },
): string {
  const subtitle = options?.subtitle
    ? `<span class="tv-brand-lockup__sub">${escapeHtml(options.subtitle)}</span>`
    : "";
  const badge = options?.badge
    ? `<span class="tv-sidebar__badge">${escapeHtml(options.badge)}</span>`
    : "";

  return `<a href="${href}" class="tv-brand-lockup">
    ${renderBrandIsotipo(32)}
    <span class="tv-brand-lockup__text">
      ${renderBrandWordmark()}
      ${subtitle}
    </span>
  </a>${badge}`;
}

export function renderAuthBrand(title: string, subtitle?: string): string {
  const titleHtml =
    title.trim().toLowerCase() === TV_BRAND.name
      ? renderBrandWordmark()
      : `<span class="tv-brand-wordmark tv-brand-wordmark--plain">${escapeHtml(title)}</span>`;
  const subtitleBlock = subtitle?.trim()
    ? `<p class="tv-auth-sub">${escapeHtml(subtitle)}</p>`
    : "";
  return `<div class="tv-auth-brand">
    ${renderBrandIsotipo(38)}
    <div>
      <h1 class="tv-auth-title">${titleHtml}</h1>
      ${subtitleBlock}
    </div>
  </div>`;
}
