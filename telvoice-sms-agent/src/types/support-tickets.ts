export type SupportTicketStatus = "open" | "in_review" | "waiting" | "resolved";
export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";

export const SUPPORT_CATEGORIES = [
  "Compra y pago",
  "Saldo SMS",
  "Campañas y envíos",
  "API / Webhook",
  "Entregabilidad SMS",
  "Facturación",
  "Configuración de cuenta",
  "SMPP / Alto volumen",
  "Otro",
] as const;

export type SupportTicketCategory = (typeof SUPPORT_CATEGORIES)[number];

export type SupportTicketReply = {
  id: string;
  author: "client" | "support";
  message: string;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  code: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
  replies: SupportTicketReply[];
};

export type ClientSupportTicketRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  ticket_code: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  message: string;
  replies: SupportTicketReply[] | unknown;
  attachment_names: string[] | unknown;
  source: string;
  related_order_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type SupportTicketsModuleState = {
  available: boolean;
  migrationPending: boolean;
};

export type CreateSupportTicketInput = {
  companyId: string;
  userId?: string | null;
  subject: string;
  category: string;
  priority: SupportTicketPriority;
  message: string;
  relatedOrderId?: string | null;
};

export type SupportTicketServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; missingTable?: boolean };

export type AppSupportPageData = {
  module: SupportTicketsModuleState;
  tickets: SupportTicket[];
  relatedOrderId?: string | null;
  suggestedSubject?: string;
};
