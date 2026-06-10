import type { AuditClassification } from "./adminDataAudit.js";
import type { CompanyRow } from "./tenant.js";

export type AdminClientScope = "real" | "internal" | "qa" | "review" | "all";

export type AdminClientAuditInfo = {
  classification: AuditClassification;
  protected: boolean;
  reason: string | null;
  hasFlag: boolean;
};

export type AdminClientListItem = {
  company: CompanyRow;
  audit: AdminClientAuditInfo;
};

export type AdminClientsScopeSummary = {
  scope: AdminClientScope;
  visible: number;
  hiddenQa: number;
  reviewRequired: number;
  protectedVisible: number;
  totalCompanies: number;
};

export type AdminClientsListResult = {
  items: AdminClientListItem[];
  summary: AdminClientsScopeSummary;
  search: string;
  searchHint: string | null;
};
