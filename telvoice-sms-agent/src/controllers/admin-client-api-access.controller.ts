import type { NextFunction, Request, Response } from "express";
import { requireSuperadmin, subjectFromAdmin } from "../auth/authorization.js";
import { getCurrentUserProfile } from "../services/userProfileService.js";
import { setAdminClientApiAccess } from "../services/adminClientApiAccessService.js";
import { AppError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";

function parseEnabled(body: Record<string, unknown> | undefined): boolean {
  const value = body?.enabled;
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  throw new AppError('Campo "enabled" booleano requerido.', 400);
}

async function assertSuperAdminActor(req: Request): Promise<void> {
  const admin = req.adminUser;
  if (!admin) {
    throw new AppError("Sesión admin requerida.", 401);
  }
  const profile = req.userProfile ?? (await getCurrentUserProfile(admin));
  const subject = subjectFromAdmin(admin, profile);
  if (!requireSuperadmin(subject)) {
    throw new AppError("Solo superadmin puede ejecutar esta acción.", 403);
  }
}

export async function postAdminClientApiAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await assertSuperAdminActor(req);
    const companyId = validateUuidParam(String(req.params.companyId ?? ""), "companyId");
    const enabled = parseEnabled(req.body as Record<string, unknown>);
    const admin = req.adminUser!;

    const result = await setAdminClientApiAccess({
      companyId,
      enabled,
      actor: {
        userId: admin.id,
        email: admin.email,
        role: admin.role,
      },
      ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: req.get("user-agent") ?? null,
    });

    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
}
