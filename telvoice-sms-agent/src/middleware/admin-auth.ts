import type { NextFunction, Request, Response } from "express";
import {
  canAccessAdmin,
  canAccessClient,
  subjectFromAdmin,
} from "../auth/authorization.js";
import {
  getAdminJwtCookieName,
  resolveAdminSession,
  verifyAdminToken,
} from "../services/adminAuthService.js";
import { getCurrentUserProfile } from "../services/userProfileService.js";
import type { AdminSessionUser } from "../types/admin.js";
import type { UserProfileContext } from "../types/tenant.js";
import { renderAdminForbiddenPage } from "../views/admin-ui/forbidden-page.js";

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminSessionUser;
      userProfile?: UserProfileContext | null;
    }
  }
}

async function attachProfile(req: Request): Promise<void> {
  if (!req.adminUser) {
    req.userProfile = null;
    return;
  }

  const profile = await getCurrentUserProfile(req.adminUser);
  req.userProfile = profile;

  if (profile) {
    req.adminUser = {
      ...req.adminUser,
      role: profile.role,
      companyId: profile.companyId,
      profileId: profile.profileId,
    };
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
    await attachProfile(req);
  }

  next();
}

export function requireAdminPage(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void enforceAdminPanelAccess(req, res, next);
}

async function enforceAdminPanelAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.adminUser) {
    const nextUrl = encodeURIComponent(req.originalUrl || "/admin");
    res.redirect(`/admin/login?next=${nextUrl}`);
    return;
  }

  const profile =
    req.userProfile ?? (await getCurrentUserProfile(req.adminUser));
  const subject = subjectFromAdmin(req.adminUser, profile);

  if (!canAccessAdmin(subject)) {
    if (canAccessClient(subject)) {
      res.redirect("/app");
      return;
    }

    res
      .status(403)
      .type("html")
      .send(
        renderAdminForbiddenPage({
          adminName: req.adminUser.name,
        }),
      );
    return;
  }

  next();
}

export function redirectIfAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.adminUser) {
    next();
    return;
  }

  const subject = subjectFromAdmin(req.adminUser, req.userProfile);
  if (canAccessClient(subject) && !canAccessAdmin(subject)) {
    res.redirect("/app");
    return;
  }

  res.redirect("/admin");
}

export function getAdminForbiddenPage(
  req: Request,
  res: Response,
): void {
  res
    .status(403)
    .type("html")
    .send(
      renderAdminForbiddenPage({
        adminName: req.adminUser?.name,
      }),
    );
}
