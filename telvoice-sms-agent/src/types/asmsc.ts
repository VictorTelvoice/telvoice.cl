export type SmsEncoding = "T" | "U" | string;
export type SmsType = "T" | "P" | string;

export interface SendSmsPayload {
  api_id: string;
  api_password: string;
  sms_type: SmsType;
  encoding: SmsEncoding;
  sender_id: string;
  phonenumber: string;
  templateid?: string;
  textmessage: string;
  V1?: string;
  V2?: string;
  V3?: string;
  V4?: string;
  V5?: string;
  ValidityPeriodInSeconds?: number;
  uid: string;
  callback_url?: string;
  pe_id?: string;
  template_id?: string;
}

export interface SendSmsRequest {
  phonenumber: string;
  textmessage: string;
  sender_id?: string;
  sms_type?: SmsType;
  encoding?: SmsEncoding;
  templateid?: string;
  template_id?: string;
  pe_id?: string;
  V1?: string;
  V2?: string;
  V3?: string;
  V4?: string;
  V5?: string;
  ValidityPeriodInSeconds?: number;
  uid?: string;
  callback_url?: string;
}

export interface CheckBalancePayload {
  api_id: string;
  api_password: string;
}

export interface GetDeliveryStatusPayload {
  api_id: string;
  api_password: string;
  message_id?: string;
  uid?: string;
  SMSID?: string;
}

export interface AsmscDlrWebhookBody {
  message_id?: string;
  PhoneNumber?: string;
  DLRStatus?: string;
  SMSID?: string;
  ErrorCode?: string;
  ErrorDescription?: string;
  uid?: string;
  [key: string]: unknown;
}

export type AsmscApiResponse = Record<string, unknown>;
