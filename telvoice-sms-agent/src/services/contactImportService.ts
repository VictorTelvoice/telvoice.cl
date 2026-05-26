import { getSupabase } from "../database/supabaseClient.js";
import type {
  ContactImportJobRow,
  ContactImportPreview,
  ContactImportResult,
  ContactImportRow,
  ContactListRow,
  ParsedContactCsvRow,
  ValidatedContactImportRow,
} from "../types/contacts.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { isDuplicateKeyError, wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  createContact,
  findContactByPhone,
  listContactLists,
  validateContactPhone,
} from "./contactService.js";
import { findOrCreateContactTagByName } from "./contactTagService.js";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if ((ch === "," || ch === ";") && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normHeader(cell: string): string {
  return cell
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const HEADER_MAP: Record<string, keyof ParsedContactCsvRow | "tags" | "list_name"> = {
  nombre: "display_name",
  name: "display_name",
  display_name: "display_name",
  telefono: "phone",
  phone: "phone",
  email: "email",
  agenda: "list_name",
  list: "list_name",
  lista: "list_name",
  tags: "tags",
  tag: "tags",
  notas: "notes",
  notes: "notes",
};

function mapHeader(cell: string): string | null {
  const n = normHeader(cell);
  if (HEADER_MAP[n]) return HEADER_MAP[n];
  if (/^(numero|numeros|celular|movil|msisdn)s?$/.test(n)) return "phone";
  return null;
}

export function parseContactsCsv(input: string): ParsedContactCsvRow[] {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const firstCols = parseCsvLine(lines[0]!);
  const headerKeys = firstCols.map((c) => mapHeader(c));
  const hasHeader = headerKeys.some(Boolean);
  let start = 0;
  const colMap: Record<string, number> = {};

  if (hasHeader) {
    headerKeys.forEach((key, idx) => {
      if (key) colMap[key] = idx;
    });
    start = 1;
  } else {
    colMap.display_name = 0;
    colMap.phone = 1;
    if (firstCols.length > 2) colMap.email = 2;
  }

  if (!("phone" in colMap)) {
    throw new AppError("El archivo CSV no tiene columnas reconocibles.", 400);
  }

  const rows: ParsedContactCsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    if (!cols.length) continue;

    const raw: Record<string, string> = {};
    for (const [key, idx] of Object.entries(colMap)) {
      raw[key] = (cols[idx] ?? "").trim();
    }

    const phone = raw.phone ?? "";
    if (!phone) continue;

    const displayName =
      (raw.display_name ?? "").trim() ||
      phone;

    let tagNames: string[] | undefined;
    const tagsRaw = raw.tags ?? "";
    if (tagsRaw) {
      tagNames = tagsRaw
        .split(/[|;]/)
        .map((t) => t.trim())
        .filter(Boolean);
    }

    rows.push({
      row_number: i - start + 1,
      display_name: displayName,
      phone,
      email: raw.email || undefined,
      list_name: raw.list_name || undefined,
      tag_names: tagNames,
      notes: raw.notes || undefined,
      raw,
    });
  }

  return rows;
}

export async function validateContactImportRows(
  companyId: string,
  rows: ParsedContactCsvRow[],
): Promise<ValidatedContactImportRow[]> {
  const existingPhones = new Set<string>();
  const { data: existing } = await getSupabase()
    .from("contacts")
    .select("phone_normalized")
    .eq("company_id", companyId);

  if (existing) {
    for (const r of existing) {
      existingPhones.add(r.phone_normalized as string);
    }
  }

  const seenInFile = new Set<string>();
  const validated: ValidatedContactImportRow[] = [];

  for (const row of rows) {
    const base: ValidatedContactImportRow = { ...row, status: "pending" };
    const phoneCheck = validateContactPhone(row.phone);

    if (!phoneCheck.ok || !phoneCheck.normalized) {
      validated.push({
        ...base,
        status: "invalid",
        error_message:
          phoneCheck.error ??
          "El teléfono debe ser un móvil chileno válido en formato +569XXXXXXXX.",
      });
      continue;
    }

    const normalized = phoneCheck.normalized;

    if (seenInFile.has(normalized)) {
      validated.push({
        ...base,
        phone_normalized: normalized,
        status: "duplicate",
        error_message: "Teléfono duplicado dentro del CSV.",
      });
      continue;
    }
    seenInFile.add(normalized);

    if (existingPhones.has(normalized)) {
      const dup = await findContactByPhone(companyId, normalized);
      validated.push({
        ...base,
        phone_normalized: normalized,
        status: "duplicate",
        error_message: "Ya existe un contacto con ese teléfono.",
        duplicate_contact_id: dup?.id,
      });
      continue;
    }

    validated.push({
      ...base,
      phone_normalized: normalized,
      status: "valid",
    });
  }

  return validated;
}

export type CreateContactImportJobInput = {
  csv_text: string;
  filename?: string;
  create_tags?: boolean;
};

export async function createContactImportJob(
  companyId: string,
  input: CreateContactImportJobInput,
): Promise<ContactImportPreview> {
  const parsed = parseContactsCsv(input.csv_text);
  if (!parsed.length) {
    throw new AppError("El archivo CSV no tiene filas de datos.", 400);
  }

  const validated = await validateContactImportRows(companyId, parsed);
  const valid = validated.filter((r) => r.status === "valid").length;
  const invalid = validated.filter((r) => r.status === "invalid").length;
  const duplicate = validated.filter((r) => r.status === "duplicate").length;

  const { data: job, error: jobErr } = await getSupabase()
    .from("contact_import_jobs")
    .insert({
      company_id: companyId,
      status: "validated",
      filename: input.filename?.trim() || null,
      total_rows: validated.length,
      valid_rows: valid,
      invalid_rows: invalid,
      duplicate_rows: duplicate,
      imported_rows: 0,
      metadata: { create_tags: Boolean(input.create_tags) },
    })
    .select("*")
    .single();

  if (jobErr) {
    if (isMissingTableError(jobErr)) {
      throw new AppError("Módulo de importación pendiente de migración 024.", 503);
    }
    wrapSupabaseError(jobErr, "createContactImportJob");
  }

  const jobRow = job as ContactImportJobRow;
  const insertRows = validated.map((r) => ({
    job_id: jobRow.id,
    company_id: companyId,
    row_number: r.row_number,
    raw_data: r.raw,
    display_name: r.display_name,
    phone: r.phone,
    phone_normalized: r.phone_normalized ?? null,
    email: r.email ?? null,
    status: r.status,
    error_message: r.error_message ?? null,
    duplicate_contact_id: r.duplicate_contact_id ?? null,
    metadata: {
      list_name: r.list_name ?? null,
      tag_names: r.tag_names ?? [],
      notes: r.notes ?? null,
    },
  }));

  const { error: rowsErr } = await getSupabase()
    .from("contact_import_rows")
    .insert(insertRows);

  if (rowsErr) {
    wrapSupabaseError(rowsErr, "createContactImportJob.rows");
  }

  return {
    job: jobRow,
    rows: validated,
    summary: {
      total: validated.length,
      valid,
      invalid,
      duplicate,
    },
  };
}

export async function getContactImportJob(
  companyId: string,
  jobId: string,
): Promise<ContactImportPreview | null> {
  const { data: job, error } = await getSupabase()
    .from("contact_import_jobs")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    wrapSupabaseError(error, "getContactImportJob");
  }
  if (!job) return null;

  const { data: rows, error: rowsErr } = await getSupabase()
    .from("contact_import_rows")
    .select("*")
    .eq("job_id", jobId)
    .eq("company_id", companyId)
    .order("row_number", { ascending: true });

  if (rowsErr) {
    wrapSupabaseError(rowsErr, "getContactImportJob.rows");
  }

  const jobRow = job as ContactImportJobRow;
  const dbRows = (rows ?? []) as ContactImportRow[];

  const validated: ValidatedContactImportRow[] = dbRows.map((r) => {
    const meta = r.metadata as {
      list_name?: string;
      tag_names?: string[];
      notes?: string;
    };
    return {
      row_number: r.row_number,
      display_name: r.display_name ?? "",
      phone: r.phone ?? "",
      email: r.email ?? undefined,
      list_name: meta.list_name,
      tag_names: meta.tag_names,
      notes: meta.notes,
      raw: r.raw_data as Record<string, string>,
      phone_normalized: r.phone_normalized ?? undefined,
      status: r.status,
      error_message: r.error_message ?? undefined,
      duplicate_contact_id: r.duplicate_contact_id ?? undefined,
    };
  });

  return {
    job: jobRow,
    rows: validated,
    summary: {
      total: jobRow.total_rows,
      valid: jobRow.valid_rows,
      invalid: jobRow.invalid_rows,
      duplicate: jobRow.duplicate_rows,
    },
  };
}

async function resolveListByName(
  listName: string | undefined,
  listsByName: Map<string, ContactListRow>,
): Promise<string | null> {
  if (!listName?.trim()) return null;
  const key = listName.trim().toLowerCase();
  const list = listsByName.get(key);
  if (!list) {
    return null;
  }
  return list.id;
}

export async function importValidatedContacts(
  companyId: string,
  jobId: string,
): Promise<ContactImportResult> {
  const preview = await getContactImportJob(companyId, jobId);
  if (!preview) {
    throw new AppError("Trabajo de importación no encontrado.", 404);
  }
  if (preview.job.status === "imported") {
    throw new AppError("Esta importación ya fue confirmada.", 400);
  }
  if (preview.job.status !== "validated") {
    throw new AppError("La importación no está lista para confirmar.", 400);
  }

  const createTags = Boolean(preview.job.metadata?.create_tags);
  const lists = await listContactLists(companyId);
  const listsByName = new Map(
    lists.map((l) => [l.name.trim().toLowerCase(), l]),
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const validRows = preview.rows.filter((r) => r.status === "valid");

  for (const row of validRows) {
    try {
      const listId = await resolveListByName(row.list_name, listsByName);
      if (row.list_name?.trim() && !listId) {
        errors.push(
          `Fila ${row.row_number}: agenda «${row.list_name}» no existe (omitida agenda).`,
        );
      }

      const contact = await createContact(companyId, {
        display_name: row.display_name,
        phone: row.phone,
        email: row.email,
        list_id: listId,
        notes: row.notes,
        source: "import",
      });

      if (createTags && row.tag_names?.length) {
        for (const tagName of row.tag_names) {
          const tag = await findOrCreateContactTagByName(companyId, tagName);
          const { error: assignErr } = await getSupabase()
            .from("contact_tag_assignments")
            .insert({
              company_id: companyId,
              contact_id: contact.id,
              tag_id: tag.id,
            });
          if (assignErr && !isDuplicateKeyError(assignErr)) {
            wrapSupabaseError(assignErr, "importValidatedContacts.tag");
          }
        }
      }

      await getSupabase()
        .from("contact_import_rows")
        .update({ status: "imported" })
        .eq("job_id", jobId)
        .eq("row_number", row.row_number);

      imported += 1;
    } catch (e) {
      skipped += 1;
      const msg = e instanceof AppError ? e.message : "Error al importar fila";
      errors.push(`Fila ${row.row_number}: ${msg}`);
      await getSupabase()
        .from("contact_import_rows")
        .update({ status: "skipped", error_message: msg })
        .eq("job_id", jobId)
        .eq("row_number", row.row_number);
    }
  }

  const { data: updatedJob, error: jobErr } = await getSupabase()
    .from("contact_import_jobs")
    .update({
      status: "imported",
      imported_rows: imported,
      error_message: errors.length ? errors.slice(0, 5).join(" | ") : null,
    })
    .eq("id", jobId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (jobErr) {
    wrapSupabaseError(jobErr, "importValidatedContacts.job");
  }

  return {
    job: updatedJob as ContactImportJobRow,
    imported,
    skipped,
    errors,
  };
}
