export const SMS_TEMPLATE_CATEGORIES = [
  "OTP",
  "Transaccional",
  "Marketing",
  "Recordatorio",
  "Interno",
  "Soporte",
] as const;

export type ClientSmsTemplateCategory = (typeof SMS_TEMPLATE_CATEGORIES)[number];

/** Estado en UI (API JSON). */
export type ClientSmsTemplateStatus = "active" | "draft";

export type ClientSmsTemplate = {
  id: string;
  name: string;
  category: ClientSmsTemplateCategory;
  message: string;
  status: ClientSmsTemplateStatus;
  updatedAt: string;
  characterCount?: number;
  smsSegments?: number;
};

export type ClientSmsTemplateRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  name: string;
  category: string;
  status: string;
  message: string;
  character_count: number;
  sms_segments: number;
  source: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type SmsTemplatesModuleState = {
  available: boolean;
  migrationPending: boolean;
};

export type CreateClientSmsTemplateInput = {
  companyId: string;
  userId?: string | null;
  name: string;
  category: string;
  message: string;
  status: ClientSmsTemplateStatus;
};

export type UpdateClientSmsTemplateInput = Partial<{
  name: string;
  category: string;
  message: string;
  status: ClientSmsTemplateStatus;
}>;

export type SmsTemplateServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; missingTable?: boolean };

export type AppTemplatesPageData = {
  module: SmsTemplatesModuleState;
  templates: ClientSmsTemplate[];
  limit?: 20 | 50 | 100;
};
