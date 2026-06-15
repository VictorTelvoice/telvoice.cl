import { isClientPanelAgentLineEnabled } from "../../config/env.js";

export type AppNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
};

/** Acción principal del panel — primero en el menú, diseño diferenciado. */
export const APP_NAV_SEND_SMS: AppNavItem = {
  id: "send-sms",
  label: "Enviar SMS",
  href: "/app/send-sms",
  icon: "send",
};

/** Sección principal tras Enviar SMS. */
export const APP_NAV_PRIMARY: AppNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/dashboard", icon: "dashboard" },
  { id: "reports", label: "Reportes", href: "/app/reports", icon: "bar_chart" },
  { id: "inbox", label: "Bandeja", href: "/app/inbox", icon: "inbox" },
  { id: "wallet", label: "Mi saldo", href: "/app/wallet", icon: "account_balance_wallet" },
  { id: "campaigns", label: "Campañas", href: "/app/campaigns", icon: "campaign" },
];

/** Agente Telvoice y planes — solo con CLIENT_PANEL_AGENT_LINE_ENABLED. */
const APP_NAV_AGENT_LINE_ITEMS: AppNavItem[] = [
  { id: "agente", label: "Agente Telvoice", href: "/app/agente", icon: "smart_toy" },
  { id: "agent-plans", label: "Planes de numeración SIM", href: "/app/planes-agente", icon: "workspace_premium" },
];

export function getAppNavAgentLine(): AppNavItem[] {
  return isClientPanelAgentLineEnabled() ? APP_NAV_AGENT_LINE_ITEMS : [];
}

export const APP_ORDERS_NAV: AppNavItem = {
  id: "orders",
  label: "Mis órdenes",
  href: "/app/orders",
  icon: "receipt",
};

export const APP_NUMERACIONES_NAV: AppNavItem = {
  id: "numeraciones",
  label: "Mis numeraciones",
  href: "/app/numeraciones",
  icon: "sim_card",
};

export const APP_SMS_INBOX_NAV: AppNavItem = {
  id: "sms-inbox",
  label: "SMS entrantes",
  href: "/app/sms-inbox",
  icon: "sms",
};

/** Resto del menú (orden original, sin ítems ya listados arriba). */
export const APP_NAV_REST: AppNavItem[] = [
  { id: "buy-sms", label: "Comprar SMS", href: "/app/buy-sms", icon: "shopping_cart" },
  APP_ORDERS_NAV,
  APP_NUMERACIONES_NAV,
  APP_SMS_INBOX_NAV,
  { id: "contacts", label: "Contactos", href: "/app/contacts", icon: "contacts" },
  { id: "templates", label: "Plantillas", href: "/app/templates", icon: "description" },
  { id: "invoices", label: "Facturas", href: "/app/invoices", icon: "receipt_long" },
  { id: "api", label: "API", href: "/app/api", icon: "api" },
  { id: "support", label: "Soporte", href: "/app/support", icon: "support_agent" },
  { id: "settings", label: "Configuración", href: "/app/settings", icon: "settings" },
];

/** Orden completo (compatibilidad). */
export const APP_NAV: AppNavItem[] = [
  APP_NAV_SEND_SMS,
  ...APP_NAV_PRIMARY,
  ...getAppNavAgentLine(),
  ...APP_NAV_REST,
];
