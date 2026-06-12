import pg from "pg";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const { Client } = pg;

export function assertDatabaseUrl(): string {
  const url = env.databaseUrl?.trim();
  if (!url) {
    throw new AppError(
      "DATABASE_URL no configurado — requerido para auditoría transaccional.",
      503,
      "DATABASE_URL_MISSING",
    );
  }
  return url;
}

export function createPgClient(): pg.Client {
  const connectionString = assertDatabaseUrl();
  return new Client({
    connectionString,
    ssl: connectionString.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export async function withPgTransaction<T>(
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = createPgClient();
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}
