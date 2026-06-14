#!/usr/bin/env node
/**
 * QA producción — SMS Entrantes (/app/sms-inbox)
 * Valida aislamiento multi-tenant y simulación inbound (source=simulation).
 *
 * Requiere DATABASE_URL y tablas client_numbers / inbound_sms_messages.
 */
import pg from "pg";

const { Client } = pg;

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    fail("DATABASE_URL no definido — omitiendo pruebas de DB.");
    return;
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const { rows: companies } = await client.query(
      `SELECT c.id, c.name,
        (SELECT COUNT(*)::int FROM client_numbers cn
         WHERE cn.company_id = c.id AND cn.status = 'active') AS active_numbers
       FROM companies c
       WHERE c.status = 'active'
       ORDER BY active_numbers DESC
       LIMIT 5`,
    );

    if (!companies.length) {
      fail("Sin empresas activas para probar.");
      return;
    }

    const multi = companies.find((c) => c.active_numbers >= 2);
    if (multi) {
      ok(`Empresa multi-numeración: ${multi.name} (${multi.active_numbers} activas)`);
    } else {
      console.warn("WARN: ninguna empresa con 2+ numeraciones activas en DB.");
    }

    const { rows: numbers } = await client.query(
      `SELECT cn.id, cn.company_id, cn.number, cn.status, c.name AS company_name
       FROM client_numbers cn
       JOIN companies c ON c.id = cn.company_id
       WHERE cn.status = 'active'
       ORDER BY cn.company_id, cn.number
       LIMIT 20`,
    );

    if (numbers.length < 2) {
      console.warn("WARN: menos de 2 numeraciones activas globales.");
    } else {
      const a = numbers[0];
      const b = numbers.find((n) => n.company_id === a.company_id && n.id !== a.id);
      if (b) {
        const { rows: mix } = await client.query(
          `SELECT COUNT(*)::int AS c FROM inbound_sms_messages
           WHERE company_id = $1 AND client_number_id = $2`,
          [a.company_id, a.id],
        );
        const { rows: mixB } = await client.query(
          `SELECT COUNT(*)::int AS c FROM inbound_sms_messages
           WHERE company_id = $1 AND client_number_id = $2`,
          [b.company_id, b.id],
        );
        ok(
          `Mensajes aislados por numeración en ${a.company_name}: A=${mix[0].c}, B=${mixB[0].c}`,
        );
      }
    }

    const cross = numbers.length >= 2 ? [numbers[0], numbers[1]] : [];
    if (cross.length === 2 && cross[0].company_id !== cross[1].company_id) {
      const { rows: leak } = await client.query(
        `SELECT COUNT(*)::int AS c FROM inbound_sms_messages
         WHERE company_id = $1 AND client_number_id = $2`,
        [cross[0].company_id, cross[1].id],
      );
      if (leak[0].c === 0) {
        ok("Sin mensajes cross-tenant (company_id ≠ dueño numeración).");
      } else {
        fail(`Posible fuga cross-tenant: ${leak[0].c} filas`);
      }
    }

    const { rows: sims } = await client.query(
      `SELECT id, company_id, client_number_id, source, to_number, from_number, body
       FROM inbound_sms_messages
       WHERE source = 'simulation'
       ORDER BY received_at DESC
       LIMIT 5`,
    );
    if (sims.length) {
      for (const s of sims) {
        const { rows: owner } = await client.query(
          `SELECT company_id FROM client_numbers WHERE id = $1`,
          [s.client_number_id],
        );
        if (owner[0]?.company_id === s.company_id) {
          ok(`Simulación ${s.id.slice(0, 8)}… → numeración correcta (${s.to_number})`);
        } else {
          fail(`Simulación ${s.id} con company_id inconsistente`);
        }
      }
    } else {
      console.warn("WARN: aún no hay filas source=simulation (simula desde el panel).");
    }

    console.log("\nChecklist manual pendiente en UI:");
    console.log("- /app/sms-inbox con 2 numeraciones: selector + cambio teléfono/historial");
    console.log("- POST /api/app/sms-inbox/simulate con number_id ajeno → 404");
    console.log("- Botón Simular: loading + badge Simulación + burbuja en teléfono");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
