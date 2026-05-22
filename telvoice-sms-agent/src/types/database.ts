export type ClientStatus = "active" | "inactive" | "suspended";
export type SmsAccountStatus = "active" | "inactive" | "suspended";
export type SmsMessageStatus =
  | "pending_submit"
  | "submitted"
  | "failed"
  | "delivered"
  | "pending"
  | "unknown";

export const DEFAULT_COUNTRY_CODE = "CL";

export type ClientTelegramUserRole = "owner" | "operator" | "viewer";

export interface ClientTelegramUserRow {
  id: string;
  client_id: string;
  telegram_user_id: string;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  role: ClientTelegramUserRole;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientTelegramUserInput {
  client_id: string;
  telegram_user_id: string;
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role: ClientTelegramUserRole;
  is_active?: boolean;
  notes?: string | null;
}

export interface UpdateClientTelegramUserInput {
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: ClientTelegramUserRole;
  is_active?: boolean;
  notes?: string | null;
}

export interface ClientRow {
  id: string;
  company_name: string;
  email: string | null;
  phone: string | null;
  telegram_chat_id: string | null;
  whatsapp_number: string | null;
  status: ClientStatus;
  created_at: string;
  updated_at: string;
}

export interface ClientSmsAccountRow {
  id: string;
  client_id: string;
  provider: string;
  api_id: string;
  api_password_encrypted: string;
  default_sender_id: string | null;
  status: SmsAccountStatus;
  created_at: string;
}

export interface BalanceRow {
  id: string;
  client_id: string;
  country_code: string;
  available_units: number;
  reserved_units: number;
  consumed_units: number;
  created_at: string;
  updated_at: string;
}

export interface BalanceLedgerRow {
  id: string;
  client_id: string;
  country_code: string;
  movement_type: string;
  units: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface SmsMessageRow {
  id: string;
  client_id: string;
  provider: string;
  uid: string;
  provider_message_id: string | null;
  sms_id: string | null;
  phonenumber: string;
  sender_id: string;
  textmessage: string;
  sms_type: string;
  encoding: string;
  estimated_parts: number;
  client_cost: number | null;
  provider_status: string | null;
  status: SmsMessageStatus;
  dlr_status: string | null;
  error_code: string | null;
  error_description: string | null;
  remarks: string | null;
  raw_submit_response: Record<string, unknown> | null;
  raw_dlr_payload: Record<string, unknown> | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsDlrEventRow {
  id: string;
  sms_message_id: string | null;
  uid: string | null;
  provider_message_id: string | null;
  phone_number: string | null;
  dlr_status: string | null;
  sms_id: string | null;
  client_cost: number | null;
  error_code: string | null;
  error_description: string | null;
  raw_payload: Record<string, unknown>;
  received_at: string;
}

export interface CreatePendingSmsInput {
  client_id: string;
  provider?: string;
  uid: string;
  phonenumber: string;
  sender_id: string;
  textmessage: string;
  sms_type: string;
  encoding: string;
  estimated_parts: number;
}

export interface UpdateSmsAfterSubmitInput {
  provider_message_id?: string | null;
  provider_status?: string | null;
  remarks?: string | null;
  raw_submit_response?: Record<string, unknown> | null;
  status: SmsMessageStatus;
  sent_at?: string | null;
}

export interface UpdateSmsFromDlrInput {
  dlr_status?: string | null;
  sms_id?: string | null;
  client_cost?: number | null;
  error_code?: string | null;
  error_description?: string | null;
  remarks?: string | null;
  raw_dlr_payload?: Record<string, unknown> | null;
  status: SmsMessageStatus;
  delivered_at?: string | null;
}
