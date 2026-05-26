import { getSupabase } from "../database/supabaseClient.js";
import type {
  ContactTagRow,
  CreateContactTagInput,
} from "../types/contacts.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { isDuplicateKeyError, wrapSupabaseError } from "../utils/supabase-errors.js";
import { getContactById } from "./contactService.js";

export async function createContactTag(
  companyId: string,
  input: CreateContactTagInput,
): Promise<ContactTagRow> {
  const name = input.name.trim();
  if (!name) {
    throw new AppError("El nombre del tag es obligatorio.", 400);
  }

  const { data, error } = await getSupabase()
    .from("contact_tags")
    .insert({
      company_id: companyId,
      name,
      color: input.color?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("Ya existe un tag con ese nombre en tu empresa.", 409);
    }
    if (isMissingTableError(error)) {
      throw new AppError("Módulo Contactos pendiente de migración.", 503);
    }
    wrapSupabaseError(error, "createContactTag");
  }

  return data as ContactTagRow;
}

export async function findOrCreateContactTagByName(
  companyId: string,
  name: string,
): Promise<ContactTagRow> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError("Nombre de tag inválido.", 400);
  }

  const { data: existing, error: findErr } = await getSupabase()
    .from("contact_tags")
    .select("*")
    .eq("company_id", companyId)
    .ilike("name", trimmed)
    .maybeSingle();

  if (findErr && !isMissingTableError(findErr)) {
    wrapSupabaseError(findErr, "findOrCreateContactTagByName");
  }
  if (existing) {
    return existing as ContactTagRow;
  }

  return createContactTag(companyId, { name: trimmed });
}

async function assertTagBelongsToCompany(
  companyId: string,
  tagId: string,
): Promise<ContactTagRow> {
  const { data, error } = await getSupabase()
    .from("contact_tags")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", tagId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError("Módulo Contactos pendiente de migración.", 503);
    }
    wrapSupabaseError(error, "assertTagBelongsToCompany");
  }
  if (!data) {
    throw new AppError("El tag seleccionado no existe.", 400);
  }
  return data as ContactTagRow;
}

export async function assignTagToContact(
  companyId: string,
  contactId: string,
  tagId: string,
): Promise<void> {
  const contact = await getContactById(companyId, contactId);
  if (!contact) {
    throw new AppError("No puedes modificar contactos de otra empresa.", 403);
  }
  await assertTagBelongsToCompany(companyId, tagId);

  const { error } = await getSupabase().from("contact_tag_assignments").insert({
    company_id: companyId,
    contact_id: contactId,
    tag_id: tagId,
  });

  if (error) {
    if (isDuplicateKeyError(error)) {
      return;
    }
    wrapSupabaseError(error, "assignTagToContact");
  }
}

export async function removeTagFromContact(
  companyId: string,
  contactId: string,
  tagId: string,
): Promise<void> {
  const contact = await getContactById(companyId, contactId);
  if (!contact) {
    throw new AppError("No puedes modificar contactos de otra empresa.", 403);
  }

  const { error } = await getSupabase()
    .from("contact_tag_assignments")
    .delete()
    .eq("company_id", companyId)
    .eq("contact_id", contactId)
    .eq("tag_id", tagId);

  if (error) {
    wrapSupabaseError(error, "removeTagFromContact");
  }
}

async function assertContactsBelongToCompany(
  companyId: string,
  contactIds: string[],
): Promise<void> {
  if (!contactIds.length) {
    throw new AppError("Selecciona al menos un contacto.", 400);
  }

  const { data, error } = await getSupabase()
    .from("contacts")
    .select("id")
    .eq("company_id", companyId)
    .in("id", contactIds);

  if (error) {
    wrapSupabaseError(error, "assertContactsBelongToCompany");
  }

  const found = new Set((data ?? []).map((r) => r.id as string));
  if (found.size !== contactIds.length) {
    throw new AppError("No puedes modificar contactos de otra empresa.", 403);
  }
}

export async function bulkAssignTag(
  companyId: string,
  contactIds: string[],
  tagId: string,
): Promise<number> {
  await assertContactsBelongToCompany(companyId, contactIds);
  await assertTagBelongsToCompany(companyId, tagId);

  let assigned = 0;
  for (const contactId of contactIds) {
    await assignTagToContact(companyId, contactId, tagId);
    assigned += 1;
  }
  return assigned;
}

export { assertContactsBelongToCompany };
