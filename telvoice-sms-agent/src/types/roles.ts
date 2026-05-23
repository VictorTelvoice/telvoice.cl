/** Roles del ecosistema Telvoice SMS Agent. */
export const ROLES = {
  SUPERADMIN: "superadmin",
  TELVOICE_OPERATOR: "telvoice_operator",
  TELVOICE_FINANCE: "telvoice_finance",
  CLIENT_OWNER: "client_owner",
  CLIENT_ADMIN: "client_admin",
  CLIENT_OPERATOR: "client_operator",
  CLIENT_VIEWER: "client_viewer",
  /** Legacy: usuarios registrados antes de roles granulares. */
  LEGACY_ADMIN: "admin",
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const INTERNAL_ROLES: readonly UserRole[] = [
  ROLES.SUPERADMIN,
  ROLES.TELVOICE_OPERATOR,
  ROLES.TELVOICE_FINANCE,
  ROLES.LEGACY_ADMIN,
];

export const CLIENT_ROLES: readonly UserRole[] = [
  ROLES.CLIENT_OWNER,
  ROLES.CLIENT_ADMIN,
  ROLES.CLIENT_OPERATOR,
  ROLES.CLIENT_VIEWER,
];

export const ALL_ROLES: readonly UserRole[] = [
  ...INTERNAL_ROLES,
  ...CLIENT_ROLES,
];

/** Normaliza rol almacenado en BD (p. ej. admin → telvoice_operator). */
export function normalizeRole(role: string): UserRole {
  const r = role.trim().toLowerCase();
  if (r === ROLES.LEGACY_ADMIN) {
    return ROLES.TELVOICE_OPERATOR;
  }
  if ((ALL_ROLES as readonly string[]).includes(r)) {
    return r as UserRole;
  }
  return ROLES.CLIENT_VIEWER;
}

export function isSuperadminRole(role: string): boolean {
  return normalizeRole(role) === ROLES.SUPERADMIN;
}

export function isTelvoiceInternalRole(role: string): boolean {
  const n = normalizeRole(role);
  return (INTERNAL_ROLES as readonly string[]).includes(n);
}

export function isClientRole(role: string): boolean {
  const n = normalizeRole(role);
  return (CLIENT_ROLES as readonly string[]).includes(n);
}

export function canAccessAdminPanel(role: string): boolean {
  const n = normalizeRole(role);
  return (
    n === ROLES.SUPERADMIN ||
    n === ROLES.TELVOICE_OPERATOR ||
    n === ROLES.TELVOICE_FINANCE
  );
}

export function canAccessClientPanel(role: string): boolean {
  const n = normalizeRole(role);
  return (
    (CLIENT_ROLES as readonly string[]).includes(n) ||
    n === ROLES.SUPERADMIN
  );
}

/** Cliente puede crear órdenes y operar (no solo lectura). */
export function canOperateClientPanel(role: string): boolean {
  const n = normalizeRole(role);
  return (
    n === ROLES.CLIENT_OWNER ||
    n === ROLES.CLIENT_ADMIN ||
    n === ROLES.CLIENT_OPERATOR ||
    n === ROLES.SUPERADMIN
  );
}

export function roleDisplayLabel(role: string): string {
  const labels: Record<string, string> = {
    [ROLES.SUPERADMIN]: "Superadmin",
    [ROLES.TELVOICE_OPERATOR]: "Operador Telvoice",
    [ROLES.TELVOICE_FINANCE]: "Finanzas Telvoice",
    [ROLES.CLIENT_OWNER]: "Dueño empresa",
    [ROLES.CLIENT_ADMIN]: "Admin empresa",
    [ROLES.CLIENT_OPERATOR]: "Operador empresa",
    [ROLES.CLIENT_VIEWER]: "Solo lectura",
    [ROLES.LEGACY_ADMIN]: "Operador Telvoice",
  };
  return labels[normalizeRole(role)] ?? role;
}
