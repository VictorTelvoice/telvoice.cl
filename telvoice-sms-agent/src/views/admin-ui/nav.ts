/** Navegación principal del panel (rutas existentes donde aplica). */
export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: string;
}

export const MAIN_NAV: NavItem[] = [
  { id: "dashboard", href: "/admin", label: "Dashboard", icon: "dashboard" },
  { id: "send", href: "/admin/sms/send-test", label: "Enviar SMS", icon: "send" },
  { id: "inbox", href: "/admin/inbox", label: "Bandeja", icon: "inbox" },
  { id: "reports", href: "/admin/clients/test/ledger", label: "Reportes", icon: "analytics" },
  { id: "contacts", href: "/admin/leads", label: "Contactos", icon: "contacts" },
  { id: "bot", href: "/admin/telegram/diagnostics", label: "Bot", icon: "smart_toy" },
  { id: "invoices", href: "/admin/products", label: "Facturas", icon: "receipt_long" },
  { id: "templates", href: "/admin/knowledge", label: "Plantillas", icon: "description" },
  { id: "chat", href: "/admin/web-agent/sessions", label: "Chat", icon: "chat" },
  { id: "api", href: "/admin/asmsc/diagnostics", label: "API", icon: "api" },
];

export const SYSTEM_NAV: NavItem[] = [
  { id: "client", href: "/admin/clients/test", label: "Cliente prueba", icon: "business" },
  { id: "credit", href: "/admin/clients/test/credit", label: "Saldo / crédito", icon: "account_balance_wallet" },
  { id: "calculator", href: "/admin/calculator", label: "Calculadora", icon: "calculate" },
  { id: "web-leads", href: "/admin/web-agent/leads", label: "Leads web", icon: "language" },
  { id: "pricing-tiers", href: "/admin/pricing-tiers", label: "Tramos precio", icon: "sell" },
  { id: "settings", href: "/admin/settings", label: "Configuración", icon: "settings" },
];
