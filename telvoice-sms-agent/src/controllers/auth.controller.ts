import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import {
  bootstrapClientFromGoogle,
  getAdminJwtCookieName,
  getJwtCookieOptions,
} from "../services/googleClientBootstrapService.js";

export async function postBootstrapClient(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const supabaseUserId = String(body.supabase_user_id ?? "").trim();
    const email = String(body.email ?? "").trim();
    const name = String(body.name ?? "").trim();
    const avatarUrl =
      typeof body.avatar_url === "string" ? body.avatar_url : null;

    if (!supabaseUserId || supabaseUserId.length < 10) {
      throw new AppError("supabase_user_id inválido.", 400);
    }
    if (!email.includes("@")) {
      throw new AppError("email inválido.", 400);
    }
    if (!name) {
      throw new AppError("name requerido.", 400);
    }

    const { jwt } = await bootstrapClientFromGoogle({
      supabaseUserId,
      email,
      name,
      avatarUrl,
    });

    res.cookie(getAdminJwtCookieName(), jwt, getJwtCookieOptions());
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

