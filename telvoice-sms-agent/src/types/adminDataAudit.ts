export const AUDIT_CLASSIFICATIONS = [
  "PROD_REAL",
  "PROD_INTERNAL",
  "QA_TEST",
  "DEMO_SEED",
  "ORPHAN",
  "REVIEW_REQUIRED",
] as const;

export type AuditClassification = (typeof AUDIT_CLASSIFICATIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  "company",
  "user_profile",
  "sms_order",
  "wallet",
  "wallet_transaction",
  "billing_invoice",
  "billing_event",
  "email_log",
  "billing_email_log",
  "sms_campaign",
  "panel_sms_message",
  "panel_sms_delivery_event",
  "sms_dlr_event",
  "sms_send_queue",
  "contact",
  "contact_list",
  "support_ticket",
  "sms_template",
  "wholesale_provider",
  "wholesale_customer",
  "wholesale_opportunity",
  "wholesale_route",
  "sms_provider",
  "sms_rate_plan",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type AdminDataAuditFlagRow = {
  id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  classification: AuditClassification;
  reason: string | null;
  confidence: number;
  protected: boolean;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  archived_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AuditTableReport = {
  table: string;
  entityType: AuditEntityType;
  total: number;
  samples: Record<string, unknown>[];
};

export type AuditReadOnlyReport = {
  generatedAt: string;
  tables: AuditTableReport[];
  classificationPreview: Record<AuditClassification, number>;
};

export type AuditSummary = {
  totalCompanies: number;
  totalRealClients: number;
  totalRealOrders: number;
  totalQaOrders: number;
  totalRealWallets: number;
  totalRealMessages: number;
  totalQaMessages: number;
  totalOrphans: number;
  totalReviewRequired: number;
  totalFlags: number;
  totalProtected: number;
  totalArchived: number;
  lastAuditAt: string | null;
  flagCounts: Record<AuditClassification, number>;
};

export type AuditGenerateJobStatus = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  actorEmail: string | null;
  lastError: string | null;
  lastResult: {
    inserted: number;
    byClassification: Record<AuditClassification, number>;
  } | null;
};

export type ProtectedClientBundle = {
  email: string;
  fullName: string | null;
  company: Record<string, unknown> | null;
  userProfile: Record<string, unknown> | null;
  orders: Record<string, unknown>[];
  wallets: Record<string, unknown>[];
  walletTransactions: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  emailLogs: Record<string, unknown>[];
  billingEmailLogs: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  deliveryEvents: Record<string, unknown>[];
  messageCount: number;
  emailCount: number;
};

export type ClientPurchaseAuditReport = {
  email: string;
  generatedAt: string;
  profile: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
  orders: Record<string, unknown>[];
  payment: {
    duplicateMercadoPagoNotifications: boolean;
    mercadoPagoNotificationCount: number;
    duplicateCredits: boolean;
    purchaseCreditCount: number;
    duplicateInvoices: boolean;
    invoiceCount: number;
    duplicateReceiptEmails: boolean;
    receiptEmailCount: number;
    idempotencyOk: boolean;
    walletCreditedOnce: boolean;
    clientActivated: boolean;
  };
  wallet: Record<string, unknown> | null;
  walletTransactions: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  emailLogs: Record<string, unknown>[];
  billingEmailLogs: Record<string, unknown>[];
  billingEvents: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  deliveryEvents: Record<string, unknown>[];
  webhookErrors: Record<string, unknown>[];
  timeline: Array<{
    at: string;
    kind: string;
    label: string;
    detail?: string;
  }>;
  issues: string[];
  ok: boolean;
};

export type CleanupDryRunResult = {
  archiveCandidates: Array<{
    entityType: AuditEntityType;
    entityId: string;
    classification: AuditClassification;
    reason: string | null;
    action: "archive_status" | "archive_metadata" | "flag_only";
  }>;
  hardDeleteCandidates: Array<{
    entityType: AuditEntityType;
    entityId: string;
    classification: AuditClassification;
    reason: string | null;
    table: string;
  }>;
  skippedProtected: number;
  skippedLowConfidence: number;
};

export type CleanupApplyResult = {
  archived: number;
  hardDeleted: number;
  skippedProtected: number;
  errors: string[];
};
