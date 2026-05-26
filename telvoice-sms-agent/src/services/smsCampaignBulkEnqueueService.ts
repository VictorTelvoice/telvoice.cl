import type { ResolvedSmsRoute } from "../types/sms-routing.js";
import { env } from "../config/env.js";
import { createPanelSmsMessagesBulk } from "./panelSmsMessageService.js";
import { enqueueMessagesBulk } from "./smsQueueService.js";
import { APP_CAMPAIGN_SEND_SOURCE } from "./smsCampaignPolicy.js";

export type BulkCampaignItem = {
  phone: string;
  messageText: string;
  segments: number;
  costSms: number;
  encoding: string;
  characters: number;
};

const INSERT_CHUNK = 500;

export async function bulkEnqueueCampaignRecipients(input: {
  companyId: string;
  campaignId: string;
  senderId: string;
  items: BulkCampaignItem[];
  scheduledAt: string;
  resolved: ResolvedSmsRoute;
}): Promise<{ queued: number; failed: number }> {
  if (input.items.length === 0) {
    return { queued: 0, failed: 0 };
  }

  const effectiveSender =
    input.senderId ||
    input.resolved.provider.default_sender_id ||
    "TELVOICE";
  const trafficType = env.smsCampaign.trafficType;
  // panel_sms_messages.mode solo permite: mock | live | live_test
  const panelMessageMode =
    env.smsProvider.mode === "mock" ? "mock" : "live_test";
  let queued = 0;
  let failed = 0;

  for (let offset = 0; offset < input.items.length; offset += INSERT_CHUNK) {
    const chunk = input.items.slice(offset, offset + INSERT_CHUNK);
    const messagePayloads = chunk.map((item) => ({
      companyId: input.companyId,
      campaignId: input.campaignId,
      recipientNumber: item.phone,
      senderId: effectiveSender,
      message: item.messageText,
      segments: item.segments,
      costSms: item.costSms,
      provider: input.resolved.provider.code,
      status: "queued" as const,
      mode: panelMessageMode,
      metadata: {
        source: APP_CAMPAIGN_SEND_SOURCE,
        send_mode: "bulk_queue",
        encoding: item.encoding,
        characters: item.characters,
        provider_id: input.resolved.provider.id,
        route_id: input.resolved.route.id,
        rate_plan_id: input.resolved.ratePlan.id,
      },
    }));

    let messages;
    try {
      messages = await createPanelSmsMessagesBulk(messagePayloads);
    } catch (err) {
      failed += chunk.length;
      continue;
    }

    if (messages.length === 0) {
      failed += chunk.length;
      continue;
    }

    const queuePayloads = messages.map((m) => ({
      companyId: input.companyId,
      messageId: m.id,
      campaignId: input.campaignId,
      providerId: input.resolved.provider.id,
      routeId: input.resolved.route.id,
      ratePlanId: input.resolved.ratePlan.id,
      trafficType,
      scheduledAt: input.scheduledAt,
      priority: 50,
      metadata: {
        source: APP_CAMPAIGN_SEND_SOURCE,
        panel_message_id: m.id,
        flow: "campaign",
      },
    }));

    try {
      await enqueueMessagesBulk(queuePayloads);
      queued += messages.length;
      failed += chunk.length - messages.length;
    } catch {
      failed += messages.length;
    }
  }

  return { queued, failed };
}

/** Estima si la campaña debe ir siempre por cola (evita POST síncrono). */
export function shouldEnqueueCampaignViaBulk(
  mode: "mass" | "scheduled",
  recipientCount: number,
): boolean {
  if (mode === "scheduled") {
    return true;
  }
  if (mode === "mass") {
    return recipientCount >= env.smsCampaign.bulkQueueMinRecipients;
  }
  return false;
}
