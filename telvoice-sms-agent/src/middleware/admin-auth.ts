import type { NextFunction, Request, Response } from "express";
import { canAccessAdmin, subjectFromAdmin } from "../auth/authorization.js";
import {
  getAdminJwtCookieName,
  getClientJwtCookieName,
  resolveAdminSession,
  verifyAdminToken,
} from "../services/adminAuthService.js";
import { canAccessClientPanel } from "../types/roles.js";
import { getCurrentUserProfile } from "../services/userProfileService.js";
import type { AdminSessionUser } from "../types/admin.js";
import type { UserProfileContext } from "../types/tenant.js";
import { renderAdminForbiddenPage } from "../views/admin-ui/forbidden-page.js";

const JWT_COOKIE_OPTS = { path: "/" };

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

async function loadSessionFromCookie(
  req: Request,
  cookieName: string,
): Promise<void> {
  const token = req.cookies?.[cookieName] as string | undefined;
  if (!token) {
    return;
  }

  const decoded = verifyAdminToken(token);
  if (!decoded) {
    return;
  }

  const admin = await resolveAdminSession(decoded.id);
  if (admin) {
    req.adminUser = admin;
    await attachProfile(req);
  }
}

function adminAuthSubject(req: Request) {
  if (!req.adminUser) {
    return null;
  }
  return subjectFromAdmin(req.adminUser, req.userProfile);
}

/** Cookie tv_admin_session con rol cliente (legacy): no es sesión admin válida. */
function clearInvalidAdminCookie(req: Request, res: Response): void {
  res.clearCookie(getAdminJwtCookieName(), JWT_COOKIE_OPTS);
  req.adminUser = undefined;
  req.userProfile = null;
}

/** Solo cookie de admin; ignora tv_client_session. Invalida legacy cliente en tv_admin_session. */
export async function loadAdminSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const hadAdminCookie = Boolean(req.cookies?.[getAdminJwtCookieName()]);
  await loadSessionFromCookie(req, getAdminJwtCookieName());

  if (req.adminUser) {
    const subject = adminAuthSubject(req);
    if (!subject || !canAccessAdmin(subject)) {
      if (hadAdminCookie) {
        clearInvalidAdminCookie(req, res);
      } else {
        req.adminUser = undefined;
        req.userProfile = null;
      }
    }
  }

  next();
}

/**
 * Cookie de cliente; fallback a cookie admin legacy solo para cuentas cliente
 * (migración suave sin afectar login admin independiente).
 */
export async function loadClientSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  await loadSessionFromCookie(req, getClientJwtCookieName());

  if (!req.adminUser) {
    const legacyToken = req.cookies?.[getAdminJwtCookieName()] as string | undefined;
    if (legacyToken) {
      const decoded = verifyAdminToken(legacyToken);
      if (decoded && canAccessClientPanel(decoded.role)) {
        const admin = await resolveAdminSession(decoded.id);
        if (admin) {
          req.adminUser = admin;
          await attachProfile(req);
        }
      }
    }
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
    clearInvalidAdminCookie(req, res);
    const nextUrl = encodeURIComponent(req.originalUrl || "/admin");
    res.redirect(`/admin/login?next=${nextUrl}`);
    return;
  }

  next();
}

/** Solo para /admin/login y /admin/register: nunca redirige a /app. */
export function redirectIfAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.adminUser) {
    next();
    return;
  }

  const subject = adminAuthSubject(req);
  if (subject && canAccessAdmin(subject)) {
    res.redirect("/admin");
    return;
  }

  if (req.cookies?.[getAdminJwtCookieName()]) {
    clearInvalidAdminCookie(req, res);
  }

  next();
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
