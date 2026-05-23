import type { Request, Response } from "express";
import { renderAppPlaceholder } from "../middleware/client-panel-auth.js";

export function getAppHome(req: Request, res: Response): void {
  renderAppPlaceholder(req, res);
}

export function getAppSectionPlaceholder(req: Request, res: Response): void {
  renderAppPlaceholder(req, res);
}
