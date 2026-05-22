import type { ClientRow } from "../types/database.js";
import type { ClientTelegramUserRow } from "../types/database.js";
import { getClientById } from "./clientService.js";
import { findActiveTelegramUserByTelegramUserId } from "./clientTelegramUserService.js";

export interface TelegramPermissions {
  canSendSms: boolean;
  canViewBalance: boolean;
  canViewHistory: boolean;
  canManageUsers: boolean;
}

export interface AuthorizedTelegramClient {
  client: ClientRow;
  telegramUser: ClientTelegramUserRow;
  role: ClientTelegramUserRow["role"];
  permissions: TelegramPermissions;
}

function permissionsForRole(role: string): TelegramPermissions {
  switch (role) {
    case "owner":
      return {
        canSendSms: true,
        canViewBalance: true,
        canViewHistory: true,
        canManageUsers: true,
      };
    case "operator":
      return {
        canSendSms: true,
        canViewBalance: true,
        canViewHistory: true,
        canManageUsers: false,
      };
    case "viewer":
      return {
        canSendSms: false,
        canViewBalance: true,
        canViewHistory: true,
        canManageUsers: false,
      };
    default:
      return {
        canSendSms: false,
        canViewBalance: false,
        canViewHistory: false,
        canManageUsers: false,
      };
  }
}

/**
 * Resuelve qué cliente opera un usuario Telegram autorizado en la base de datos.
 * Devuelve null si no existe registro activo o el cliente no está activo.
 */
export async function getAuthorizedTelegramClient(
  telegramUserId: string | number,
): Promise<AuthorizedTelegramClient | null> {
  const id = String(telegramUserId).trim();
  if (!id) {
    return null;
  }

  const telegramUser = await findActiveTelegramUserByTelegramUserId(id);
  if (!telegramUser) {
    return null;
  }

  const client = await getClientById(telegramUser.client_id);
  if (!client || client.status !== "active") {
    return null;
  }

  return {
    client,
    telegramUser,
    role: telegramUser.role,
    permissions: permissionsForRole(telegramUser.role),
  };
}
