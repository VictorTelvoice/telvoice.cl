import type { NextFunction, Request, Response } from "express";
import {
  getSmsMessageById,
  getSmsMessageByUid,
  listSmsMessages,
} from "../services/sms.service.js";
import { validateUuidParam } from "../utils/validation.js";

export async function listMessagesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const messages = await listSmsMessages();
    res.status(200).json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMessageByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const message = await getSmsMessageById(id);
    res.status(200).json({ success: true, message });
  } catch (error) {
    next(error);
  }
}

export async function getMessageByUidHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = String(req.params.uid ?? "").trim();
    if (!uid) {
      res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "uid es obligatorio." },
      });
      return;
    }
    const message = await getSmsMessageByUid(uid);
    res.status(200).json({ success: true, message });
  } catch (error) {
    next(error);
  }
}
