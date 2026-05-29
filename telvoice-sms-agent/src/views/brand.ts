import { escapeHtml } from "../utils/html.js";

/** Marca visual alineada con telvoice.cl (landing). */
export const TV_BRAND = {
  name: "telvoice",
  isotipo: "/assets/telvoice-isotipo.png",
} as const;

export function brandPageTitle(pageTitle: string): string {
  return `${pageTitle} | ${TV_BRAND.name}`;
}

export function renderBrandIsotipo(size = 40): string {
  return `<img src="${TV_BRAND.isotipo}" alt="" width="${size}" height="${size}" class="tv-brand-isotipo" decoding="async" aria-hidden="true" />`;
}

export function renderFaviconLink(): string {
  return `<link rel="icon" href="${TV_BRAND.isotipo}" type="image/png" sizes="any" />`;
}

/** Wordmark alineado al footer del landing (telvoice.cl). */
export function renderBrandWordmark(): string {
  return `<span class="tv-brand-wordmark">
    <span class="tv-brand-wordmark__name">${TV_BRAND.name}</span><span class="tv-brand-wordmark__tld">.cl</span>
  </span>`;
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
    ${renderBrandIsotipo(40)}
    <span class="tv-brand-lockup__text">
      ${renderBrandWordmark()}
      ${subtitle}
    </span>
  </a>${badge}`;
}

export function renderAuthBrand(title: string, subtitle: string): string {
  const titleHtml =
    title.trim().toLowerCase() === TV_BRAND.name
      ? renderBrandWordmark()
      : `<span class="tv-brand-wordmark tv-brand-wordmark--plain">${escapeHtml(title)}</span>`;
  return `<div class="tv-auth-brand">
    ${renderBrandIsotipo(48)}
    <div>
      <h1 class="tv-auth-title">${titleHtml}</h1>
      <p class="tv-auth-sub">${escapeHtml(subtitle)}</p>
    </div>
  </div>`;
}
