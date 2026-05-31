import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AdminJwtPayload, AdminSessionUser } from "../types/admin.js";
import { ROLES } from "../types/roles.js";
import { ensureInternalProfileForAdmin } from "./userProfileService.js";
import { AppError } from "../utils/errors.js";
import {
  countAdminUsers,
  createAdminUser,
  findAdminByEmail,
  findAdminById,
  updateAdminUser,
} from "./adminUserService.js";

const BCRYPT_ROUNDS = 12;
const JWT_COOKIE_ADMIN = "tv_admin_session";
const JWT_COOKIE_CLIENT = "tv_client_session";
const JWT_EXPIRES_IN = "8h";

/** Sesión panel interno `/admin`. */
export function getAdminJwtCookieName(): string {
  return JWT_COOKIE_ADMIN;
}

/** Sesión panel cliente `/app` (independiente de admin). */
export function getClientJwtCookieName(): string {
  return JWT_COOKIE_CLIENT;
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

function isConfiguredSuperadminLogin(email: string, password: string): boolean {
  const configuredEmail = env.admin.superadminEmail?.trim().toLowerCase();
  const configuredPassword = env.admin.superadminPassword;
  if (!configuredEmail || !configuredPassword) {
    return false;
  }
  return email.trim().toLowerCase() === configuredEmail && password === configuredPassword;
}

/** Eleva o crea superadmin cuando el login coincide con SUPERADMIN_EMAIL/PASSWORD del entorno. */
export async function ensureSuperadminFromEnvCredentials(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<AdminSessionUser | null> {
  const email = input.email.trim().toLowerCase();
  if (!isConfiguredSuperadminLogin(email, input.password)) {
    return null;
  }

  const password_hash = await hashPassword(input.password);
  const existing = await findAdminByEmail(email);

  if (existing) {
    const admin = await updateAdminUser(existing.id, {
      role: ROLES.SUPERADMIN,
      password_hash,
    });
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  }

  const admin = await createAdminUser({
    email,
    password_hash,
    name: input.name?.trim() || email.split("@")[0] || "Superadmin",
    role: ROLES.SUPERADMIN,
  });

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

/** Login panel admin: credenciales normales o superadmin seedeado por env. */
export async function authenticateAdminForAdminPanel(
  email: string,
  password: string,
): Promise<AdminSessionUser | null> {
  const admin = await authenticateAdmin(email, password);
  if (admin) {
    return admin;
  }
  return ensureSuperadminFromEnvCredentials({ email, password });
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

const GMAIL_DOMAIN_RE = /^[^\s@]+@(gmail\.com|googlemail\.com)$/i;

export function isGmailAddress(email: string): boolean {
  return GMAIL_DOMAIN_RE.test(email.trim());
}

/** Registro abierto si ADMIN_SIGNUP_ENABLED=true o aún no hay admins en BD. */
export async function isAdminSignupOpen(): Promise<boolean> {
  if (env.admin.signupEnabled) {
    return true;
  }
  try {
    return (await countAdminUsers()) === 0;
  } catch {
    return false;
  }
}

export async function registerGmailAdmin(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ user: AdminSessionUser } | { error: string }> {
  if (!(await isAdminSignupOpen())) {
    return { error: "El registro no está habilitado. Contacta al administrador." };
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;

  if (!isGmailAddress(email)) {
    return {
      error: "Usa una cuenta @gmail.com o @googlemail.com.",
    };
  }

  if (name.length < 2) {
    return { error: "Indica tu nombre (mínimo 2 caracteres)." };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const existing = await findAdminByEmail(email);
  if (existing) {
    return { error: "Ya existe una cuenta con ese correo. Inicia sesión." };
  }

  const password_hash = await hashPassword(password);
  const isFirstUser = (await countAdminUsers()) === 0;
  const admin = await createAdminUser({
    email,
    password_hash,
    name,
    role: isFirstUser ? ROLES.SUPERADMIN : ROLES.TELVOICE_OPERATOR,
  });

  const user: AdminSessionUser = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };

  await ensureInternalProfileForAdmin(user);

  return { user };
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
    role: ROLES.SUPERADMIN,
  });

  await ensureInternalProfileForAdmin({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
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
