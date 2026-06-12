import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

const BASE_LANDING_ORIGINS = [
  "https://www.telvoice.cl",
  "https://telvoice.cl",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

function buildLandingOrigins(): Set<string> {
  const origins = new Set<string>(BASE_LANDING_ORIGINS);
  for (const origin of env.landingExtraOrigins) {
    origins.add(origin.replace(/\/$/, ""));
  }
  return origins;
}

const LANDING_ORIGINS = buildLandingOrigins();

function isPublicApiPath(req: Request): boolean {
  const url = req.originalUrl ?? req.url ?? "";
  return url.startsWith("/api/public");
}

export function landingPublicCors(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isPublicApiPath(req)) {
    next();
    return;
  }

  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (origin && LANDING_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
