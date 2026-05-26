import type { ContactStatus } from "./contacts.js";

export type CampaignAudienceSourceType = "contacts" | "list" | "tag";

export type CampaignAudienceSource =
  | { type: "contacts"; contactIds: string[] }
  | { type: "list"; listId: string }
  | { type: "tag"; tagId: string };

export type CampaignAudienceOmitReason =
  | "blocked"
  | "opt_out"
  | "invalid"
  | "duplicate"
  | "inactive";

export type CampaignAudienceMember = {
  contactId: string;
  displayName: string;
  phone: string;
  phoneNormalized: string;
  status: ContactStatus;
  included: boolean;
  omitReason?: CampaignAudienceOmitReason;
};

export type CampaignAudienceSummary = {
  sourceType: CampaignAudienceSourceType;
  sourceLabel: string;
  sourceRef: string;
  totalFound: number;
  validCount: number;
  invalidCount: number;
  blockedCount: number;
  optOutCount: number;
  duplicatesOmitted: number;
  validRecipients: CampaignAudienceMember[];
  allMembers: CampaignAudienceMember[];
};

export type CampaignPreviewResult = {
  audience: CampaignAudienceSummary;
  campaignName: string;
  senderId: string;
  message: string;
  characters: number;
  encoding: "GSM-7" | "UCS-2";
  segmentsPerMessage: number;
  validRecipientCount: number;
  totalSmsEstimated: number;
  balanceAvailable: number;
  balanceAfter: number;
  canProceed: boolean;
  blockReason: string | null;
  sendEnabled: boolean;
};
