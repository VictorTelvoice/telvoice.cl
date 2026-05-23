import type { UserRole } from "./roles.js";

/** Rol almacenado en admin_users (texto libre; validar con normalizeRole). */
export type AdminRole = UserRole | "admin" | string;

export interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface AdminJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
}

export interface AdminSessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Perfil multi-tenant (cuando existe en user_profiles). */
  profileId?: string | null;
  companyId?: string | null;
}
