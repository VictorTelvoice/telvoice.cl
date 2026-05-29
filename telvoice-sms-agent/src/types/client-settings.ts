export type ClientSettingsData = {
  activeTab: string;
  company: {
    name: string;
    rut: string;
    activity: string;
    website: string;
    country: string;
    city: string;
    address: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  };
  billing: {
    legalName: string;
    rut: string;
    address: string;
    email: string;
    country: string;
    currency: string;
    sendReceipts: boolean;
    sendInvoices: boolean;
    notifyPending: boolean;
    notifyCredited: boolean;
  };
  notifications: {
    purchaseStarted: boolean;
    paymentApproved: boolean;
    balanceCredited: boolean;
    paymentRejected: boolean;
    lowBalance: boolean;
    campaignFinished: boolean;
    massDeliveryError: boolean;
    dlrReports: boolean;
    apiKeyRegenerated: boolean;
    webhookErrors: boolean;
    rateLimit: boolean;
    ticketNewMessage: boolean;
    ticketResolved: boolean;
    ticketWaiting: boolean;
    lowBalanceThreshold: number;
  };
  preferences: {
    language: string;
    timezone: string;
    dateFormat: string;
    homePage: string;
    ticketView: string;
    showQuickHelp: boolean;
    defaultSender: string;
    defaultCountry: string;
    phoneFormat: string;
    warnMultiSms: boolean;
    confirmMassSend: boolean;
  };
};

export type CompanySettingsData = {
  companyName?: string;
  companyRut?: string;
  businessActivity?: string;
  website?: string;
  country?: string;
  city?: string;
  commercialAddress?: string;
  mainContactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

export type BillingSettingsData = {
  legalName?: string;
  billingRut?: string;
  taxAddress?: string;
  billingEmail?: string;
  billingCountry?: string;
  preferredCurrency?: string;
  sendReceiptsByEmail?: boolean;
  sendTaxDocumentWhenApplicable?: boolean;
  notifyPendingPayments?: boolean;
  notifyAccreditedPurchases?: boolean;
};

export type NotificationSettings = {
  purchaseStarted?: boolean;
  paymentApproved?: boolean;
  balanceAccredited?: boolean;
  paymentRejected?: boolean;
  lowBalance?: boolean;
  campaignCompleted?: boolean;
  massiveDeliveryError?: boolean;
  deliveryReportsAvailable?: boolean;
  apiKeyRegenerated?: boolean;
  webhookErrors?: boolean;
  requestLimitReached?: boolean;
  newTicketMessage?: boolean;
  ticketResolved?: boolean;
  ticketWaitingResponse?: boolean;
  lowBalanceThreshold?: number;
};

export type PanelPreferences = {
  language?: string;
  timezone?: string;
  dateFormat?: string;
  initialPage?: string;
  preferredTicketView?: string;
  showQuickHelp?: boolean;
};

export type SmsPreferences = {
  defaultSender?: string;
  defaultCountry?: string;
  preferredNumberFormat?: string;
  warnIfMessageExceedsOneSms?: boolean;
  confirmBeforeMassiveSend?: boolean;
};

export type ClientCompanySettingsRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  company_data: CompanySettingsData;
  billing_data: BillingSettingsData;
  notification_settings: NotificationSettings;
  panel_preferences: PanelPreferences;
  sms_preferences: SmsPreferences;
  metadata: Record<string, unknown> | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type ClientCompanySettingsPayload = {
  company_data: CompanySettingsData;
  billing_data: BillingSettingsData;
  notification_settings: NotificationSettings;
  panel_preferences: PanelPreferences;
  sms_preferences: SmsPreferences;
  metadata?: Record<string, unknown>;
};

export type CompanySettingsModuleState = {
  available: boolean;
  migrationPending: boolean;
};

export type ClientCompanySettingsInput = {
  companyId: string;
  userId?: string | null;
  settings: ClientSettingsData;
};

export type CompanySettingsServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; missingTable?: boolean };

export type AppSettingsPageData = {
  module: CompanySettingsModuleState;
  settings: ClientSettingsData;
  syncSource: "supabase" | "local" | "defaults";
  hasStoredRecord: boolean;
};
