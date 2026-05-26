import type { CampaignAudienceMember } from "../types/campaign-audience.js";
import type { SmsCampaignRow } from "../types/sms-panel.js";
import { AppError } from "../utils/errors.js";
import { findCompanyById } from "./companyService.js";
import {
  parseAudienceSourceFromCampaignMetadata,
  resolveCampaignAudience,
  validateCampaignAudience,
} from "./campaignAudienceService.js";
import { sendViaMockProvider } from "./mockSmsProviderService.js";
import {
  createPanelSmsMessage,
  insertPanelDeliveryEvent,
  listPanelMessagesByCampaign,
  updatePanelSmsMessage,
} from "./panelSmsMessageService.js";
import { getCampaignByIdForCompany, updateSmsCampaign } from "./smsCampaignService.js";
import { calculateSmsSegments, validateRecipientNumber } from "./smsSegmentService.js";
import {
  debitSmsUsage,
  getCompanyBalance,
  getOrCreateCompanyWallet,
} from "./smsWalletService.js";
import { hasSmsDebitForCampaign } from "./walletTransactionService.js";

export type CampaignMockExecuteResult = {
  campaignId: string;
  status: "completed" | "failed";
  sent: number;
  failed: number;
  realSmsCost: number;
  balanceAfter: number;
  alreadyExecuted?: boolean;
};

async function assertCompanyCanMockExecute(companyId: string): Promise<void> {
  const company = await findCompanyById(companyId);
  if (!company) {
    throw new AppError("Empresa no encontrada.", 404);
  }
  if (company.status !== "active") {
    throw new AppError(
      `La cuenta empresa está en estado «${company.status}»; no permite envíos.`,
      403,
    );
  }
}

function assertMockDraftCampaign(campaign: SmsCampaignRow): void {
  if (campaign.mode !== "mock") {
    throw new AppError(
      "Solo se pueden ejecutar en simulación campañas con modo mock.",
      400,
    );
  }
  if (campaign.status !== "draft") {
    throw new AppError(
      `La campaña está en estado «${campaign.status}»; solo borradores pueden ejecutarse.`,
      400,
    );
  }
  const meta = campaign.metadata ?? {};
  if (meta.source !== "contacts_audience") {
    throw new AppError(
      "Esta campaña no proviene de contactos; no admite ejecución mock del panel.",
      400,
    );
  }
}

function normalizeRecipientPhone(member: CampaignAudienceMember): string | null {
  const check = validateRecipientNumber(
    member.phoneNormalized || member.phone,
  );
  return check.ok && check.normalized ? check.normalized : null;
}

async function buildAlreadyExecutedResult(
  campaign: SmsCampaignRow,
  companyId: string,
): Promise<CampaignMockExecuteResult> {
  const balanceAfter = (await getCompanyBalance(companyId)).availableSms;
  const finalStatus =
    campaign.status === "failed" ? "failed" : "completed";

  return {
    campaignId: campaign.id,
    status: finalStatus,
    sent: campaign.valid_recipients,
    failed: 0,
    realSmsCost: campaign.real_sms_cost,
    balanceAfter,
    alreadyExecuted: true,
  };
}

async function sendOneMockMessage(input: {
  companyId: string;
  campaignId: string;
  contactId: string;
  senderId: string;
  messageText: string;
  phone: string;
  segmentInfo: ReturnType<typeof calculateSmsSegments>;
}): Promise<{ ok: true; costSms: number } | { ok: false; error: string }> {
  const {
    companyId,
    campaignId,
    contactId,
    senderId,
    messageText,
    phone,
    segmentInfo,
  } = input;

  try {
    const pendingMessage = await createPanelSmsMessage({
      companyId,
      campaignId,
      recipientNumber: phone,
      senderId,
      message: messageText,
      segments: segmentInfo.segments,
      costSms: segmentInfo.costSms,
      status: "queued",
      mode: "mock",
      provider: "mock",
      metadata: {
        source: "app_campaign_mock_execute",
        simulated: true,
        campaign_id: campaignId,
        contact_id: contactId,
        encoding: segmentInfo.encoding,
        characters: segmentInfo.characters,
      },
    });

    const mockResult = sendViaMockProvider({
      to: phone,
      from: senderId,
      message: messageText,
      segments: segmentInfo.segments,
    });

    const sentAt = mockResult.sentAt;
    const deliveredAt = new Date(
      new Date(sentAt).getTime() + 500,
    ).toISOString();

    await updatePanelSmsMessage(pendingMessage.id, {
      status: "sent",
      provider: "mock",
      provider_message_id: mockResult.providerMessageId,
      operator: mockResult.operator,
      sent_at: sentAt,
      metadata: {
        source: "app_campaign_mock_execute",
        simulated: true,
        mode: "mock",
        campaign_id: campaignId,
        contact_id: contactId,
      },
    });

    await insertPanelDeliveryEvent({
      companyId,
      messageId: pendingMessage.id,
      provider: "mock",
      providerMessageId: mockResult.providerMessageId,
      status: "sent",
      rawPayload: {
        event: "submit_accepted",
        simulated: true,
        operator: mockResult.operator,
      },
    });

    await updatePanelSmsMessage(pendingMessage.id, {
      status: "delivered",
      delivered_at: deliveredAt,
      metadata: {
        source: "app_campaign_mock_execute",
        simulated: true,
        mode: "mock",
        campaign_id: campaignId,
        contact_id: contactId,
      },
    });

    await insertPanelDeliveryEvent({
      companyId,
      messageId: pendingMessage.id,
      provider: "mock",
      providerMessageId: mockResult.providerMessageId,
      status: "delivered",
      rawPayload: {
        event: "dlr_delivered",
        simulated: true,
        operator: mockResult.operator,
      },
    });

    return { ok: true, costSms: segmentInfo.costSms };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error en simulación mock",
    };
  }
}

export async function executeContactsAudienceCampaignMock(input: {
  companyId: string;
  campaignId: string;
  createdBy?: string | null;
}): Promise<CampaignMockExecuteResult> {
  await assertCompanyCanMockExecute(input.companyId);

  const campaign = await getCampaignByIdForCompany(
    input.campaignId,
    input.companyId,
  );
  if (!campaign) {
    throw new AppError("Campaña no encontrada.", 404);
  }

  if (await hasSmsDebitForCampaign(campaign.id)) {
    if (campaign.status === "completed" || campaign.status === "failed") {
      return buildAlreadyExecutedResult(campaign, input.companyId);
    }
    throw new AppError(
      "Esta campaña ya tiene un débito registrado; no se puede ejecutar de nuevo.",
      409,
    );
  }

  assertMockDraftCampaign(campaign);

  const existingMessages = await listPanelMessagesByCampaign(
    campaign.id,
    1,
  );
  if (existingMessages.length > 0) {
    throw new AppError("Esta campaña ya tiene mensajes registrados.", 409);
  }

  const audienceSource = parseAudienceSourceFromCampaignMetadata(
    campaign.metadata ?? {},
  );
  if (!audienceSource) {
    throw new AppError(
      "No se pudo reconstruir la audiencia de la campaña.",
      400,
    );
  }

  const audience = validateCampaignAudience(
    await resolveCampaignAudience(input.companyId, audienceSource),
  );

  const messageText = String(campaign.message ?? "").trim();
  if (!messageText) {
    throw new AppError("La campaña no tiene mensaje.", 400);
  }

  const senderId = String(campaign.sender_id ?? "").trim();
  if (!senderId) {
    throw new AppError("La campaña no tiene remitente (Sender ID).", 400);
  }

  const segmentInfo = calculateSmsSegments(messageText);
  if (segmentInfo.segments < 1) {
    throw new AppError("El mensaje no genera segmentos válidos.", 400);
  }

  const totalCost = audience.validCount * segmentInfo.costSms;

  const wallet = await getOrCreateCompanyWallet(input.companyId);
  if (wallet.status !== "active") {
    throw new AppError(
      `Wallet en estado «${wallet.status}»; no permite envíos.`,
      403,
    );
  }

  const balanceBefore = wallet.available_sms;
  if (balanceBefore < totalCost) {
    throw new AppError(
      `Saldo insuficiente: necesitas ${totalCost} SMS y tienes ${balanceBefore}.`,
      400,
    );
  }

  await updateSmsCampaign(campaign.id, {
    status: "processing",
    metadata: {
      ...campaign.metadata,
      mock_execute_started_at: new Date().toISOString(),
    },
  });

  let sent = 0;
  let failed = 0;
  let realSmsCost = 0;

  for (const member of audience.validRecipients) {
    const phone = normalizeRecipientPhone(member);
    if (!phone) {
      failed += 1;
      continue;
    }

    const result = await sendOneMockMessage({
      companyId: input.companyId,
      campaignId: campaign.id,
      contactId: member.contactId,
      senderId,
      messageText,
      phone,
      segmentInfo,
    });

    if (result.ok) {
      sent += 1;
      realSmsCost += result.costSms;
    } else {
      failed += 1;
    }
  }

  const finalStatus = sent > 0 ? "completed" : "failed";
  const sentAt = new Date().toISOString();

  if (realSmsCost > 0) {
    if (await hasSmsDebitForCampaign(campaign.id)) {
      return buildAlreadyExecutedResult(
        await getCampaignByIdForCompany(campaign.id, input.companyId) ?? campaign,
        input.companyId,
      );
    }

    await debitSmsUsage({
      companyId: input.companyId,
      amount: realSmsCost,
      referenceType: "sms_campaign",
      referenceId: campaign.id,
      actorUserId: input.createdBy ?? null,
      description: "Consumo por campaña SMS mock",
      metadata: {
        source: "campaign_mock_execution",
        recipient_count: sent,
        message_count: sent,
        segments_per_message: segmentInfo.segments,
        encoding: segmentInfo.encoding,
        simulated: true,
      },
    });
  }

  await updateSmsCampaign(campaign.id, {
    status: finalStatus,
    total_recipients: audience.totalFound,
    valid_recipients: sent,
    invalid_recipients:
      audience.invalidCount +
      audience.blockedCount +
      audience.optOutCount +
      audience.duplicatesOmitted +
      failed,
    real_sms_cost: realSmsCost,
    sent_at: sentAt,
    metadata: {
      ...campaign.metadata,
      send_enabled: true,
      mock_executed_at: sentAt,
      mock_execute_sent: sent,
      mock_execute_failed: failed,
      simulated: true,
    },
  });

  const balanceAfter = (await getCompanyBalance(input.companyId)).availableSms;

  return {
    campaignId: campaign.id,
    status: finalStatus,
    sent,
    failed,
    realSmsCost,
    balanceAfter,
  };
}
