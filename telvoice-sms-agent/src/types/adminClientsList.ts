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
  | "no_activity";

export type AdminClientAuditInfo = {
  classification: AuditClassification;
  protected: boolean;
  reason: string | null;
  hasFlag: boolean;
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
  lastSmsAt: string | null;
  campaignsCount: number;
  transactionalEmailsSent: number;
};

export type AdminClientOperationalPurchases = {
  ordersCount: number;
  paidOrdersCount: number;
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

export type AdminClientsScopeSummary = {
  scope: AdminClientScope;
  visible: number;
  hiddenQa: number;
  reviewRequired: number;
  protectedVisible: number;
  totalCompanies: number;
  /** KPIs operativos sobre el conjunto visible (post-filtros). */
  totalAvailableSms: number;
  smsUsedToday: number;
  smsUsedMonth: number;
  clientsNoBalance: number;
  clientsNoRatePlan: number;
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

export type AdminClientDetailApiKey = {
  id: string;
  label: string;
  environment: string;
  status: string;
  lastUsedAt: string | null;
};

export type AdminClientOperationalDetail = {
  company: CompanyRow;
  audit: AdminClientAuditInfo;
  operational: AdminClientOperationalItem;
  ratePlanLiveEnabled: boolean | null;
  ratePlanCampaignsEnabled: boolean | null;
  ratePlanApiEnabled: boolean | null;
  recentOrders: AdminClientDetailRecentOrder[];
  recentInvoices: AdminClientDetailRecentInvoice[];
  recentMessages: AdminClientDetailRecentMessage[];
  recentEmails: AdminClientDetailRecentEmail[];
  apiKeys: AdminClientDetailApiKey[];
};
