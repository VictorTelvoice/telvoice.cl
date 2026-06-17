export type {
  SupportTicketConversationAudience,
  SupportTicketConversationSource,
} from "./shared/support-ticket-conversation-ui.js";

export {
  buildTicketConversationMessages,
  clientTicketConversationScriptFragment,
  formatTicketMessageRole,
  formatTicketStatusForAudience,
  getLastPublicReplyAuthor,
  getSupportTicketConversationDrawerStyles,
  getSupportTicketConversationStyles,
  getTicketChatScrollScript,
  renderTicketComposerClient,
  renderTicketConversation,
  renderTicketDrawerCloseButton,
  renderTicketMessageBubble,
  statusBadgeClass,
} from "./shared/support-ticket-conversation-ui.js";

import { getSupportTicketConversationStyles } from "./shared/support-ticket-conversation-ui.js";

/** @deprecated Prefer CSS from app-panel.css via getSupportTicketConversationStyles */
export type TicketConversationAudience = import("./shared/support-ticket-conversation-ui.js").SupportTicketConversationAudience;

export function supportTicketConversationStyles(): string {
  return `<style>${getSupportTicketConversationStyles()}</style>`;
}
