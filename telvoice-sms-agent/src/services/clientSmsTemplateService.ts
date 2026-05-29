import { getSupabase } from "../database/supabaseClient.js";
import type {
  ClientSmsTemplate,
  ClientSmsTemplateCategory,
  ClientSmsTemplateRow,
  ClientSmsTemplateStatus,
  CreateClientSmsTemplateInput,
  SmsTemplateServiceResult,
  SmsTemplatesModuleState,
  UpdateClientSmsTemplateInput,
} from "../types/sms-templates.js";
import { SMS_TEMPLATE_CATEGORIES } from "../types/sms-templates.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const STATUS_TO_DB: Record<ClientSmsTemplateStatus, string> = {
  active: "Activa",
  draft: "Borrador",
};

const STATUS_FROM_DB: Record<string, ClientSmsTemplateStatus> = {
  Activa: "active",
  Borrador: "draft",
};

export function smsMetricsForStorage(message: string): {
  character_count: number;
  sms_segments: number;
} {
  const character_count = [...(message ?? "")].length;
  const sms_segments =
    character_count === 0 ? 0 : character_count <= 160 ? 1 : 2;
  return { character_count, sms_segments };
}

function assertCategory(category: string): ClientSmsTemplateCategory {
  if (
    !(SMS_TEMPLATE_CATEGORIES as readonly string[]).includes(category)
  ) {
    throw new AppError("Categoría de plantilla no válida.", 400);
  }
  return category as ClientSmsTemplateCategory;
}

function categoryFromDb(raw: string): ClientSmsTemplateCategory {
  if ((SMS_TEMPLATE_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as ClientSmsTemplateCategory;
  }
  return "Soporte";
}

function parseStatus(raw: string): ClientSmsTemplateStatus {
  return STATUS_FROM_DB[raw] ?? "draft";
}

export function rowToClientSmsTemplate(row: ClientSmsTemplateRow): ClientSmsTemplate {
  const category = categoryFromDb(row.category);
  return {
    id: row.id,
    name: row.name,
    category,
    message: row.message,
    status: parseStatus(row.status),
    updatedAt: row.updated_at,
    characterCount: row.character_count,
    smsSegments: row.sms_segments,
  };
}

export async function getSmsTemplatesModuleState(): Promise<SmsTemplatesModuleState> {
  const { error } = await getSupabase()
    .from("client_sms_templates")
    .select("id")
    .limit(1);

  if (error && isMissingTableError(error)) {
    return { available: false, migrationPending: true };
  }
  if (error) {
    console.warn("[sms-templates] getSmsTemplatesModuleState", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

export async function listSmsTemplates(
  companyId: string,
): Promise<SmsTemplateServiceResult<ClientSmsTemplate[]>> {
  try {
    const { data, error } = await getSupabase()
      .from("client_sms_templates")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de plantillas no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "listSmsTemplates");
    }

    const rows = (data ?? []) as ClientSmsTemplateRow[];
    return { ok: true, data: rows.map(rowToClientSmsTemplate) };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error al listar plantillas.";
    console.warn("[sms-templates] listSmsTemplates", error);
    return { ok: false, error: msg };
  }
}

async function getTemplateRow(
  templateId: string,
  companyId: string,
): Promise<ClientSmsTemplateRow | null> {
  const { data, error } = await getSupabase()
    .from("client_sms_templates")
    .select("*")
    .eq("id", templateId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getTemplateRow");
  }
  return (data as ClientSmsTemplateRow | null) ?? null;
}

export async function createSmsTemplate(
  input: CreateClientSmsTemplateInput,
): Promise<SmsTemplateServiceResult<ClientSmsTemplate>> {
  try {
    const name = input.name.trim();
    const message = input.message.trim();
    if (!name || !message) {
      throw new AppError("Nombre y mensaje son obligatorios.", 400);
    }
    const category = assertCategory(input.category);
    const metrics = smsMetricsForStorage(message);

    const { data, error } = await getSupabase()
      .from("client_sms_templates")
      .insert({
        company_id: input.companyId,
        user_id: input.userId ?? null,
        name,
        category,
        status: STATUS_TO_DB[input.status] ?? STATUS_TO_DB.draft,
        message,
        character_count: metrics.character_count,
        sms_segments: metrics.sms_segments,
        source: "client_panel",
      })
      .select("*")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de plantillas no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "createSmsTemplate");
    }

    return {
      ok: true,
      data: rowToClientSmsTemplate(data as ClientSmsTemplateRow),
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: error.message };
    }
    const msg =
      error instanceof Error ? error.message : "No se pudo crear la plantilla.";
    console.warn("[sms-templates] createSmsTemplate", error);
    return { ok: false, error: msg };
  }
}

export async function updateSmsTemplate(
  templateId: string,
  companyId: string,
  patch: UpdateClientSmsTemplateInput,
): Promise<SmsTemplateServiceResult<ClientSmsTemplate>> {
  try {
    const existing = await getTemplateRow(templateId, companyId);
    if (!existing) {
      return { ok: false, error: "Plantilla no encontrada." };
    }

    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) {
        throw new AppError("El nombre es obligatorio.", 400);
      }
      update.name = name;
    }
    if (patch.category !== undefined) {
      update.category = assertCategory(patch.category);
    }
    if (patch.status !== undefined) {
      update.status = STATUS_TO_DB[patch.status];
    }
    if (patch.message !== undefined) {
      const message = patch.message.trim();
      if (!message) {
        throw new AppError("El mensaje es obligatorio.", 400);
      }
      update.message = message;
      const metrics = smsMetricsForStorage(message);
      update.character_count = metrics.character_count;
      update.sms_segments = metrics.sms_segments;
    }

    if (!Object.keys(update).length) {
      return { ok: false, error: "Sin cambios para aplicar." };
    }

    const { data, error } = await getSupabase()
      .from("client_sms_templates")
      .update(update)
      .eq("id", templateId)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { ok: false, error: "Plantilla no encontrada." };
      }
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de plantillas no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "updateSmsTemplate");
    }

    return {
      ok: true,
      data: rowToClientSmsTemplate(data as ClientSmsTemplateRow),
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: error.message };
    }
    const msg =
      error instanceof Error ? error.message : "No se pudo actualizar la plantilla.";
    console.warn("[sms-templates] updateSmsTemplate", error);
    return { ok: false, error: msg };
  }
}

export async function deleteSmsTemplate(
  templateId: string,
  companyId: string,
): Promise<SmsTemplateServiceResult<{ id: string }>> {
  try {
    const { error } = await getSupabase()
      .from("client_sms_templates")
      .delete()
      .eq("id", templateId)
      .eq("company_id", companyId);

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de plantillas no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "deleteSmsTemplate");
    }

    return { ok: true, data: { id: templateId } };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo eliminar la plantilla.";
    console.warn("[sms-templates] deleteSmsTemplate", error);
    return { ok: false, error: msg };
  }
}

export async function duplicateSmsTemplate(
  templateId: string,
  companyId: string,
  userId?: string | null,
): Promise<SmsTemplateServiceResult<ClientSmsTemplate>> {
  try {
    const existing = await getTemplateRow(templateId, companyId);
    if (!existing) {
      return { ok: false, error: "Plantilla no encontrada." };
    }

    return createSmsTemplate({
      companyId,
      userId,
      name: `${existing.name} (copia)`,
      category: existing.category,
      message: existing.message,
      status: "draft",
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo duplicar la plantilla.";
    console.warn("[sms-templates] duplicateSmsTemplate", error);
    return { ok: false, error: msg };
  }
}
