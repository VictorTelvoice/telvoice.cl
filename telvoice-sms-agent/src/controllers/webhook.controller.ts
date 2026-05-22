import type { NextFunction, Request, Response } from "express";
import { processAsmscDlrWebhook } from "../services/sms.service.js";
import type { AsmscDlrWebhookBody } from "../types/asmsc.js";

export async function asmscDlrHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = (req.body ?? {}) as AsmscDlrWebhookBody;
    const result = await processAsmscDlrWebhook(body);

    res.status(200).json({
      success: true,
      received: true,
      dlr_event_id: result.dlr_event_id,
      sms_message_id: result.sms_message_id,
    });
  } catch (error) {
    next(error);
  }
}
