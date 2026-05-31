import type { AdminSessionUser } from "../types/admin.js";
import {
  canAccessAdminPanel,
  canAccessClientPanel,
  isClientRole,
  isSuperadminRole,
  isTelvoiceInternalRole,
  normalizeRole,
} from "../types/roles.js";
import type { UserProfileContext } from "../types/tenant.js";

export type AuthSubject = {
  role: string;
  companyId?: string | null;
  id?: string;
};

export function subjectFromAdmin(
  admin: AdminSessionUser,
  profile?: UserProfileContext | null,
): AuthSubject {
  const adminRole = normalizeRole(admin.role);
  const profileRole = profile ? normalizeRole(profile.role) : null;
  // admin_users es la fuente de verdad para roles internos; el perfil cliente no debe degradar superadmin.
  const role = canAccessAdminPanel(adminRole)
    ? adminRole
    : (profileRole ?? adminRole);

  return {
    role,
    companyId: profile?.companyId ?? admin.companyId ?? null,
    id: profile?.profileId ?? admin.id,
  };
}

export function subjectFromProfile(profile: UserProfileContext): AuthSubject {
  return {
    role: profile.role,
    companyId: profile.companyId ?? undefined,
    id: profile.profileId ?? profile.adminUserId ?? undefined,
  };
}

export function isSuperadmin(subject: AuthSubject): boolean {
  return isSuperadminRole(subject.role);
}

export function isTelvoiceInternal(subject: AuthSubject): boolean {
  return isTelvoiceInternalRole(subject.role);
}

export function canAccessAdmin(subject: AuthSubject): boolean {
  return canAccessAdminPanel(subject.role);
}

export function canAccessClient(subject: AuthSubject): boolean {
  return canAccessClientPanel(subject.role);
}

/** Superadmin o rol interno con acceso operativo. */
export function requireInternalRole(subject: AuthSubject): boolean {
  return isTelvoiceInternal(subject);
}

export function requireSuperadmin(subject: AuthSubject): boolean {
  return isSuperadmin(subject);
}

export function requireCompanyAccess(
  subject: AuthSubject,
  companyId: string,
): boolean {
  if (isSuperadmin(subject)) {
    return true;
  }
  if (isTelvoiceInternal(subject)) {
    return true;
  }
  if (!subject.companyId) {
    return false;
  }
  return subject.companyId === companyId;
}

export function canManageCompany(
  subject: AuthSubject,
  companyId: string,
): boolean {
  if (isSuperadmin(subject)) {
    return true;
  }
  const role = normalizeRole(subject.role);
  if (role === "client_owner" || role === "client_admin") {
    return subject.companyId === companyId;
  }
  return false;
}

export function canViewCompanyData(
  subject: AuthSubject,
  companyId: string,
): boolean {
  if (requireCompanyAccess(subject, companyId)) {
    return true;
  }
  if (isClientRole(subject.role) && subject.companyId === companyId) {
    return true;
  }
  return false;
}

/** Rutas sensibles solo para superadmin (config crítica, proveedores, etc.). */
export function canAccessSensitiveAdminConfig(subject: AuthSubject): boolean {
  return isSuperadmin(subject);
}

export function canAccessFinanceAdmin(subject: AuthSubject): boolean {
  const role = normalizeRole(subject.role);
  return (
    isSuperadmin(subject) ||
    role === "telvoice_finance" ||
    role === "telvoice_operator"
  );
}
