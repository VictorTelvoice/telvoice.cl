#!/usr/bin/env node
/**
 * Verificación QA Contactos Etapa 2.
 *
 * - Verifica tablas 023
 * - Valida teléfono Chile +569
 * - Crea agenda/contacto de prueba, duplicado e inválido
 * - Aísla por company_id (no envía SMS, no toca wallet)
 *
 * Uso:
 *   npm run build
 *   node scripts/apply-migration-023.mjs   # si aún no aplicada
 *   node scripts/verify-contacts-qa.mjs
 *
 * Opcional: QA_CONTACTS_COMPANY_ID=<uuid> en .env
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL no está definido en .env");
  process.exit(1);
}

const distPath = join(__dirname, "../dist/services/contactService.js");
if (!existsSync(distPath)) {
  console.error("Falta dist/services/contactService.js — ejecuta: npm run build");
  process.exit(1);
}

const {
  validateContactPhone,
  normalizeContactPhone,
  createContact,
  createContactList,
  findContactByPhone,
  listContacts,
  getContactSummary,
} = await import(pathToFileURL(distPath).toString());

const { AppError } = await import(
  pathToFileURL(join(__dirname, "../dist/utils/errors.js")).toString(),
);

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const CONTACT_TABLES = [
  "contact_lists",
  "contacts",
  "contact_list_members",
  "contact_tags",
  "contact_tag_assignments",
];

const TEST_PHONE = "+56911112222";
const TEST_LIST = `QA Contacts ${Date.now()}`;

await client.connect();
try {
  // 1) Tablas
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [CONTACT_TABLES],
  );
  for (const t of CONTACT_TABLES) {
    assert(
      tables.some((r) => r.table_name === t),
      `Falta tabla ${t} — aplica 023_contacts.sql`,
    );
  }
  console.log("Tablas contactos: OK");

  // 2) company_id
  let companyId = process.env.QA_CONTACTS_COMPANY_ID?.trim();
  if (!companyId) {
    const { rows } = await client.query(
      `SELECT id FROM companies WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`,
    );
    assert(rows.length, "No hay companies activas para QA");
    companyId = rows[0].id;
  }
  console.log("company_id QA:", companyId);

  const { rows: walletBefore } = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions WHERE company_id = $1`,
    [companyId],
  );
  const walletTxBefore = walletBefore[0].c;

  // 3) Validación teléfono
  const valid = validateContactPhone("+56912345678");
  assert(valid.ok && valid.normalized === "+56912345678", "validateContactPhone +569 falló");

  const invalid = validateContactPhone("123");
  assert(!invalid.ok, "validateContactPhone debía rechazar 123");

  try {
    normalizeContactPhone("abc");
    assert(false, "normalizeContactPhone debía lanzar");
  } catch (e) {
    assert(e instanceof AppError, "normalizeContactPhone debe lanzar AppError");
  }
  console.log("Validación teléfono Chile: OK");

  // 4) Crear agenda
  const list = await createContactList(companyId, {
    name: TEST_LIST,
    description: "QA Etapa 2",
  });
  assert(list.id, "createContactList sin id");
  console.log("createContactList:", list.id);

  // 5) Crear contacto
  const contact = await createContact(companyId, {
    display_name: "QA Contacto",
    phone: TEST_PHONE,
    list_id: list.id,
    source: "manual",
  });
  assert(contact.phone_normalized === TEST_PHONE, "phone_normalized incorrecto");
  console.log("createContact:", contact.id);

  const listed = await listContacts(companyId, { q: "QA Contacto" });
  assert(
    listed.some((c) => c.id === contact.id),
    "listContacts no devolvió el contacto creado",
  );

  const summary = await getContactSummary(companyId);
  assert(summary.totalContacts >= 1, "getContactSummary totalContacts");
  console.log("KPI totalContacts:", summary.totalContacts);

  // 6) Duplicado
  let dupCaught = false;
  try {
    await createContact(companyId, {
      display_name: "QA Duplicado",
      phone: TEST_PHONE,
    });
  } catch (e) {
    dupCaught = e instanceof AppError && e.statusCode === 409;
  }
  assert(dupCaught, "Duplicado teléfono debía fallar con 409");
  console.log("Duplicado teléfono: OK");

  // 7) findContactByPhone
  const found = await findContactByPhone(companyId, TEST_PHONE);
  assert(found?.id === contact.id, "findContactByPhone");
  console.log("findContactByPhone: OK");

  // 8) Otra empresa no ve el contacto
  const { rows: otherCompanies } = await client.query(
    `SELECT id FROM companies WHERE id <> $1 LIMIT 1`,
    [companyId],
  );
  if (otherCompanies.length) {
    const otherId = otherCompanies[0].id;
    const foreign = await findContactByPhone(otherId, TEST_PHONE);
    assert(!foreign, "Otra company_id no debe ver el contacto QA");
    console.log("Aislamiento company_id: OK");
  } else {
    console.log("Aislamiento company_id: omitido (solo una empresa)");
  }

  // 9) Wallet intacto
  const { rows: walletAfter } = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions WHERE company_id = $1`,
    [companyId],
  );
  assert(
    walletAfter[0].c === walletTxBefore,
    "wallet_transactions cambió durante QA contactos",
  );
  console.log("Wallet sin cambios: OK");

  // Limpieza QA (contacto y agenda de prueba)
  await client.query(`DELETE FROM contact_list_members WHERE contact_id = $1`, [
    contact.id,
  ]);
  await client.query(`DELETE FROM contacts WHERE id = $1`, [contact.id]);
  await client.query(`DELETE FROM contact_lists WHERE id = $1`, [list.id]);
  console.log("Limpieza datos QA: OK");

  console.log("\nverify-contacts-qa: TODO OK");
} catch (err) {
  console.error("FAIL:", err?.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}
