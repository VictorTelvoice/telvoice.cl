#!/usr/bin/env node
/**
 * Seed datos de prueba Wholesale Core (validación sprint).
 */
import "dotenv/config";
import pg from "pg";

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

await client.connect();

try {
  // Proveedores
  const { rows: providers } = await client.query(`
    INSERT INTO wholesale_providers (name, code, contact_name, contact_email, country_code, connection_type, status, notes)
    VALUES
      ('Almuqeet', 'almuqeet', 'Sales Team', 'sales@almuqeet.example', 'AE', 'http_api', 'live', 'Proveedor demo validación sprint'),
      ('PTG Pacific Telecom', 'ptg_pacific', 'Commercial', 'rates@ptgpacific.example', 'SG', 'smpp', 'approved', 'Proveedor demo validación sprint')
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      status = EXCLUDED.status,
      updated_at = now()
    RETURNING id, code, name
  `);

  const almuqeet = providers.find((p) => p.code === "almuqeet");
  const ptg = providers.find((p) => p.code === "ptg_pacific");
  if (!almuqeet || !ptg) throw new Error("No se pudieron crear proveedores.");

  // Ruta Chile
  const { rows: routes } = await client.query(
    `
    INSERT INTO wholesale_routes (
      provider_id, country_code, country_name, operator_name, traffic_type,
      cost, sale_price, currency, tps, quality_estimate, status, notes
    )
    SELECT $1, 'CL', 'Chile', 'All operators', 'mixed', 0.012000, 0.018000, 'USD', 50, 'good', 'live', 'Ruta demo validación sprint'
    WHERE NOT EXISTS (
      SELECT 1 FROM wholesale_routes r
      WHERE r.provider_id = $1 AND r.country_code = 'CL' AND r.operator_name = 'All operators'
    )
    RETURNING id
  `,
    [almuqeet.id],
  );

  let routeId = routes[0]?.id;
  if (!routeId) {
    const { rows: existing } = await client.query(
      `SELECT id FROM wholesale_routes WHERE provider_id = $1 AND country_code = 'CL' AND operator_name = 'All operators' LIMIT 1`,
      [almuqeet.id],
    );
    routeId = existing[0]?.id;
  }

  // Cliente wholesale SMPP
  const { rows: existingCustomer } = await client.query(
    `SELECT id, company_name FROM wholesale_customers WHERE company_name = 'Demo Wholesale LATAM SpA' LIMIT 1`,
  );
  let customerId = existingCustomer[0]?.id;
  if (!customerId) {
    const { rows: customers } = await client.query(`
      INSERT INTO wholesale_customers (
        company_name, contact_name, email, whatsapp, country_code, country_name,
        connection_type, monthly_volume_estimate, commercial_status, notes
      )
      VALUES (
        'Demo Wholesale LATAM SpA', 'María González', 'maria@demo-wholesale.example', '+56912345678',
        'CL', 'Chile', 'smpp', 500000, 'testing', 'Cliente demo validación sprint'
      )
      RETURNING id, company_name
    `);
    customerId = customers[0]?.id;
  }

  // Oportunidad
  if (customerId) {
    await client.query(
      `
      INSERT INTO wholesale_opportunities (
        customer_id, country_code, country_name, traffic_type, volume_estimate,
        target_price, currency, commercial_status, notes
      )
      SELECT $1, 'CL', 'Chile', 'mixed', 500000, 0.017500, 'USD', 'testing', 'Oportunidad demo validación sprint'
      WHERE NOT EXISTS (
        SELECT 1 FROM wholesale_opportunities o
        WHERE o.customer_id = $1 AND o.country_code = 'CL' AND o.notes = 'Oportunidad demo validación sprint'
      )
    `,
      [customerId],
    );
  }

  // Oferta rates con raw_text
  const rawText = `From: rates@almuqeet.example
Date: 2026-05-29

Chile - All operators
Promo: 0.012 USD
Trans: 0.014 USD
OTP: 0.016 USD
TPS: 50

Peru - Claro
Promo: 0.009 USD
Trans: 0.011 USD`;

  const { rows: offers } = await client.query(
    `
    INSERT INTO wholesale_rate_offers (
      provider_id, title, raw_text, country_code, parsed_notes, status, received_at
    )
    SELECT $1, 'Rates LATAM mayo 2026', $2, 'CL', 'Pegado manualmente desde email demo', 'draft', now()
    WHERE NOT EXISTS (
      SELECT 1 FROM wholesale_rate_offers WHERE title = 'Rates LATAM mayo 2026'
    )
    RETURNING id, title
  `,
    [almuqeet.id, rawText],
  );

  // Prueba de ruta
  if (routeId) {
    await client.query(
      `
      INSERT INTO wholesale_route_tests (
        route_id, provider_id, test_number, destination_country,
        notes, result_summary, delivery_status, tested_at, status
      )
      SELECT $1, $2, '+56987654321', 'CL', 'Prueba manual sprint wholesale',
        'Entrega OK en 8s, sender TELVOICE aceptado', 'delivered', now(), 'approved'
      WHERE NOT EXISTS (
        SELECT 1 FROM wholesale_route_tests
        WHERE route_id = $1 AND test_number = '+56987654321'
      )
    `,
      [routeId, almuqeet.id],
    );
  }

  const { rows: tables } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM wholesale_providers) AS providers,
      (SELECT count(*)::int FROM wholesale_routes) AS routes,
      (SELECT count(*)::int FROM wholesale_rate_offers) AS rate_offers,
      (SELECT count(*)::int FROM wholesale_route_tests) AS route_tests,
      (SELECT count(*)::int FROM wholesale_customers) AS customers,
      (SELECT count(*)::int FROM wholesale_opportunities) AS opportunities
  `);

  console.log("OK: seed wholesale demo aplicado.");
  console.log(JSON.stringify({ providers, routeId, customerId, offers, counts: tables[0] }, null, 2));
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
