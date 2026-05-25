export type TelsimSmsReceivedPayload = {
  event: "sms.received";
  from: string;
  content: string;
  verification_code: string | null;
  service: string;
  slot_id: string;
  received_at: string;
};

export type TelsimInboundSmsRow = {
  id: string;
  event: string;
  sender_from: string;
  content: string;
  verification_code: string | null;
  service: string | null;
  slot_id: string | null;
  received_at: string;
  line_phone: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
};
