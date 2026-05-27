import type { Request, Response } from "express";
import {
  renderAuthCallbackPage,
  renderClaimManualReviewPage,
  renderClientLoginPage,
} from "../views/app-ui/client-google-auth-pages.js";

export function getClientLoginPage(req: Request, res: Response): void {
  const error =
    typeof req.query.error === "string" ? req.query.error : undefined;
  res.type("html").send(renderClientLoginPage({ error }));
}

export function getAuthCallbackPage(_req: Request, res: Response): void {
  res.type("html").send(renderAuthCallbackPage());
}

export function getClaimManualReviewPage(_req: Request, res: Response): void {
  res.type("html").send(renderClaimManualReviewPage());
}

