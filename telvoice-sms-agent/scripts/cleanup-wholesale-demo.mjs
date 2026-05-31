#!/usr/bin/env node
/**
 * Limpieza controlada de datos QA/demo wholesale en Supabase producción.
 * Ejecuta preview (SELECT) y DELETE solo si los IDs coinciden exactamente.
 */
import "dotenv/config";
import pg from "pg";

const KEEP = {
  providers: [
    "eb05c56d-ce8d-48d8-a16a-debbcf38a9d4", // Almuqeet
    "ba7a58fa-f0b3-47c7-85b0-2849e7997d74", // PTG Pacific Telecom
  ],
  route: "aba051a2-8421-4d5e-8cce-b96f9da9e9f6", // CL / All operators / Almuqeet
};

const DELETE_TARGETS = {
  provider: {
    id: "442e8ad5-c298-4301-8c58-47139e893037",
    label: "QA Debug Updated / qa_debug_provider",
  },
  customer: {
    id: "498c9aa1-f754-4206-a42c-df8629233a00",
    label: "Demo Wholesale LATAM SpA",
  },
  opportunity: {
    id: "a728b7fb-99c5-4afd-a2b5-fdd821ce709d",
    label: "Oportunidad demo validación sprint",
  },
  rateOffer: {
    id: "f499ee35-9b6d-4e0f-9867-8fee63364824",
    label: "Rates LATAM mayo 2026",
  },
  routeTest: {
    id: "3c7f9b82-2890-46cc-9e63-86c4d758cf96",
    label: "+56987654321",
  },
};

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no definido.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function preview() {
  section("SELECT PREVIEW — registros a eliminar");

  const queries = [
    {
      key: "provider",
      sql: `SELECT id, name, code, status FROM wholesale_providers WHERE id = $1`,
      params: [DELETE_TARGETS.provider.id],
    },
    {
      key: "customer",
      sql: `SELECT id, company_name, connection_type, commercial_status FROM wholesale_customers WHERE id = $1`,
      params: [DELETE_TARGETS.customer.id],
    },
    {
      key: "opportunity",
      sql: `SELECT o.id, o.notes, o.commercial_status, c.company_name
            FROM wholesale_opportunities o
            LEFT JOIN wholesale_customers c ON c.id = o.customer_id
            WHERE o.id = $1`,
      params: [DELETE_TARGETS.opportunity.id],
    },
    {
      key: "rateOffer",
      sql: `SELECT id, title, status, LEFT(raw_text, 60) AS raw_preview FROM wholesale_rate_offers WHERE id = $1`,
      params: [DELETE_TARGETS.rateOffer.id],
    },
    {
      key: "routeTest",
      sql: `SELECT id, test_number, destination_country, delivery_status, status, notes
            FROM wholesale_route_tests WHERE id = $1`,
      params: [DELETE_TARGETS.routeTest.id],
    },
  ];

  const previewRows = {};
  for (const q of queries) {
    const { rows } = await client.query(q.sql, q.params);
    previewRows[q.key] = rows;
    console.log(`\n[${q.key}] esperado: ${DELETE_TARGETS[q.key].label}`);
    console.log(JSON.stringify(rows, null, 2));
    if (rows.length === 0) {
      console.log("  → ya eliminado o no encontrado");
    }
  }

  section("SELECT PREVIEW — registros a MANTENER");
  const keepProviders = await client.query(
    `SELECT id, name, code, status FROM wholesale_providers WHERE id = ANY($1::uuid[]) ORDER BY name`,
    [KEEP.providers],
  );
  console.log("\nProveedores:");
  console.log(JSON.stringify(keepProviders.rows, null, 2));

  const keepRoute = await client.query(
    `SELECT r.id, r.country_code, r.country_name, r.operator_name, r.status, p.name AS provider_name
     FROM wholesale_routes r
     JOIN wholesale_providers p ON p.id = r.provider_id
     WHERE r.id = $1`,
    [KEEP.route],
  );
  console.log("\nRuta:");
  console.log(JSON.stringify(keepRoute.rows, null, 2));

  return previewRows;
}

function validatePreview(previewRows) {
  const errors = [];

  const prov = previewRows.provider[0];
  if (prov && prov.code !== "qa_debug_provider") {
    errors.push(`Proveedor QA code mismatch: ${prov.code}`);
  }

  const cust = previewRows.customer[0];
  if (cust && cust.company_name !== "Demo Wholesale LATAM SpA") {
    errors.push(`Cliente demo name mismatch: ${cust.company_name}`);
  }

  const opp = previewRows.opportunity[0];
  if (opp && !String(opp.notes ?? "").includes("Oportunidad demo")) {
    errors.push(`Oportunidad notes mismatch: ${opp.notes}`);
  }

  const offer = previewRows.rateOffer[0];
  if (offer && offer.title !== "Rates LATAM mayo 2026") {
    errors.push(`Rate offer title mismatch: ${offer.title}`);
  }

  const test = previewRows.routeTest[0];
  if (test && test.test_number !== "+56987654321") {
    errors.push(`Route test number mismatch: ${test.test_number}`);
  }

  if (errors.length) {
    throw new Error(`Preview no coincide con IDs acordados:\n${errors.join("\n")}`);
  }
}

async function executeDeletes(previewRows) {
  section("DELETE controlado");
  const deleted = [];

  const steps = [
    {
      key: "opportunity",
      sql: `DELETE FROM wholesale_opportunities WHERE id = $1 RETURNING id, notes`,
      params: [DELETE_TARGETS.opportunity.id],
    },
    {
      key: "routeTest",
      sql: `DELETE FROM wholesale_route_tests WHERE id = $1 RETURNING id, test_number`,
      params: [DELETE_TARGETS.routeTest.id],
    },
    {
      key: "rateOffer",
      sql: `DELETE FROM wholesale_rate_offers WHERE id = $1 RETURNING id, title`,
      params: [DELETE_TARGETS.rateOffer.id],
    },
    {
      key: "customer",
      sql: `DELETE FROM wholesale_customers WHERE id = $1 RETURNING id, company_name`,
      params: [DELETE_TARGETS.customer.id],
    },
    {
      key: "provider",
      sql: `DELETE FROM wholesale_providers WHERE id = $1 AND code = 'qa_debug_provider' RETURNING id, name, code`,
      params: [DELETE_TARGETS.provider.id],
    },
  ];

  for (const step of steps) {
    if (!previewRows[step.key]?.length) {
      console.log(`SKIP ${step.key}: no existía en preview`);
      continue;
    }
    const { rows } = await client.query(step.sql, step.params);
    console.log(`DELETE ${step.key}:`, JSON.stringify(rows));
    deleted.push({ key: step.key, rows });
  }

  return deleted;
}

async function finalReport() {
  section("Conteo final tablas wholesale");
  const tables = [
    "wholesale_providers",
    "wholesale_routes",
    "wholesale_rate_offers",
    "wholesale_route_tests",
    "wholesale_customers",
    "wholesale_opportunities",
  ];
  const counts = {};
  for (const t of tables) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
    counts[t] = rows[0].n;
    console.log(`${t}: ${rows[0].n}`);
  }

  section("Registros restantes");
  const providers = await client.query(
    `SELECT id, name, code, status FROM wholesale_providers ORDER BY name`,
  );
  console.log("\nProveedores:");
  console.log(JSON.stringify(providers.rows, null, 2));

  const routes = await client.query(
    `SELECT r.id, r.country_code, r.country_name, r.operator_name, r.status, p.name AS provider
     FROM wholesale_routes r JOIN wholesale_providers p ON p.id = r.provider_id`,
  );
  console.log("\nRutas:");
  console.log(JSON.stringify(routes.rows, null, 2));

  return { counts, providers: providers.rows, routes: routes.rows };
}

await client.connect();
try {
  const previewRows = await preview();
  validatePreview(previewRows);

  const toDelete = Object.entries(previewRows).filter(([, rows]) => rows.length > 0);
  if (toDelete.length === 0) {
    console.log("\nNada que eliminar — registros demo ya ausentes.");
  } else {
    await executeDeletes(previewRows);
  }

  const final = await finalReport();

  const almuqeet = final.providers.some((p) => p.code === "almuqeet");
  const ptg = final.providers.some((p) => p.code === "ptg_pacific");
  const route = final.routes.some(
    (r) => r.country_code === "CL" && r.operator_name === "All operators",
  );

  section("Verificación post-limpieza");
  console.log(`Almuqeet presente: ${almuqeet ? "SÍ" : "NO"}`);
  console.log(`PTG Pacific Telecom presente: ${ptg ? "SÍ" : "NO"}`);
  console.log(`Ruta CL / All operators presente: ${route ? "SÍ" : "NO"}`);
  console.log("\nOK: limpieza wholesale completada.");
} catch (err) {
  console.error("\nERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
