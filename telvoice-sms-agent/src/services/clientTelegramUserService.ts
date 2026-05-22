import { getSupabase } from "../database/supabaseClient.js";
import type {
  ClientTelegramUserRow,
  CreateClientTelegramUserInput,
  UpdateClientTelegramUserInput,
} from "../types/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import {
  isDuplicateTelegramUserError,
} from "../utils/telegram-user-validation.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function listTelegramUsersByClientId(
  clientId: string,
): Promise<ClientTelegramUserRow[]> {
  const { data, error } = await getSupabase()
    .from("client_telegram_users")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    wrapSupabaseError(error, "listTelegramUsersByClientId");
  }

  return (data ?? []) as ClientTelegramUserRow[];
}

export async function getTelegramUserById(
  id: string,
): Promise<ClientTelegramUserRow> {
  const { data, error } = await getSupabase()
    .from("client_telegram_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getTelegramUserById");
  }

  if (!data) {
    throw new NotFoundError(`Usuario Telegram no encontrado: ${id}`);
  }

  return data as ClientTelegramUserRow;
}

export async function createTelegramUser(
  input: CreateClientTelegramUserInput,
): Promise<ClientTelegramUserRow> {
  const { data, error } = await getSupabase()
    .from("client_telegram_users")
    .insert({
      client_id: input.client_id,
      telegram_user_id: input.telegram_user_id,
      telegram_chat_id: input.telegram_chat_id ?? null,
      telegram_username: input.telegram_username ?? null,
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
      role: input.role,
      is_active: input.is_active ?? true,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (isDuplicateTelegramUserError(error)) {
      throw new ValidationError(
        `El Telegram user_id ${input.telegram_user_id} ya está registrado para este cliente.`,
      );
    }
    wrapSupabaseError(error, "createTelegramUser");
  }

  return data as ClientTelegramUserRow;
}

export async function updateTelegramUser(
  id: string,
  input: UpdateClientTelegramUserInput,
): Promise<ClientTelegramUserRow> {
  const patch: Record<string, unknown> = {};

  if (input.telegram_chat_id !== undefined) {
    patch.telegram_chat_id = input.telegram_chat_id;
  }
  if (input.telegram_username !== undefined) {
    patch.telegram_username = input.telegram_username;
  }
  if (input.first_name !== undefined) {
    patch.first_name = input.first_name;
  }
  if (input.last_name !== undefined) {
    patch.last_name = input.last_name;
  }
  if (input.role !== undefined) {
    patch.role = input.role;
  }
  if (input.is_active !== undefined) {
    patch.is_active = input.is_active;
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes;
  }

  const { data, error } = await getSupabase()
    .from("client_telegram_users")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateTelegramUser");
  }

  return data as ClientTelegramUserRow;
}

export async function deactivateTelegramUser(
  id: string,
): Promise<ClientTelegramUserRow> {
  return updateTelegramUser(id, { is_active: false });
}

export async function deleteTelegramUser(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("client_telegram_users")
    .delete()
    .eq("id", id);

  if (error) {
    wrapSupabaseError(error, "deleteTelegramUser");
  }
}

export async function findActiveTelegramUserByTelegramUserId(
  telegramUserId: string,
): Promise<ClientTelegramUserRow | null> {
  const { data, error } = await getSupabase()
    .from("client_telegram_users")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "findActiveTelegramUserByTelegramUserId");
  }

  return data as ClientTelegramUserRow | null;
}
