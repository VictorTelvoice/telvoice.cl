import type { CompanyRow } from "./tenant.js";
import type { AdminClientAuditInfo } from "./adminClientsList.js";

export type AdminClientActionType =
  | "client.update_profile"
  | "client.suspend_sending"
  | "client.reactivate_sending"
  | "client.resend_welcome"
  | "client.resend_receipt"
  | "client.archive_qa";

export type AdminActionLogRow = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  company_id: string;
  company_snapshot?: Record<string, unknown>;
  action_type: AdminClientActionType | string;
  previous_state: Record<string, unknown>;
  new_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type ClientActionPermission = {
  allowed: boolean;
  reason?: string;
  needsProtectedOverride?: boolean;
};

export type ClientActionPermissions = {
  updateProfile: ClientActionPermission;
  suspendSending: ClientActionPermission;
  reactivateSending: ClientActionPermission;
  resendWelcome: ClientActionPermission;
  resendReceipt: ClientActionPermission;
  archiveQa: ClientActionPermission;
};

export type ClientActionContext = {
  company: CompanyRow;
  audit: AdminClientAuditInfo;
  archivedAt: string | null;
  classification: string;
  isProdReal: boolean;
  isQa: boolean;
  isProtected: boolean;
  welcomeOrderId: string | null;
};

export type ClientActionActor = {
  userId: string;
  email: string;
  role: string;
};

export type ClientActionRequestMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ClientActionResult = {
  success: boolean;
  dryRun?: boolean;
  message: string;
  actionType: AdminClientActionType;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type UpdateClientProfileInput = {
  name?: string;
  billing_email?: string;
  country?: string;
  contact_name?: string;
  contact_phone?: string;
  legal_name?: string;
};
