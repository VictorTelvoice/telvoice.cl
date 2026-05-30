import type { NextFunction, Request, Response } from "express";
import {
  adminPanelUrl,
  agentPanelUrl,
  isAdminPanelHost,
  isAgentPanelHost,
  mapAgentAdminPathToAdminHost,
} from "../utils/panel-host.js";

const AGENT_ONLY_PREFIXES = [
  "/app",
  "/auth/callback",
  "/claim/manual-review",
  "/checkout/success",
] as const;

function startsWithAny(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Separa contexto admin (admin.telvoice.cl) vs cliente/API (agent.telvoice.cl).
 * Mismo proceso Node; el host decide redirecciones y qué login mostrar en /login.
 */
export function hostRoutingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAgentPanelHost(req) && (req.path === "/admin" || req.path.startsWith("/admin/"))) {
    res.redirect(302, adminPanelUrl(mapAgentAdminPathToAdminHost(req)));
    return;
  }

  if (isAdminPanelHost(req)) {
    if (startsWithAny(req.path, AGENT_ONLY_PREFIXES)) {
      res.redirect(302, agentPanelUrl(req.originalUrl));
      return;
    }

    if (req.path === "/admin/login" || req.path.startsWith("/admin/login/")) {
      const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      res.redirect(302, `/login${query}`);
      return;
    }

    if (req.method === "GET" && req.path === "/login") {
      return next();
    }

    if (req.method === "GET" && (req.path === "/auth/callback" || req.path === "/claim/manual-review")) {
      res.redirect(302, agentPanelUrl(req.originalUrl));
      return;
    }
  }

  next();
}
