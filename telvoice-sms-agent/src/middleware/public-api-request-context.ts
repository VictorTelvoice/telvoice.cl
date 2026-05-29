import type { NextFunction, Request, Response } from "express";
import { generatePublicApiRequestId } from "../utils/public-api-request-id.js";

declare global {
  namespace Express {
    interface Request {
      publicApiRequestId?: string;
      publicApiStartedAt?: number;
    }
  }
}

export function publicApiRequestContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  req.publicApiRequestId = generatePublicApiRequestId();
  req.publicApiStartedAt = Date.now();
  next();
}

export function getPublicApiRequestId(req: Request): string {
  return req.publicApiRequestId ?? generatePublicApiRequestId();
}

export function getPublicApiDurationMs(req: Request): number | null {
  if (typeof req.publicApiStartedAt !== "number") {
    return null;
  }
  return Math.max(0, Date.now() - req.publicApiStartedAt);
}
