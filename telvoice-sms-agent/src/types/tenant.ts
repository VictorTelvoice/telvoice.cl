import type { UserRole } from "./roles.js";

export type CompanyStatus = "active" | "pending" | "suspended" | "blocked";

export interface CompanyRow {
  id: string;
  name: string;
  legal_name: string | null;
  rut: string | null;
  billing_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  country: string;
  status: CompanyStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ProfileStatus = "active" | "inactive" | "suspended";

export interface UserProfileRow {
  id: string;
  user_id: string | null;
  admin_user_id: string | null;
  company_id: string | null;
  full_name: string;
  email: string;
  role: UserRole | string;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
}

export interface CompanyUserRow {
  id: string;
  company_id: string;
  user_id: string | null;
  profile_id: string | null;
  role: UserRole | string;
  status: ProfileStatus;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  company_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

/** Contexto de autorización resuelto por sesión. */
export interface UserProfileContext {
  profileId: string | null;
  adminUserId: string | null;
  authUserId: string | null;
  companyId: string | null;
  email: string;
  fullName: string;
  role: string;
  status: string;
  /** true si el rol es interno Telvoice */
  isInternal: boolean;
  /** Perfil cargado desde Supabase (false = fallback solo admin_users) */
  fromDatabase: boolean;
}
