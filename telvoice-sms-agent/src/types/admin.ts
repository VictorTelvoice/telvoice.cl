export type AdminRole = "superadmin";

export interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: AdminRole;
  created_at: string;
  updated_at: string;
}

export interface AdminJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: AdminRole;
}

export interface AdminSessionUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}
