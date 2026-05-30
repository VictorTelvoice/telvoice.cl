import type { NextFunction, Request, Response } from "express";
import {
  canAccessAdmin,
  canAccessClient,
  isSuperadmin,
  subjectFromAdmin,
} from "../auth/authorization.js";
import { isTelvoiceInternalRole } from "../types/roles.js";
import { getCurrentUserProfile } from "../services/userProfileService.js";
import {
  renderAppLoginRequiredPage,
} from "../views/app-ui/placeholder-page.js";
import { renderAdminForbiddenPage } from "../views/admin-ui/forbidden-page.js";
import { adminPanelUrl } from "../utils/panel-host.js";

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
    res.redirect(`/login?next=${nextUrl}`);
    return;
  }

  const profile =
    req.userProfile ?? (await getCurrentUserProfile(req.adminUser));
  const subject = subjectFromAdmin(req.adminUser, profile);

  if (isTelvoiceInternalRole(subject.role) && !isSuperadmin(subject)) {
    res.redirect(adminPanelUrl("/admin"));
    return;
  }

  if (!canAccessClient(subject) && !canAccessAdmin(subject)) {
    res
      .status(403)
      .type("html")
      .send(renderAdminForbiddenPage({ adminName: req.adminUser.name }));
    return;
  }

  if (canAccessAdmin(subject) && !canAccessClient(subject)) {
    res.redirect(adminPanelUrl("/admin"));
    return;
  }

  if (!profile) {
    res.status(403).type("html").send(renderAppLoginRequiredPage());
    return;
  }

  req.userProfile = profile;
  next();
}
