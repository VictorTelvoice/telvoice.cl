import { getSupabase } from "../database/supabaseClient.js";
import type { ContactRow } from "../types/contacts.js";
import type {
  CampaignAudienceMember,
  CampaignAudienceSource,
  CampaignAudienceSummary,
} from "../types/campaign-audience.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { validateContactPhone } from "./contactService.js";

function classifyContact(row: ContactRow): CampaignAudienceMember {
  const phoneCheck = validateContactPhone(row.phone_normalized || row.phone);
  const base: CampaignAudienceMember = {
    contactId: row.id,
    displayName: row.display_name,
    phone: row.phone,
    phoneNormalized: phoneCheck.normalized ?? row.phone_normalized,
    status: row.status,
    included: false,
  };

  if (row.status === "blocked") {
    return { ...base, omitReason: "blocked" };
  }
  if (row.status === "opt_out" || row.opt_out_at) {
    return { ...base, omitReason: "opt_out" };
  }
  if (row.status === "duplicate") {
    return { ...base, omitReason: "duplicate" };
  }
  if (row.status !== "active") {
    return { ...base, omitReason: "inactive" };
  }
  if (!phoneCheck.ok) {
    return { ...base, omitReason: "invalid" };
  }

  return {
    ...base,
    phone: phoneCheck.normalized!,
    phoneNormalized: phoneCheck.normalized!,
    included: true,
  };
}

export function dedupeAudienceByPhone(
  members: CampaignAudienceMember[],
): { valid: CampaignAudienceMember[]; duplicatesOmitted: number } {
  const seen = new Set<string>();
  const valid: CampaignAudienceMember[] = [];
  let duplicatesOmitted = 0;

  for (const m of members) {
    if (!m.included) continue;
    if (seen.has(m.phoneNormalized)) {
      duplicatesOmitted += 1;
      continue;
    }
    seen.add(m.phoneNormalized);
    valid.push(m);
  }

  return { valid, duplicatesOmitted };
}

export function summarizeAudience(
  source: CampaignAudienceSource,
  sourceLabel: string,
  rawMembers: CampaignAudienceMember[],
): CampaignAudienceSummary {
  const { valid, duplicatesOmitted } = dedupeAudienceByPhone(rawMembers);

  let invalidCount = 0;
  let blockedCount = 0;
  let optOutCount = 0;

  for (const m of rawMembers) {
    if (m.omitReason === "invalid") invalidCount += 1;
    if (m.omitReason === "blocked") blockedCount += 1;
    if (m.omitReason === "opt_out") optOutCount += 1;
  }

  const sourceRef =
    source.type === "contacts"
      ? source.contactIds.join(",")
      : source.type === "list"
        ? source.listId
        : source.tagId;

  return {
    sourceType: source.type,
    sourceLabel,
    sourceRef,
    totalFound: rawMembers.length,
    validCount: valid.length,
    invalidCount,
    blockedCount,
    optOutCount,
    duplicatesOmitted,
    validRecipients: valid,
    allMembers: rawMembers,
  };
}

async function fetchContactsByIds(
  companyId: string,
  contactIds: string[],
): Promise<ContactRow[]> {
  if (!contactIds.length) {
    throw new AppError("Selecciona al menos un contacto.", 400);
  }

  const { data, error } = await getSupabase()
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .in("id", contactIds);

  if (error) {
    if (isMissingTableError(error)) return [];
    wrapSupabaseError(error, "fetchContactsByIds");
  }

  const rows = (data ?? []) as ContactRow[];
  if (rows.length !== contactIds.length) {
    throw new AppError("No puedes usar contactos de otra empresa.", 403);
  }
  return rows;
}

async function fetchContactsForList(
  companyId: string,
  listId: string,
): Promise<{ rows: ContactRow[]; listName: string }> {
  const { data: list, error: listErr } = await getSupabase()
    .from("contact_lists")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("id", listId)
    .maybeSingle();

  if (listErr) {
    if (isMissingTableError(listErr)) {
      throw new AppError("Módulo Contactos pendiente de migración.", 503);
    }
    wrapSupabaseError(listErr, "fetchContactsForList.list");
  }
  if (!list) {
    throw new AppError("La agenda seleccionada no existe.", 404);
  }

  const { data: members, error: memErr } = await getSupabase()
    .from("contact_list_members")
    .select("contact_id")
    .eq("company_id", companyId)
    .eq("list_id", listId);

  if (memErr) {
    wrapSupabaseError(memErr, "fetchContactsForList.members");
  }

  const ids = (members ?? []).map((m) => m.contact_id as string);
  if (!ids.length) {
    return { rows: [], listName: list.name as string };
  }

  const rows = await fetchContactsByIds(companyId, ids);
  return { rows, listName: list.name as string };
}

async function fetchContactsForTag(
  companyId: string,
  tagId: string,
): Promise<{ rows: ContactRow[]; tagName: string }> {
  const { data: tag, error: tagErr } = await getSupabase()
    .from("contact_tags")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("id", tagId)
    .maybeSingle();

  if (tagErr) {
    if (isMissingTableError(tagErr)) {
      throw new AppError("Módulo Contactos pendiente de migración.", 503);
    }
    wrapSupabaseError(tagErr, "fetchContactsForTag.tag");
  }
  if (!tag) {
    throw new AppError("El tag seleccionado no existe.", 404);
  }

  const { data: assignments, error: aErr } = await getSupabase()
    .from("contact_tag_assignments")
    .select("contact_id")
    .eq("company_id", companyId)
    .eq("tag_id", tagId);

  if (aErr) {
    wrapSupabaseError(aErr, "fetchContactsForTag.assignments");
  }

  const ids = (assignments ?? []).map((a) => a.contact_id as string);
  if (!ids.length) {
    return { rows: [], tagName: tag.name as string };
  }

  const rows = await fetchContactsByIds(companyId, ids);
  return { rows, tagName: tag.name as string };
}

export async function resolveAudienceFromContacts(
  companyId: string,
  contactIds: string[],
): Promise<CampaignAudienceSummary> {
  const rows = await fetchContactsByIds(companyId, contactIds);
  const members = rows.map(classifyContact);
  return summarizeAudience(
    { type: "contacts", contactIds },
    `${contactIds.length} contacto(s) seleccionado(s)`,
    members,
  );
}

export async function resolveAudienceFromList(
  companyId: string,
  listId: string,
): Promise<CampaignAudienceSummary> {
  const { rows, listName } = await fetchContactsForList(companyId, listId);
  const members = rows.map(classifyContact);
  return summarizeAudience(
    { type: "list", listId },
    `Agenda: ${listName}`,
    members,
  );
}

export async function resolveAudienceFromTag(
  companyId: string,
  tagId: string,
): Promise<CampaignAudienceSummary> {
  const { rows, tagName } = await fetchContactsForTag(companyId, tagId);
  const members = rows.map(classifyContact);
  return summarizeAudience(
    { type: "tag", tagId },
    `Tag: ${tagName}`,
    members,
  );
}

export async function resolveCampaignAudience(
  companyId: string,
  source: CampaignAudienceSource,
): Promise<CampaignAudienceSummary> {
  if (source.type === "contacts") {
    return resolveAudienceFromContacts(companyId, source.contactIds);
  }
  if (source.type === "list") {
    return resolveAudienceFromList(companyId, source.listId);
  }
  return resolveAudienceFromTag(companyId, source.tagId);
}

export function validateCampaignAudience(
  summary: CampaignAudienceSummary,
): CampaignAudienceSummary {
  if (summary.validCount === 0) {
    throw new AppError(
      "La audiencia seleccionada no tiene contactos válidos.",
      400,
    );
  }
  return summary;
}

export function parseAudienceSourceFromQuery(query: {
  contacts?: string;
  list_id?: string;
  tag_id?: string;
}): CampaignAudienceSource | null {
  const contactsRaw = (query.contacts ?? "").trim();
  if (contactsRaw) {
    const contactIds = contactsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (contactIds.length) {
      return { type: "contacts", contactIds };
    }
  }
  const listId = (query.list_id ?? "").trim();
  if (listId) {
    return { type: "list", listId };
  }
  const tagId = (query.tag_id ?? "").trim();
  if (tagId) {
    return { type: "tag", tagId };
  }
  return null;
}
