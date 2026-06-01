/**
 * Resolución de empresa para scripts de auditoría (read-only).
 * Requiere --company-id / TEST_COMPANY_ID o --company-name / TEST_COMPANY_NAME.
 */

export function parseAuditCompanyArgs(argv) {
  const out = {
    companyId: process.env.TEST_COMPANY_ID?.trim() ?? "",
    companyName: process.env.TEST_COMPANY_NAME?.trim() ?? "",
    windowHours: Number.parseInt(process.env.AUDIT_WINDOW_HOURS ?? "6", 10) || 6,
    baseUrl: (
      process.env.BASE_URL ||
      process.env.PROD_APP_URL ||
      process.env.PUBLIC_APP_URL ||
      ""
    )
      .trim()
      .replace(/\/$/, ""),
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--company-id" && argv[i + 1]) {
      out.companyId = argv[++i].trim();
    } else if (a === "--company-name" && argv[i + 1]) {
      out.companyName = argv[++i].trim();
    } else if (a === "--window-hours" && argv[i + 1]) {
      out.windowHours = Number.parseInt(argv[++i], 10) || out.windowHours;
    } else if (a === "--base-url" && argv[i + 1]) {
      out.baseUrl = argv[++i].trim().replace(/\/$/, "");
    }
  }

  return out;
}

export function requireCompanyArgsHelp() {
  return [
    "Indica la empresa con una de estas opciones:",
    "  --company-id <UUID>     o  TEST_COMPANY_ID=<UUID>",
    "  --company-name <texto>  o  TEST_COMPANY_NAME=<texto>",
  ].join("\n");
}

/**
 * @param {import("pg").Client | import("pg").PoolClient} client
 */
export async function resolveAuditCompany(client, { companyId, companyName }) {
  if (companyId) {
    const { rows } = await client.query(
      `SELECT id, name FROM companies WHERE id = $1::uuid`,
      [companyId],
    );
    if (!rows[0]) {
      console.error(`Empresa no encontrada (id): ${companyId}`);
      process.exit(1);
    }
    return rows[0];
  }

  if (companyName) {
    const { rows } = await client.query(
      `SELECT id, name FROM companies WHERE name ILIKE $1 ORDER BY name LIMIT 1`,
      [`%${companyName}%`],
    );
    if (!rows[0]) {
      console.error(`Empresa no encontrada (nombre): ${companyName}`);
      process.exit(1);
    }
    return rows[0];
  }

  console.error(requireCompanyArgsHelp());
  process.exit(1);
}
