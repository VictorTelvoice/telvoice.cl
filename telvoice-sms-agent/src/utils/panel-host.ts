import type { Request } from "express";
import { env } from "../config/env.js";

export type PanelHostKind = "admin" | "agent";

function normalizeHostname(raw: string): string {
  return raw.trim().toLowerCase().split(":")[0] ?? "";
}

/** Hostname del request (respeta trust proxy). */
export function getRequestHostname(req: Request): string {
  const fromExpress = req.hostname?.trim();
  if (fromExpress) {
    return normalizeHostname(fromExpress);
  }
  const header = req.headers.host;
  if (typeof header === "string" && header.trim()) {
    return normalizeHostname(header);
  }
  return "localhost";
}

export function isAdminPanelHost(req: Request): boolean {
  const host = getRequestHostname(req);
  if (env.publicAdminHost && host === env.publicAdminHost) {
    return true;
  }
  if (env.adminPanelHostDev && host === env.adminPanelHostDev) {
    return true;
  }
  return false;
}

export function isAgentPanelHost(req: Request): boolean {
  return !isAdminPanelHost(req);
}

export function adminPanelBaseUrl(): string {
  return env.publicAdminUrl || env.publicAppUrl;
}

export function agentPanelBaseUrl(): string {
  return env.publicAppUrl;
}

export function adminPanelUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${adminPanelBaseUrl()}${normalized}`;
}

export function agentPanelUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${agentPanelBaseUrl()}${normalized}`;
}

/** Ruta de login admin según host (admin.telvoice.cl → /login). */
export function adminLoginPath(req: Request): string {
  return isAdminPanelHost(req) ? "/login" : "/admin/login";
}

export function adminLoginRedirect(req: Request, nextPath?: string): string {
  const base = adminLoginPath(req);
  if (!nextPath) {
    return base;
  }
  return `${base}?next=${encodeURIComponent(nextPath)}`;
}

/** Mapea /admin/login en agent → /login en admin (conserva query). */
export function mapAgentAdminPathToAdminHost(req: Request): string {
  const path = req.path;
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

  if (path === "/admin/login" || path.startsWith("/admin/login/")) {
    return `/login${query}`;
  }

  return `${req.originalUrl.startsWith("/") ? req.originalUrl : `/${req.originalUrl}`}`;
}
