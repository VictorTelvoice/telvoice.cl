import type { NextFunction, Request, Response } from "express";
import {
  getAdminJwtCookieName,
  resolveAdminSession,
  verifyAdminToken,
} from "../services/adminAuthService.js";
import type { AdminSessionUser } from "../types/admin.js";

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminSessionUser;
    }
  }
}

export async function loadAdminSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[getAdminJwtCookieName()] as string | undefined;
  if (!token) {
    next();
    return;
  }

  const decoded = verifyAdminToken(token);
  if (!decoded) {
    next();
    return;
  }

  const admin = await resolveAdminSession(decoded.id);
  if (admin) {
    req.adminUser = admin;
  }

  next();
}

export function requireAdminPage(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.adminUser) {
    next();
    return;
  }

  const nextUrl = encodeURIComponent(req.originalUrl || "/admin");
  res.redirect(`/admin/login?next=${nextUrl}`);
}

export function redirectIfAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.adminUser) {
    res.redirect("/admin");
    return;
  }
  next();
}
