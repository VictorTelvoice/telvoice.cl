#!/usr/bin/env node
/**
 * Habilita temporalmente Bolsa Chile 200 SMS ($1.000) en catálogo público.
 * Revertir: node scripts/enable-public-bolsa-chile-200-qa.mjs --revert --apply
 */
import "dotenv/config";
import pg from "pg";

const PACKAGE_ID = "204786a5-0e70-43d4-8339-8403ccf810c4";
const COMMERCIAL_NAME = "Bolsa Chile 200 SMS";
const apply = process.argv.includes("--apply");
const revert = process.argv.includes("--revert");

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const { rows } = await client.query(
  `SELECT id, name, sms_quantity, total_price, currency, is_active, metadata
   FROM sms_packages WHERE id = $1`,
  [PACKAGE_ID],
);
const row = rows[0];
if (!row) {
  console.error("Paquete no encontrado:", PACKAGE_ID);
  process.exit(1);
}

const prev = {
  name: row.name,
  metadata: row.metadata,
};

const enabledMeta = {
  ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
  customer_visible: true,
  channel: "web",
  segment: "retail",
  /** listCustomerVisiblePackages acepta web + standard|retail */
  qa: false,
  internal: false,
  test: false,
  temporary_qa_commercial: true,
};

const hiddenMeta = {
  ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
  customer_visible: false,
  channel: "internal",
  segment: "qa",
  qa: true,
  internal: true,
  temporary_qa_commercial: false,
};

const next = revert
  ? {
      name: prev.name.includes("prueba") ? prev.name : "Bolsa prueba 200 SMS",
      metadata: hiddenMeta,
    }
  : {
      name: COMMERCIAL_NAME,
      metadata: enabledMeta,
    };

console.log(
  JSON.stringify(
    {
      mode: apply ? (revert ? "revert-apply" : "enable-apply") : "dry-run",
      package_id: PACKAGE_ID,
      before: {
        name: row.name,
        sms_quantity: row.sms_quantity,
        total_price: row.total_price,
        metadata: row.metadata,
      },
      after: next,
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log("\nDry-run. Usar --apply para persistir.");
  await client.end();
  process.exit(0);
}

await client.query(
  `UPDATE sms_packages SET name = $2, metadata = $3::jsonb, updated_at = now() WHERE id = $1`,
  [PACKAGE_ID, next.name, JSON.stringify(next.metadata)],
);

console.log(revert ? "Revertido (oculto QA)." : "Habilitado en catálogo público.");
await client.end();
