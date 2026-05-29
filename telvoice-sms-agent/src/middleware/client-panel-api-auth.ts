import type { NextFunction, Request, Response } from "express";
import {
  canAccessClient,
  isSuperadmin,
  subjectFromAdmin,
} from "../auth/authorization.js";
import { isTelvoiceInternalRole } from "../types/roles.js";
import { getCurrentUserProfile } from "../services/userProfileService.js";

/** API JSON /app — requiere empresa asociada al usuario autenticado. */
export async function requireClientPanelApi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.adminUser) {
    res.status(401).json({ success: false, error: "No autenticado." });
    return;
  }

  const profile =
    req.userProfile ?? (await getCurrentUserProfile(req.adminUser));
  const subject = subjectFromAdmin(req.adminUser, profile);

  if (isTelvoiceInternalRole(subject.role) && !isSuperadmin(subject)) {
    res.status(403).json({
      success: false,
      error: "Esta API es solo para usuarios del panel cliente.",
    });
    return;
  }

  if (!canAccessClient(subject)) {
    res.status(403).json({ success: false, error: "Sin acceso al panel cliente." });
    return;
  }

  if (!profile?.companyId) {
    res.status(403).json({
      success: false,
      error: "Tu usuario no tiene empresa asociada.",
    });
    return;
  }

  req.userProfile = profile;
  req.adminUser = {
    ...req.adminUser,
    role: profile.role,
    companyId: profile.companyId,
    profileId: profile.profileId,
  };

  next();
}
