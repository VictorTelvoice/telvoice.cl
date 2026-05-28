#!/usr/bin/env node
/**
 * Oculta paquetes/productos QA del catálogo público (solo metadata / is_active).
 * Uso: node scripts/hide-qa-catalog-products.mjs [--apply]
 */
import "dotenv/config";
import pg from "pg";

const apply = process.argv.includes("--apply");

const QA_NAME_SQL = `(
  lower(name) LIKE '%qa%'
  OR lower(name) LIKE '%e2e%'
  OR lower(name) LIKE '%prueba%'
  OR lower(name) LIKE '%unmapped%'
  OR lower(name) LIKE '%fixture%'
  OR lower(name) LIKE '%sandbox%'
  OR lower(coalesce(metadata->>'segment', '')) IN ('qa', 'test')
  OR coalesce(metadata->>'qa', 'false') = 'true'
  OR coalesce(metadata->>'test', 'false') = 'true'
  OR coalesce(metadata->>'internal', 'false') = 'true'
  OR coalesce(metadata->>'channel', '') = 'internal'
)`;

const QA_PRODUCT_SQL = `(
  lower(product_name) LIKE '%qa%'
  OR lower(product_name) LIKE '%e2e%'
  OR lower(product_name) LIKE '%prueba%'
  OR lower(product_name) LIKE '%unmapped%'
  OR lower(product_name) LIKE '%fixture%'
  OR lower(product_name) LIKE '%sandbox%'
  OR lower(coalesce(product_type, '')) IN ('qa', 'test', 'internal')
)`;

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

try {
  const packages = await client.query(
    `SELECT id, name, metadata, is_active
     FROM sms_packages
     WHERE is_active = true AND ${QA_NAME_SQL}
     ORDER BY name`,
  );

  let products = { rows: [] };
  const hasProducts = await client.query(
    `SELECT to_regclass('public.sms_products') IS NOT NULL AS ok`,
  );
  if (hasProducts.rows[0]?.ok) {
    products = await client.query(
      `SELECT id, product_name, is_active, product_type
       FROM sms_products
       WHERE is_active = true AND ${QA_PRODUCT_SQL}
       ORDER BY product_name`,
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        packages_to_hide: packages.rows,
        products_to_deactivate: products.rows,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("\nDry-run. Re-ejecutar con --apply para persistir.");
    process.exit(0);
  }

  for (const row of packages.rows) {
    const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const next = {
      ...meta,
      customer_visible: false,
      channel: "internal",
      segment: "qa",
      qa: true,
    };
    await client.query(
      `UPDATE sms_packages
       SET metadata = $2::jsonb, updated_at = now()
       WHERE id = $1`,
      [row.id, JSON.stringify(next)],
    );
  }

  if (hasProducts.rows[0]?.ok && products.rows.length) {
    await client.query(
      `UPDATE sms_products
       SET is_active = false, updated_at = now()
       WHERE ${QA_PRODUCT_SQL}`,
    );
  }

  console.log(
    `Aplicado: ${packages.rows.length} paquete(s), ${products.rows.length} producto(s) sms_products.`,
  );
} finally {
  await client.end();
}
