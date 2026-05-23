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
  { id: "reports", href: "/admin/reports", label: "Reportes", icon: "analytics" },
  { id: "contacts", href: "/admin/contacts", label: "Contactos", icon: "contacts" },
  { id: "bot", href: "/admin/telegram/diagnostics", label: "Bot", icon: "smart_toy" },
  { id: "invoices", href: "/admin/invoices", label: "Facturas", icon: "receipt_long" },
  { id: "templates", href: "/admin/templates", label: "Plantillas", icon: "description" },
  { id: "chat", href: "/admin/chat", label: "Chat", icon: "chat" },
  { id: "api", href: "/admin/asmsc/diagnostics", label: "API", icon: "api" },
];

export const SYSTEM_NAV: NavItem[] = [
  { id: "client", href: "/admin/clients/test", label: "Cliente prueba", icon: "business" },
  { id: "credit", href: "/admin/clients/test/credit", label: "Saldo / crédito", icon: "account_balance_wallet" },
  { id: "ledger", href: "/admin/clients/test/ledger", label: "Ledger técnico", icon: "receipt" },
  { id: "leads-legacy", href: "/admin/leads", label: "Leads (legacy)", icon: "group" },
  { id: "calculator", href: "/admin/calculator", label: "Calculadora", icon: "calculate" },
  { id: "web-leads", href: "/admin/web-agent/leads", label: "Leads web", icon: "language" },
  { id: "pricing-tiers", href: "/admin/pricing-tiers", label: "Tramos precio", icon: "sell" },
  { id: "settings", href: "/admin/settings", label: "Configuración", icon: "settings" },
];
