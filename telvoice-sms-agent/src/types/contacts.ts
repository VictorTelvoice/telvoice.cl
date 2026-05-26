export type ContactStatus =
  | "active"
  | "incomplete"
  | "blocked"
  | "duplicate"
  | "opt_out";

export type ContactSource = "manual" | "import" | "api" | "web";

export type ContactConsentStatus = "unknown" | "granted" | "denied";

export type ContactListStatus = "active" | "archived";

export type ContactRow = {
  id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  phone: string;
  phone_normalized: string;
  email: string | null;
  status: ContactStatus;
  source: ContactSource;
  notes: string | null;
  consent_status: ContactConsentStatus;
  opt_out_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContactListRow = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string | null;
  status: ContactListStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContactListMemberRow = {
  id: string;
  company_id: string;
  contact_id: string;
  list_id: string;
  added_at: string;
  metadata: Record<string, unknown>;
};

export type ContactTagRow = {
  id: string;
  company_id: string;
  name: string;
  color: string | null;
  created_at: string;
};

export type ContactTagAssignmentRow = {
  id: string;
  company_id: string;
  contact_id: string;
  tag_id: string;
  created_at: string;
};

export type ContactFilters = {
  q?: string;
  listId?: string;
  tagId?: string;
  status?: ContactStatus | "";
  source?: ContactSource | "";
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export type ContactSummary = {
  totalContacts: number;
  activeLists: number;
  validContacts: number;
  duplicateContacts: number;
  blockedOrOptOut: number;
  lastUpdatedAt: string | null;
};

export type CreateContactInput = {
  display_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  list_id?: string | null;
  notes?: string | null;
  source?: ContactSource;
};

export type CreateContactListInput = {
  name: string;
  description?: string | null;
  color?: string | null;
};

export type ContactWithListsAndTags = ContactRow & {
  list_ids: string[];
  list_names: string[];
  tag_ids: string[];
  tag_names: string[];
};

export type ContactListWithCount = ContactListRow & {
  contacts_count: number;
};

export type ContactsModuleState = {
  available: boolean;
  migrationPending: boolean;
};
