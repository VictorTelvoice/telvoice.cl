import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AdminJwtPayload, AdminSessionUser } from "../types/admin.js";
import { AppError } from "../utils/errors.js";
import {
  createAdminUser,
  findAdminByEmail,
  findAdminById,
} from "./adminUserService.js";

const BCRYPT_ROUNDS = 12;
const JWT_COOKIE = "tv_admin_session";
const JWT_EXPIRES_IN = "8h";

export function getAdminJwtCookieName(): string {
  return JWT_COOKIE;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAdminToken(user: AdminSessionUser): string {
  if (!env.admin.jwtSecret) {
    throw new AppError("JWT_SECRET no configurado.", 503, "AUTH_NOT_CONFIGURED");
  }

  const payload: AdminJwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  return jwt.sign(payload, env.admin.jwtSecret, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "telvoice-sms-agent",
    audience: "telvoice-admin",
  });
}

export function verifyAdminToken(token: string): AdminSessionUser | null {
  if (!env.admin.jwtSecret) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, env.admin.jwtSecret, {
      issuer: "telvoice-sms-agent",
      audience: "telvoice-admin",
    }) as AdminJwtPayload;

    return {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

export async function authenticateAdmin(
  email: string,
  password: string,
): Promise<AdminSessionUser | null> {
  const admin = await findAdminByEmail(email);
  if (!admin) {
    return null;
  }

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) {
    return null;
  }

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

export async function resolveAdminSession(
  adminId: string,
): Promise<AdminSessionUser | null> {
  const admin = await findAdminById(adminId);
  if (!admin) {
    return null;
  }

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

export async function seedSuperadminIfMissing(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ created: boolean; email: string }> {
  const existing = await findAdminByEmail(input.email);
  if (existing) {
    return { created: false, email: existing.email };
  }

  const password_hash = await hashPassword(input.password);
  const admin = await createAdminUser({
    email: input.email,
    password_hash,
    name: input.name,
    role: "superadmin",
  });

  return { created: true, email: admin.email };
}

export function getJwtCookieOptions() {
  const isProd = env.nodeEnv === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}
