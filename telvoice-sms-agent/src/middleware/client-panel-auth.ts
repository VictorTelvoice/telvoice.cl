import type { NextFunction, Request, Response } from "express";
import {
  canAccessAdmin,
  canAccessClient,
  subjectFromAdmin,
} from "../auth/authorization.js";
import { getCurrentUserProfile } from "../services/userProfileService.js";
import {
  renderAppLoginRequiredPage,
  renderAppPlaceholderPage,
} from "../views/app-ui/placeholder-page.js";
import { renderAdminForbiddenPage } from "../views/admin-ui/forbidden-page.js";

/** Requiere sesión válida para rutas /app. */
export function requireClientPanelPage(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void enforceClientPanel(req, res, next);
}

async function enforceClientPanel(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.adminUser) {
    const nextUrl = encodeURIComponent(req.originalUrl || "/app");
    res.redirect(`/admin/login?next=${nextUrl}`);
    return;
  }

  const profile =
    req.userProfile ?? (await getCurrentUserProfile(req.adminUser));
  const subject = subjectFromAdmin(req.adminUser, profile);

  if (canAccessAdmin(subject) && !canAccessClient(subject)) {
    res.redirect("/admin");
    return;
  }

  if (!canAccessClient(subject) && !canAccessAdmin(subject)) {
    res
      .status(403)
      .type("html")
      .send(renderAdminForbiddenPage({ adminName: req.adminUser.name }));
    return;
  }

  if (!profile) {
    res.status(403).type("html").send(renderAppLoginRequiredPage());
    return;
  }

  req.userProfile = profile;
  next();
}

export function renderAppPlaceholder(
  req: Request,
  res: Response,
): void {
  const profile = req.userProfile;
  if (!profile) {
    res.status(403).type("html").send(renderAppLoginRequiredPage());
    return;
  }
  res.type("html").send(renderAppPlaceholderPage(profile));
}
