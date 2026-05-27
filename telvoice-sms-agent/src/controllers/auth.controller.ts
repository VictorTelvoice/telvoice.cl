import type { Request, Response, NextFunction } from "express";
import {
  bootstrapClientFromGoogle,
  getAdminJwtCookieName,
  getJwtCookieOptions,
} from "../services/googleClientBootstrapService.js";
import {
  getBearerTokenFromRequestHeader,
  verifySupabaseAccessToken,
} from "../services/supabaseAuthVerifyService.js";

export async function postBootstrapClient(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = getBearerTokenFromRequestHeader(req.headers.authorization);
    if (!token) {
      res.status(401).json({ ok: false, error: "missing_bearer_token" });
      return;
    }
    const verified = await verifySupabaseAccessToken(token);

    // Ignoramos body para datos críticos; solo sirve como compat.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const bodyEmail =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    if (bodyEmail && bodyEmail !== verified.email) {
      // Señal de posible manipulación de cliente.
      res.status(403).json({ ok: false, error: "email_mismatch" });
      return;
    }

    const { jwt } = await bootstrapClientFromGoogle({
      supabaseUserId: verified.userId,
      email: verified.email,
      name: verified.name,
      avatarUrl: verified.avatarUrl,
    });

    res.cookie(getAdminJwtCookieName(), jwt, getJwtCookieOptions());
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

