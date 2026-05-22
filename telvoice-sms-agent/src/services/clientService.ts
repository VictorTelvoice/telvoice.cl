import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { ClientRow, ClientSmsAccountRow } from "../types/database.js";
import { AppError, NotFoundError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { ensureBalanceForClient } from "./balanceService.js";

export const TEST_CLIENT_COMPANY = "PRUEBA_TELVOICE";
export const TEST_CLIENT_EMAIL = "prueba@telvoice.cl";

export interface TestClientBundle {
  client: ClientRow;
  sms_account: Omit<ClientSmsAccountRow, "api_password_encrypted"> & {
    api_password_encrypted: "[redacted]";
  };
}

export async function getOrCreateTestClient(): Promise<ClientRow> {
  const existing = await getClientByCompanyName(TEST_CLIENT_COMPANY);
  if (existing) {
    return existing;
  }

  const { data, error } = await getSupabase()
    .from("clients")
    .insert({
      company_name: TEST_CLIENT_COMPANY,
      email: TEST_CLIENT_EMAIL,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "getOrCreateTestClient");
  }

  return data as ClientRow;
}

export async function getOrCreateTestSmsAccount(
  clientId: string,
): Promise<ClientSmsAccountRow> {
  const existing = await getActiveSmsAccountForClient(clientId, "asmsc");
  if (existing) {
    return existing;
  }

  if (!env.asmsc.apiId || !env.asmsc.apiPassword) {
    throw new AppError(
      "ASMSC_API_ID y ASMSC_API_PASSWORD son requeridos para crear la cuenta SMS de prueba.",
      503,
      "ASMSC_NOT_CONFIGURED",
    );
  }

  const { data, error } = await getSupabase()
    .from("client_sms_accounts")
    .insert({
      client_id: clientId,
      provider: "asmsc",
      api_id: env.asmsc.apiId,
      // TODO: implementar cifrado real con ENCRYPTION_KEY antes de producción.
      api_password_encrypted: env.asmsc.apiPassword,
      default_sender_id: env.asmsc.defaultSenderId || null,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "getOrCreateTestSmsAccount");
  }

  return data as ClientSmsAccountRow;
}

export async function ensureTestClientSetup(): Promise<TestClientBundle> {
  const client = await getOrCreateTestClient();
  const smsAccount = await getOrCreateTestSmsAccount(client.id);
  await ensureBalanceForClient(client.id);
  return {
    client,
    sms_account: redactSmsAccount(smsAccount),
  };
}

export async function getTestClientBundle(): Promise<TestClientBundle> {
  const client = await getOrCreateTestClient();
  const smsAccount = await getOrCreateTestSmsAccount(client.id);
  return {
    client,
    sms_account: redactSmsAccount(smsAccount),
  };
}

export async function resolveClientForSend(
  clientId?: string,
): Promise<{ client: ClientRow; sms_account: ClientSmsAccountRow }> {
  if (clientId) {
    const client = await getClientById(clientId);
    if (!client) {
      throw new NotFoundError(`Cliente no encontrado: ${clientId}`);
    }
    if (client.status !== "active") {
      throw new AppError(
        `Cliente inactivo: ${client.company_name}`,
        400,
        "CLIENT_INACTIVE",
      );
    }

    const smsAccount = await getActiveSmsAccountForClient(client.id, "asmsc");
    if (!smsAccount) {
      throw new NotFoundError(
        `El cliente ${client.company_name} no tiene cuenta SMS aSMSC activa.`,
      );
    }

    return { client, sms_account: smsAccount };
  }

  const client = await getOrCreateTestClient();
  const smsAccount = await getOrCreateTestSmsAccount(client.id);
  return { client, sms_account: smsAccount };
}

export async function getClientById(id: string): Promise<ClientRow | null> {
  const { data, error } = await getSupabase()
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getClientById");
  }

  return data as ClientRow | null;
}

async function getClientByCompanyName(
  companyName: string,
): Promise<ClientRow | null> {
  const { data, error } = await getSupabase()
    .from("clients")
    .select("*")
    .eq("company_name", companyName)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getClientByCompanyName");
  }

  return data as ClientRow | null;
}

async function getActiveSmsAccountForClient(
  clientId: string,
  provider: string,
): Promise<ClientSmsAccountRow | null> {
  const { data, error } = await getSupabase()
    .from("client_sms_accounts")
    .select("*")
    .eq("client_id", clientId)
    .eq("provider", provider)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getActiveSmsAccountForClient");
  }

  return data as ClientSmsAccountRow | null;
}

function redactSmsAccount(
  account: ClientSmsAccountRow,
): TestClientBundle["sms_account"] {
  return {
    ...account,
    api_password_encrypted: "[redacted]",
  };
}
