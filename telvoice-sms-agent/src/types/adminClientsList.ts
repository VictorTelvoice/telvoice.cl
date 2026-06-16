import type { AdminActionLogRow, ClientActionPermissions } from "./adminClientActions.js";
import type { AuditClassification } from "./adminDataAudit.js";
import type { CompanyRow } from "./tenant.js";

export type AdminClientScope = "real" | "internal" | "qa" | "review" | "all";

/** Filtro operativo adicional (estado comercial / wallet / actividad). */
export type AdminClientStatusFilter =
  | ""
  | "active"
  | "suspended"
  | "no_balance"
  | "has_balance"
  | "no_rate_plan"
  | "activity_today"
  | "no_activity"
  | "protected";

export type AdminClientAuditInfo = {
  classification: AuditClassification;
  protected: boolean;
  reason: string | null;
  hasFlag: boolean;
  archivedAt: string | null;
};

export type AdminClientOperationalWallet = {
  availableSms: number;
  totalPurchasedSms: number;
  consumedSms: number;
  reservedSms: number;
  status: string | null;
  hasWallet: boolean;
};

export type AdminClientOperationalUsage = {
  smsToday: number;
  smsThisMonth: number;
  failedLast24h: number;
  lastSmsAt: string | null;
  campaignsCount: number;
  transactionalEmailsSent: number;
};

export type AdminClientOperationalPurchases = {
  ordersCount: number;
  paidOrdersCount: number;
  paidPendingCreditCount: number;
  lastPurchaseAt: string | null;
  lastOrderId: string | null;
  lastInvoiceNumber: string | null;
  lastInvoiceAt: string | null;
};

export type AdminClientOperationalFlags = {
  hasRatePlan: boolean;
  hasWallet: boolean;
  hasBalance: boolean;
  noActivity: boolean;
  needsReview: boolean;
  isQa: boolean;
  isProtected: boolean;
  apiActive: boolean;
  hasPaidPendingCredit: boolean;
  hasProductionApiKey: boolean;
  hasApprovedProductionKey: boolean;
  apiPending: boolean;
  walletActive: boolean;
  companyActive: boolean;
};

export type AdminClientOperationalItem = {
  companyId: string;
  companyName: string;
  billingEmail: string | null;
  country: string;
  status: CompanyRow["status"];
  auditScope: AuditClassification;
  protected: boolean;
  ratePlanName: string | null;
  ratePlanCode: string | null;
  ratePlanAssignedAt: string | null;
  wallet: AdminClientOperationalWallet;
  usage: AdminClientOperationalUsage;
  purchases: AdminClientOperationalPurchases;
  operationalFlags: AdminClientOperationalFlags;
};

export type AdminClientListItem = {
  company: CompanyRow;
  audit: AdminClientAuditInfo;
  operational: AdminClientOperationalItem;
};

/** Contadores para barra de segmentos (no KPIs globales de dashboard). */
export type AdminClientsSegmentCounts = {
  productionReal: number;
  qaTest: number;
  reviewRequired: number;
  noBalance: number;
  hasBalance: number;
  noRatePlan: number;
  activityToday: number;
  noActivity: number;
  protected: number;
};

export type AdminClientsScopeSummary = {
  scope: AdminClientScope;
  /** Resultados tras filtros activos. */
  visible: number;
  totalCompanies: number;
  segments: AdminClientsSegmentCounts;
};

export type AdminClientsListResult = {
  items: AdminClientListItem[];
  summary: AdminClientsScopeSummary;
  search: string;
  statusFilter: AdminClientStatusFilter;
  searchHint: string | null;
  page: number;
  pageSize: number;
  totalFiltered: number;
};

/** Detalle operativo por cliente (vista /admin/clients/:companyId). */
export type AdminClientDetailRecentOrder = {
  id: string;
  paymentStatus: string;
  creditStatus: string;
  smsQuantity: number;
  amount: string;
  createdAt: string;
};

export type AdminClientDetailRecentInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  issuedAt: string | null;
};

export type AdminClientDetailRecentMessage = {
  id: string;
  recipientNumber: string;
  messageBody: string;
  status: string;
  mode: string;
  sentAt: string | null;
  createdAt: string;
};

export type AdminClientDetailRecentEmail = {
  id: string;
  kind: string;
  toEmail: string;
  subject: string;
  status: string;
  sentAt: string | null;
};

export type AdminClientDetailWalletTransaction = {
  id: string;
  type: string;
  smsAmount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
};

export type AdminClientDetailApiKey = {
  id: string;
  label: string;
  environment: string;
  status: string;
  lastUsedAt: string | null;
};

export type AdminClientDetailWebhook = {
  url: string | null;
  status: string | null;
};

export type AdminClientDetailUsageStats = {
  deliveredMonth: number;
  failedMonth: number;
  deliveryRate: string | null;
};

export type AdminClientOperationalDetail = {
  company: CompanyRow;
  audit: AdminClientAuditInfo;
  operational: AdminClientOperationalItem;
  actionPermissions?: ClientActionPermissions;
  recentAdminActions?: AdminActionLogRow[];
  ratePlanLiveEnabled: boolean | null;
  ratePlanCampaignsEnabled: boolean | null;
  ratePlanApiEnabled: boolean | null;
  recentOrders: AdminClientDetailRecentOrder[];
  pendingOrders: AdminClientDetailRecentOrder[];
  recentInvoices: AdminClientDetailRecentInvoice[];
  recentMessages: AdminClientDetailRecentMessage[];
  recentFailedMessages: AdminClientDetailRecentMessage[];
  recentEmails: AdminClientDetailRecentEmail[];
  recentWalletTransactions: AdminClientDetailWalletTransaction[];
  apiKeys: AdminClientDetailApiKey[];
  webhook: AdminClientDetailWebhook | null;
  usageStats: AdminClientDetailUsageStats;
};
