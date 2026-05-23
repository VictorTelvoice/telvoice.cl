import type { NextFunction, Request, Response } from "express";
import { processPanelSmsDlrFromAsmsc } from "../services/panelSmsDlrService.js";
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
    const panelResult = await processPanelSmsDlrFromAsmsc(body);

    res.status(200).json({
      success: true,
      received: true,
      dlr_event_id: result.dlr_event_id,
      sms_message_id: result.sms_message_id,
      panel_message_id: panelResult.panel_message_id,
    });
  } catch (error) {
    next(error);
  }
}

/** Alias genérico DLR panel + legacy aSMSC */
export async function smsDlrHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  return asmscDlrHandler(req, res, next);
}
