import type { NextFunction, Request, Response } from "express";
import { isClientPanelAgentLineEnabled } from "../config/env.js";

/** Oculta páginas del módulo agente/línea cuando el flag está desactivado. */
export function requireClientPanelAgentLinePage(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isClientPanelAgentLineEnabled()) {
    next();
    return;
  }
  res.redirect(303, "/app/dashboard");
}

/** API JSON del módulo agente/línea — 404 cuando el flag está desactivado. */
export function requireClientPanelAgentLineApi(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isClientPanelAgentLineEnabled()) {
    next();
    return;
  }
  res.status(404).json({ success: false, error: "Módulo no disponible." });
}
