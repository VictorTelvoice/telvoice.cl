import { getSupabase } from "../database/supabaseClient.js";
import type {
  ClientSupportTicketRow,
  CreateSupportTicketInput,
  SupportTicket,
  SupportTicketPriority,
  SupportTicketReply,
  SupportTicketServiceResult,
  SupportTicketsModuleState,
  SupportTicketStatus,
} from "../types/support-tickets.js";
import { SUPPORT_CATEGORIES } from "../types/support-tickets.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const PRIORITY_TO_DB: Record<SupportTicketPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const PRIORITY_FROM_DB: Record<string, SupportTicketPriority> = {
  Baja: "low",
  Media: "medium",
  Alta: "high",
  Urgente: "urgent",
};

const STATUS_TO_DB: Record<SupportTicketStatus, string> = {
  open: "Abierto",
  in_review: "En revisión",
  waiting: "Esperando respuesta",
  resolved: "Resuelto",
};

const STATUS_FROM_DB: Record<string, SupportTicketStatus> = {
  Abierto: "open",
  "En revisión": "in_review",
  "Esperando respuesta": "waiting",
  Resuelto: "resolved",
};

function parseReplies(raw: unknown): SupportTicketReply[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const r = item as Record<string, unknown>;
      const author = r.author === "support" ? "support" : "client";
      const message = typeof r.message === "string" ? r.message : "";
      const id =
        typeof r.id === "string" && r.id.trim()
          ? r.id
          : `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const createdAt =
        typeof r.createdAt === "string"
          ? r.createdAt
          : typeof r.created_at === "string"
            ? r.created_at
            : new Date().toISOString();
      if (!message.trim()) {
        return null;
      }
      return { id, author, message, createdAt } satisfies SupportTicketReply;
    })
    .filter((r): r is SupportTicketReply => r !== null);
}

export function rowToSupportTicket(row: ClientSupportTicketRow): SupportTicket {
  const category = SUPPORT_CATEGORIES.includes(
    row.category as (typeof SUPPORT_CATEGORIES)[number],
  )
    ? (row.category as SupportTicket["category"])
    : "Otro";

  return {
    id: row.id,
    code: row.ticket_code,
    subject: row.subject,
    category,
    priority: PRIORITY_FROM_DB[row.priority] ?? "medium",
    status: STATUS_FROM_DB[row.status] ?? "open",
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replies: parseReplies(row.replies),
  };
}

export async function getSupportTicketsModuleState(): Promise<SupportTicketsModuleState> {
  const { error } = await getSupabase()
    .from("client_support_tickets")
    .select("id")
    .limit(1);

  if (error && isMissingTableError(error)) {
    return { available: false, migrationPending: true };
  }
  if (error) {
    console.warn("[support-tickets] getSupportTicketsModuleState", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

export async function listSupportTickets(
  companyId: string,
): Promise<SupportTicketServiceResult<SupportTicket[]>> {
  try {
    const { data, error } = await getSupabase()
      .from("client_support_tickets")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        return { ok: false, error: "Tabla de tickets no disponible.", missingTable: true };
      }
      wrapSupabaseError(error, "listSupportTickets");
    }

    const rows = (data ?? []) as ClientSupportTicketRow[];
    return { ok: true, data: rows.map(rowToSupportTicket) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error al listar tickets.";
    console.warn("[support-tickets] listSupportTickets", error);
    return { ok: false, error: msg };
  }
}

async function nextTicketCode(companyId: string): Promise<string> {
  const { data, error } = await getSupabase()
    .from("client_support_tickets")
    .select("ticket_code")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "nextTicketCode");
  }

  let max = 1000;
  for (const row of data ?? []) {
    const code = String((row as { ticket_code?: string }).ticket_code ?? "");
    const m = /^TLV-(\d+)$/.exec(code);
    if (m) {
      max = Math.max(max, parseInt(m[1]!, 10));
    }
  }
  return `TLV-${max + 1}`;
}

function assertCategory(category: string): void {
  if (!SUPPORT_CATEGORIES.includes(category as (typeof SUPPORT_CATEGORIES)[number])) {
    throw new AppError("Categoría de ticket no válida.", 400);
  }
}

export async function createSupportTicket(
  input: CreateSupportTicketInput,
): Promise<SupportTicketServiceResult<SupportTicket>> {
  try {
    const subject = input.subject.trim();
    const message = input.message.trim();
    if (!subject || !message) {
      throw new AppError("Asunto y mensaje son obligatorios.", 400);
    }
    assertCategory(input.category);

    const ticketCode = await nextTicketCode(input.companyId);
    const row = {
      company_id: input.companyId,
      user_id: input.userId ?? null,
      ticket_code: ticketCode,
      subject,
      category: input.category,
      priority: PRIORITY_TO_DB[input.priority] ?? "Media",
      status: STATUS_TO_DB.open,
      message,
      replies: [] as SupportTicketReply[],
      related_order_id: input.relatedOrderId ?? null,
      source: "client_panel",
    };

    const { data, error } = await getSupabase()
      .from("client_support_tickets")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return { ok: false, error: "Tabla de tickets no disponible.", missingTable: true };
      }
      wrapSupabaseError(error, "createSupportTicket");
    }

    return { ok: true, data: rowToSupportTicket(data as ClientSupportTicketRow) };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: error.message };
    }
    const msg = error instanceof Error ? error.message : "No se pudo crear el ticket.";
    console.warn("[support-tickets] createSupportTicket", error);
    return { ok: false, error: msg };
  }
}

async function getTicketRow(
  ticketId: string,
  companyId: string,
): Promise<ClientSupportTicketRow | null> {
  const { data, error } = await getSupabase()
    .from("client_support_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getTicketRow");
  }
  return (data as ClientSupportTicketRow | null) ?? null;
}

export async function addSupportTicketReply(
  ticketId: string,
  companyId: string,
  reply: Pick<SupportTicketReply, "message"> & { author?: SupportTicketReply["author"] },
): Promise<SupportTicketServiceResult<SupportTicket>> {
  try {
    const text = reply.message.trim();
    if (!text) {
      throw new AppError("La respuesta no puede estar vacía.", 400);
    }

    const existing = await getTicketRow(ticketId, companyId);
    if (!existing) {
      return { ok: false, error: "Ticket no encontrado." };
    }

    const replies = parseReplies(existing.replies);
    replies.push({
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      author: reply.author ?? "client",
      message: text,
      createdAt: new Date().toISOString(),
    });

    const { data, error } = await getSupabase()
      .from("client_support_tickets")
      .update({
        replies,
        status: STATUS_TO_DB.waiting,
      })
      .eq("id", ticketId)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return { ok: false, error: "Tabla de tickets no disponible.", missingTable: true };
      }
      wrapSupabaseError(error, "addSupportTicketReply");
    }

    return { ok: true, data: rowToSupportTicket(data as ClientSupportTicketRow) };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: error.message };
    }
    const msg = error instanceof Error ? error.message : "No se pudo enviar la respuesta.";
    console.warn("[support-tickets] addSupportTicketReply", error);
    return { ok: false, error: msg };
  }
}

export async function markSupportTicketResolved(
  ticketId: string,
  companyId: string,
): Promise<SupportTicketServiceResult<SupportTicket>> {
  try {
    const { data, error } = await getSupabase()
      .from("client_support_tickets")
      .update({ status: STATUS_TO_DB.resolved })
      .eq("id", ticketId)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { ok: false, error: "Ticket no encontrado." };
      }
      if (isMissingTableError(error)) {
        return { ok: false, error: "Tabla de tickets no disponible.", missingTable: true };
      }
      wrapSupabaseError(error, "markSupportTicketResolved");
    }

    return { ok: true, data: rowToSupportTicket(data as ClientSupportTicketRow) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "No se pudo resolver el ticket.";
    console.warn("[support-tickets] markSupportTicketResolved", error);
    return { ok: false, error: msg };
  }
}

export async function updateSupportTicket(
  ticketId: string,
  companyId: string,
  patch: Partial<{
    status: SupportTicketStatus;
    priority: SupportTicketPriority;
    subject: string;
  }>,
): Promise<SupportTicketServiceResult<SupportTicket>> {
  try {
    const update: Record<string, string> = {};
    if (patch.status) {
      update.status = STATUS_TO_DB[patch.status];
    }
    if (patch.priority) {
      update.priority = PRIORITY_TO_DB[patch.priority];
    }
    if (patch.subject?.trim()) {
      update.subject = patch.subject.trim();
    }
    if (!Object.keys(update).length) {
      return { ok: false, error: "Sin cambios para aplicar." };
    }

    const { data, error } = await getSupabase()
      .from("client_support_tickets")
      .update(update)
      .eq("id", ticketId)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return { ok: false, error: "Tabla de tickets no disponible.", missingTable: true };
      }
      wrapSupabaseError(error, "updateSupportTicket");
    }

    return { ok: true, data: rowToSupportTicket(data as ClientSupportTicketRow) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "No se pudo actualizar el ticket.";
    console.warn("[support-tickets] updateSupportTicket", error);
    return { ok: false, error: msg };
  }
}
