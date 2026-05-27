import type { Request, Response } from "express";
import {
  renderAuthCallbackPage,
  renderClaimManualReviewPage,
  renderClientLoginPage,
} from "../views/app-ui/client-google-auth-pages.js";

export function getClientLoginPage(req: Request, res: Response): void {
  const error =
    typeof req.query.error === "string" ? req.query.error : undefined;
  const detail =
    typeof req.query.detail === "string" ? req.query.detail : undefined;
  res.type("html").send(renderClientLoginPage({ error, detail }));
}

export function getAuthCallbackPage(_req: Request, res: Response): void {
  res.type("html").send(renderAuthCallbackPage());
}

export function getClaimManualReviewPage(_req: Request, res: Response): void {
  res.type("html").send(renderClaimManualReviewPage());
}

