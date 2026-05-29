import type { Request } from "express";
import type { AdminSessionUser } from "../types/admin.js";
import type { UserProfileContext } from "../types/tenant.js";

export type SupportTicketAuditAction =
  | "status_changed"
  | "priority_changed"
  | "public_reply_sent"
  | "internal_note_added";

export type SupportTicketAuditActor = {
  actorType: "admin";
  actorName: string;
  actorEmail: string;
  role: string;
};

export type SupportTicketAuditEvent = {
  id: string;
  action: SupportTicketAuditAction;
  from?: string;
  to?: string;
  detail?: string;
  actorType: "admin";
  actorName: string;
  actorEmail: string;
  role?: string;
  createdAt: string;
};

export type SupportTicketAuditMetadata = {
  audit_log?: SupportTicketAuditEvent[];
  lastHandledBy?: {
    name: string;
    email: string;
    role: string;
    at: string;
  };
};

function newAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildAdminAuditActor(
  admin: AdminSessionUser,
  profile?: UserProfileContext | null,
): SupportTicketAuditActor {
  return {
    actorType: "admin",
    actorName: admin.name?.trim() || "Equipo Telvoice",
    actorEmail: admin.email.trim().toLowerCase(),
    role: profile?.role ?? admin.role,
  };
}

export function buildAdminAuditActorFromRequest(req: Request): SupportTicketAuditActor {
  if (!req.adminUser) {
    return {
      actorType: "admin",
      actorName: "Equipo Telvoice",
      actorEmail: "",
      role: "telvoice_operator",
    };
  }
  return buildAdminAuditActor(req.adminUser, req.userProfile);
}

function asMetadataRecord(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return { ...metadata };
  }
  return {};
}

function parseAuditLog(metadata: Record<string, unknown>): SupportTicketAuditEvent[] {
  const raw = metadata.audit_log;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is SupportTicketAuditEvent =>
      !!item &&
      typeof item === "object" &&
      typeof (item as SupportTicketAuditEvent).action === "string",
  );
}

export function appendSupportTicketAuditEvent(
  metadata: Record<string, unknown> | null | undefined,
  actor: SupportTicketAuditActor,
  event: Omit<SupportTicketAuditEvent, "id" | "createdAt" | "actorType" | "actorName" | "actorEmail" | "role"> &
    Partial<Pick<SupportTicketAuditEvent, "id" | "createdAt">>,
): Record<string, unknown> {
  const base = asMetadataRecord(metadata);
  const at = event.createdAt ?? new Date().toISOString();
  const entry: SupportTicketAuditEvent = {
    id: event.id ?? newAuditId(),
    action: event.action,
    from: event.from,
    to: event.to,
    detail: event.detail,
    actorType: "admin",
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    role: actor.role,
    createdAt: at,
  };

  const audit_log = [...parseAuditLog(base), entry];
  return {
    ...base,
    audit_log,
    lastHandledBy: {
      name: actor.actorName,
      email: actor.actorEmail,
      role: actor.role,
      at,
    },
  };
}

export function getSupportTicketAuditLog(
  metadata: Record<string, unknown> | null | undefined,
): SupportTicketAuditEvent[] {
  return parseAuditLog(asMetadataRecord(metadata));
}

export function auditActionLabel(action: SupportTicketAuditAction): string {
  const labels: Record<SupportTicketAuditAction, string> = {
    status_changed: "Cambio de estado",
    priority_changed: "Cambio de prioridad",
    public_reply_sent: "Respuesta pública enviada",
    internal_note_added: "Nota interna agregada",
  };
  return labels[action] ?? action;
}

export function formatAuditChange(event: SupportTicketAuditEvent): string {
  if (event.from && event.to) {
    return `${event.from} → ${event.to}`;
  }
  if (event.to) {
    return event.to;
  }
  if (event.detail) {
    return event.detail.length > 120 ? `${event.detail.slice(0, 117)}…` : event.detail;
  }
  return "—";
}
