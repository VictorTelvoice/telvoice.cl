import { getSupabase } from "../database/supabaseClient.js";
import type {
  ContactFilters,
  ContactListRow,
  ContactListWithCount,
  ContactRow,
  ContactSource,
  ContactStatus,
  ContactSummary,
  ContactTagRow,
  ContactsModuleState,
  ContactWithListsAndTags,
  CreateContactInput,
  CreateContactListInput,
} from "../types/contacts.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { isDuplicateKeyError, wrapSupabaseError } from "../utils/supabase-errors.js";
import { validateRecipientNumber } from "./smsSegmentService.js";

const CONTACT_TABLES = ["contacts", "contact_lists"] as const;

export function validateContactPhone(phone: string): {
  ok: boolean;
  normalized?: string;
  error?: string;
} {
  return validateRecipientNumber(phone);
}

export function normalizeContactPhone(phone: string): string {
  const result = validateContactPhone(phone);
  if (!result.ok || !result.normalized) {
    throw new AppError(
      result.error ??
        "El teléfono debe ser un móvil chileno válido en formato +569XXXXXXXX.",
      400,
    );
  }
  return result.normalized;
}

export async function getContactsModuleState(): Promise<ContactsModuleState> {
  const { error } = await getSupabase().from("contacts").select("id").limit(1);
  if (error && isMissingTableError(error)) {
    return { available: false, migrationPending: true };
  }
  if (error) {
    console.warn("[contacts] getContactsModuleState", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

function resolveDisplayName(input: CreateContactInput): string {
  const explicit = (input.display_name ?? "").trim();
  if (explicit) {
    return explicit;
  }
  const parts = [(input.first_name ?? "").trim(), (input.last_name ?? "").trim()].filter(
    Boolean,
  );
  if (parts.length) {
    return parts.join(" ");
  }
  throw new AppError("El nombre del contacto es obligatorio.", 400);
}

export async function findContactByPhone(
  companyId: string,
  phoneNormalized: string,
): Promise<ContactRow | null> {
  const { data, error } = await getSupabase()
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("phone_normalized", phoneNormalized)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findContactByPhone");
  }
  return (data as ContactRow | null) ?? null;
}

export async function getContactById(
  companyId: string,
  contactId: string,
): Promise<ContactRow | null> {
  const { data, error } = await getSupabase()
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", contactId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getContactById");
  }
  return (data as ContactRow | null) ?? null;
}

async function assertListBelongsToCompany(
  companyId: string,
  listId: string,
): Promise<ContactListRow> {
  const { data, error } = await getSupabase()
    .from("contact_lists")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", listId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError("Módulo Contactos pendiente de migración.", 503);
    }
    wrapSupabaseError(error, "assertListBelongsToCompany");
  }
  if (!data) {
    throw new AppError("La agenda seleccionada no existe.", 400);
  }
  return data as ContactListRow;
}

export async function createContactList(
  companyId: string,
  input: CreateContactListInput,
): Promise<ContactListRow> {
  const name = input.name.trim();
  if (!name) {
    throw new AppError("El nombre de la agenda es obligatorio.", 400);
  }

  const row = {
    company_id: companyId,
    name,
    description: input.description?.trim() || null,
    color: input.color?.trim() || null,
    status: "active" as const,
    metadata: {},
  };

  const { data, error } = await getSupabase()
    .from("contact_lists")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("Ya existe una agenda con ese nombre en tu empresa.", 409);
    }
    if (isMissingTableError(error)) {
      throw new AppError("Módulo Contactos pendiente de migración.", 503);
    }
    wrapSupabaseError(error, "createContactList");
  }

  return data as ContactListRow;
}

export async function createContact(
  companyId: string,
  input: CreateContactInput,
): Promise<ContactRow> {
  const phoneNormalized = normalizeContactPhone(input.phone);
  const existing = await findContactByPhone(companyId, phoneNormalized);
  if (existing) {
    throw new AppError(
      "Ya existe un contacto con ese teléfono en tu empresa.",
      409,
    );
  }

  const displayName = resolveDisplayName(input);
  const listId = input.list_id?.trim() || null;
  if (listId) {
    await assertListBelongsToCompany(companyId, listId);
  }

  const insertRow = {
    company_id: companyId,
    first_name: input.first_name?.trim() || null,
    last_name: input.last_name?.trim() || null,
    display_name: displayName,
    phone: phoneNormalized,
    phone_normalized: phoneNormalized,
    email: input.email?.trim() || null,
    status: "active" as ContactStatus,
    source: (input.source ?? "manual") as ContactSource,
    notes: input.notes?.trim() || null,
    consent_status: "unknown" as const,
    opt_out_at: null,
    metadata: {},
  };

  const { data, error } = await getSupabase()
    .from("contacts")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "Ya existe un contacto con ese teléfono en tu empresa.",
        409,
      );
    }
    if (isMissingTableError(error)) {
      throw new AppError("Módulo Contactos pendiente de migración.", 503);
    }
    wrapSupabaseError(error, "createContact");
  }

  const contact = data as ContactRow;

  if (listId) {
    const { error: memberErr } = await getSupabase().from("contact_list_members").insert({
      company_id: companyId,
      contact_id: contact.id,
      list_id: listId,
      metadata: {},
    });
    if (memberErr && !isDuplicateKeyError(memberErr)) {
      wrapSupabaseError(memberErr, "createContact.member");
    }
  }

  return contact;
}

export async function listContactLists(
  companyId: string,
): Promise<ContactListWithCount[]> {
  const { data: lists, error } = await getSupabase()
    .from("contact_lists")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listContactLists");
  }

  const rows = (lists ?? []) as ContactListRow[];
  if (!rows.length) {
    return [];
  }

  const listIds = rows.map((l) => l.id);
  const { data: members, error: memErr } = await getSupabase()
    .from("contact_list_members")
    .select("list_id")
    .eq("company_id", companyId)
    .in("list_id", listIds);

  if (memErr && !isMissingTableError(memErr)) {
    wrapSupabaseError(memErr, "listContactLists.members");
  }

  const counts = new Map<string, number>();
  for (const m of members ?? []) {
    const lid = m.list_id as string;
    counts.set(lid, (counts.get(lid) ?? 0) + 1);
  }

  return rows.map((l) => ({
    ...l,
    contacts_count: counts.get(l.id) ?? 0,
  }));
}

export async function listContactTags(companyId: string): Promise<ContactTagRow[]> {
  const { data, error } = await getSupabase()
    .from("contact_tags")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listContactTags");
  }
  return (data ?? []) as ContactTagRow[];
}

function inDateRange(createdAt: string, start?: string, end?: string): boolean {
  if (!start && !end) {
    return true;
  }
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) {
    return true;
  }
  if (start) {
    const from = Date.parse(`${start}T00:00:00.000Z`);
    if (t < from) {
      return false;
    }
  }
  if (end) {
    const to = Date.parse(`${end}T23:59:59.999Z`);
    if (t > to) {
      return false;
    }
  }
  return true;
}

async function contactIdsForList(
  companyId: string,
  listId: string,
): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from("contact_list_members")
    .select("contact_id")
    .eq("company_id", companyId)
    .eq("list_id", listId);

  if (error) {
    if (isMissingTableError(error)) {
      return new Set();
    }
    wrapSupabaseError(error, "contactIdsForList");
  }
  return new Set((data ?? []).map((r) => r.contact_id as string));
}

async function contactIdsForTag(
  companyId: string,
  tagId: string,
): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from("contact_tag_assignments")
    .select("contact_id")
    .eq("company_id", companyId)
    .eq("tag_id", tagId);

  if (error) {
    if (isMissingTableError(error)) {
      return new Set();
    }
    wrapSupabaseError(error, "contactIdsForTag");
  }
  return new Set((data ?? []).map((r) => r.contact_id as string));
}

export async function listContacts(
  companyId: string,
  filters: ContactFilters = {},
): Promise<ContactWithListsAndTags[]> {
  const limit = filters.limit ?? 500;

  let query = getSupabase()
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.source) {
    query = query.eq("source", filters.source);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listContacts");
  }

  let rows = (data ?? []) as ContactRow[];

  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const hay = `${r.display_name} ${r.phone} ${r.phone_normalized}`.toLowerCase();
      return hay.includes(q);
    });
  }

  if (filters.listId) {
    const inList = await contactIdsForList(companyId, filters.listId);
    rows = rows.filter((r) => inList.has(r.id));
  }

  if (filters.tagId) {
    const inTag = await contactIdsForTag(companyId, filters.tagId);
    rows = rows.filter((r) => inTag.has(r.id));
  }

  rows = rows.filter((r) =>
    inDateRange(r.created_at, filters.startDate, filters.endDate),
  );

  if (!rows.length) {
    return [];
  }

  const contactIds = rows.map((r) => r.id);

  const [membersRes, assignmentsRes, tagsRes] = await Promise.all([
    getSupabase()
      .from("contact_list_members")
      .select("contact_id, list_id")
      .eq("company_id", companyId)
      .in("contact_id", contactIds),
    getSupabase()
      .from("contact_tag_assignments")
      .select("contact_id, tag_id")
      .eq("company_id", companyId)
      .in("contact_id", contactIds),
    listContactLists(companyId),
  ]);

  if (membersRes.error && !isMissingTableError(membersRes.error)) {
    wrapSupabaseError(membersRes.error, "listContacts.members");
  }
  if (assignmentsRes.error && !isMissingTableError(assignmentsRes.error)) {
    wrapSupabaseError(assignmentsRes.error, "listContacts.assignments");
  }

  const listsById = new Map(tagsRes.map((l) => [l.id, l.name]));
  const allTags = await listContactTags(companyId);
  const tagsById = new Map(allTags.map((t) => [t.id, t.name]));

  const listsByContact = new Map<string, string[]>();
  const listIdsByContact = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    const cid = m.contact_id as string;
    const lid = m.list_id as string;
    if (!listIdsByContact.has(cid)) {
      listIdsByContact.set(cid, []);
      listsByContact.set(cid, []);
    }
    listIdsByContact.get(cid)!.push(lid);
    listsByContact.get(cid)!.push(listsById.get(lid) ?? "—");
  }

  const tagsByContact = new Map<string, string[]>();
  const tagIdsByContact = new Map<string, string[]>();
  for (const a of assignmentsRes.data ?? []) {
    const cid = a.contact_id as string;
    const tid = a.tag_id as string;
    if (!tagIdsByContact.has(cid)) {
      tagIdsByContact.set(cid, []);
      tagsByContact.set(cid, []);
    }
    tagIdsByContact.get(cid)!.push(tid);
    tagsByContact.get(cid)!.push(tagsById.get(tid) ?? "—");
  }

  return rows.map((r) => ({
    ...r,
    list_ids: listIdsByContact.get(r.id) ?? [],
    list_names: listsByContact.get(r.id) ?? [],
    tag_ids: tagIdsByContact.get(r.id) ?? [],
    tag_names: tagsByContact.get(r.id) ?? [],
  }));
}

export async function getContactSummary(companyId: string): Promise<ContactSummary> {
  const empty: ContactSummary = {
    totalContacts: 0,
    activeLists: 0,
    validContacts: 0,
    duplicateContacts: 0,
    blockedOrOptOut: 0,
    lastUpdatedAt: null,
  };

  const { data, error } = await getSupabase()
    .from("contacts")
    .select("status, opt_out_at, updated_at")
    .eq("company_id", companyId);

  if (error) {
    if (isMissingTableError(error)) {
      return empty;
    }
    wrapSupabaseError(error, "getContactSummary.contacts");
  }

  const contacts = data ?? [];
  let validContacts = 0;
  let duplicateContacts = 0;
  let blockedOrOptOut = 0;
  let lastUpdatedAt: string | null = null;

  for (const c of contacts) {
    const status = c.status as ContactStatus;
    const optOut = c.opt_out_at as string | null;
    if (status === "duplicate") {
      duplicateContacts += 1;
    }
    if (
      status === "blocked" ||
      status === "opt_out" ||
      optOut
    ) {
      blockedOrOptOut += 1;
    }
    if (status === "active" && !optOut) {
      validContacts += 1;
    }
    const upd = c.updated_at as string;
    if (!lastUpdatedAt || upd > lastUpdatedAt) {
      lastUpdatedAt = upd;
    }
  }

  const { count: listCount, error: listErr } = await getSupabase()
    .from("contact_lists")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active");

  if (listErr && !isMissingTableError(listErr)) {
    wrapSupabaseError(listErr, "getContactSummary.lists");
  }

  return {
    totalContacts: contacts.length,
    activeLists: listCount ?? 0,
    validContacts,
    duplicateContacts,
    blockedOrOptOut,
    lastUpdatedAt,
  };
}

export { CONTACT_TABLES };
