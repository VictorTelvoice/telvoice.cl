import type { NextFunction, Request, Response } from "express";
import {
  createTelegramUser,
  deactivateTelegramUser,
  deleteTelegramUser,
  getTelegramUserById,
  listTelegramUsersByClientId,
  updateTelegramUser,
} from "../services/clientTelegramUserService.js";
import { getOrCreateTestClient } from "../services/clientService.js";
import { sendTelegramTestToUser } from "../services/telegramTestService.js";
import { AppError, ValidationError } from "../utils/errors.js";
import { parseTelegramUserFormBody } from "../utils/telegram-user-validation.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  renderTelegramUserFormPage,
  renderTelegramUsersListPage,
} from "../views/admin-pages.js";

async function getTestClientContext() {
  const client = await getOrCreateTestClient();
  const users = await listTelegramUsersByClientId(client.id);
  return { client, users };
}

export async function getTestClientTelegramUsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { client, users } = await getTestClientContext();
    const success =
      typeof req.query.success === "string" ? req.query.success : undefined;
    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;

    res.type("html").send(
      renderTelegramUsersListPage({
        admin: req.adminUser!,
        clientName: client.company_name,
        users,
        successMessage: success,
        error,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export function getNewTelegramUserForm(_req: Request, res: Response): void {
  res.redirect("/admin/clients/test/telegram-users#agregar");
}

export async function postCreateTelegramUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const form = parseTelegramUserFormBody(req.body);

    await createTelegramUser({
      client_id: client.id,
      ...form,
    });

    res.redirect(
      `/admin/clients/test/telegram-users?success=${encodeURIComponent("Usuario Telegram autorizado correctamente.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const { client, users } = await getTestClientContext();
      res.type("html").send(
        renderTelegramUsersListPage({
          admin: req.adminUser!,
          clientName: client.company_name,
          users,
          formError: error.message,
          formValues: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getEditTelegramUserForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const user = await getTelegramUserById(id);

    if (user.client_id !== client.id) {
      res.redirect("/admin/clients/test/telegram-users?error=Usuario+no+pertenece+al+cliente+de+prueba");
      return;
    }

    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;

    res.type("html").send(
      renderTelegramUserFormPage({
        admin: req.adminUser!,
        clientName: client.company_name,
        mode: "edit",
        user,
        error,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditTelegramUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const existing = await getTelegramUserById(id);

    if (existing.client_id !== client.id) {
      res.redirect("/admin/clients/test/telegram-users?error=Usuario+no+pertenece+al+cliente+de+prueba");
      return;
    }

    const form = parseTelegramUserFormBody(req.body, {
      requireTelegramUserId: false,
    });

    await updateTelegramUser(id, {
      telegram_chat_id: form.telegram_chat_id,
      telegram_username: form.telegram_username,
      first_name: form.first_name,
      last_name: form.last_name,
      role: form.role,
      is_active: form.is_active,
      notes: form.notes,
    });

    res.redirect(
      `/admin/clients/test/telegram-users?success=${encodeURIComponent("Usuario Telegram actualizado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const id = String(req.params.id ?? "");
      try {
        const user = await getTelegramUserById(validateUuidParam(id, "id"));
        const client = await getOrCreateTestClient();
        res.type("html").send(
          renderTelegramUserFormPage({
            admin: req.adminUser!,
            clientName: client.company_name,
            mode: "edit",
            user,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function postDeactivateTelegramUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const user = await getTelegramUserById(id);

    if (user.client_id !== client.id) {
      res.redirect("/admin/clients/test/telegram-users?error=Usuario+no+pertenece+al+cliente+de+prueba");
      return;
    }

    await deactivateTelegramUser(id);
    res.redirect(
      `/admin/clients/test/telegram-users?success=${encodeURIComponent("Usuario Telegram desactivado.")}`,
    );
  } catch (error) {
    next(error);
  }
}

export async function postTestTelegramUser(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const user = await getTelegramUserById(id);

    if (user.client_id !== client.id) {
      res.redirect(
        "/admin/clients/test?telegram_test_error=" +
          encodeURIComponent("Usuario no pertenece al cliente de prueba."),
      );
      return;
    }

    if (!user.is_active) {
      res.redirect(
        "/admin/clients/test?telegram_test_error=" +
          encodeURIComponent("El usuario Telegram está inactivo."),
      );
      return;
    }

    const result = await sendTelegramTestToUser(user);
    res.redirect(
      `/admin/clients/test?telegram_test_result=${encodeURIComponent(
        `Mensaje enviado a chat_id ${result.chat_id} (message_id ${result.message_id}).`,
      )}`,
    );
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error al enviar test Telegram";
    res.redirect(
      `/admin/clients/test?telegram_test_error=${encodeURIComponent(msg)}`,
    );
  }
}

export async function postDeleteTelegramUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const user = await getTelegramUserById(id);

    if (user.client_id !== client.id) {
      res.redirect("/admin/clients/test/telegram-users?error=Usuario+no+pertenece+al+cliente+de+prueba");
      return;
    }

    await deleteTelegramUser(id);
    res.redirect(
      `/admin/clients/test/telegram-users?success=${encodeURIComponent("Usuario Telegram eliminado.")}`,
    );
  } catch (error) {
    next(error);
  }
}
