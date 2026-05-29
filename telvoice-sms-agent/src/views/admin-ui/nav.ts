/** Navegación principal — Superadmin Telvoice (operación interna). */
export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: string;
}

export const MAIN_NAV: NavItem[] = [
  { id: "dashboard", href: "/admin", label: "Dashboard", icon: "dashboard" },
  { id: "clients", href: "/admin/clients", label: "Clientes", icon: "business" },
  { id: "pricing", href: "/admin/pricing", label: "Bolsas y tarifas", icon: "sell" },
  { id: "campaigns", href: "/admin/campaigns", label: "Campañas", icon: "campaign" },
  { id: "messages", href: "/admin/messages", label: "Mensajería", icon: "forum" },
  { id: "dlr", href: "/admin/dlr", label: "DLR / Estados", icon: "mark_email_read" },
  { id: "providers", href: "/admin/providers", label: "Proveedores", icon: "hub" },
  { id: "routes", href: "/admin/routes", label: "Rutas SMS", icon: "route" },
  { id: "rate-plans", href: "/admin/rate-plans", label: "Planes tarifarios", icon: "payments" },
  { id: "traffic-control", href: "/admin/traffic-control", label: "Tráfico / TPS", icon: "speed" },
  { id: "test", href: "/admin/test", label: "Test", icon: "science" },
  { id: "orders", href: "/admin/orders", label: "Compras", icon: "shopping_cart" },
  { id: "email-logs", href: "/admin/email-logs", label: "Emails", icon: "mail" },
  { id: "wallets", href: "/admin/wallets", label: "Saldos", icon: "account_balance_wallet" },
  { id: "invoices", href: "/admin/invoices", label: "Facturas", icon: "receipt_long" },
  { id: "support", href: "/admin/support", label: "Soporte", icon: "confirmation_number" },
  { id: "api", href: "/admin/api", label: "API", icon: "api" },
  { id: "bot", href: "/admin/bot", label: "Bot", icon: "smart_toy" },
  { id: "chat", href: "/admin/chat", label: "Chat soporte", icon: "support_agent" },
  { id: "reports", href: "/admin/reports", label: "Reportes", icon: "analytics" },
  { id: "settings", href: "/admin/settings", label: "Configuración", icon: "settings" },
];

/** Herramientas legacy y pruebas — no eliminar rutas existentes. */
export const LEGACY_NAV: NavItem[] = [
  { id: "send", href: "/admin/sms/send-test", label: "Enviar SMS (prueba)", icon: "send" },
  { id: "inbox", href: "/admin/inbox", label: "Bandeja operador", icon: "inbox" },
  { id: "contacts", href: "/admin/contacts", label: "Contactos CRM", icon: "contacts" },
  { id: "templates", href: "/admin/templates", label: "Plantillas KB", icon: "description" },
  { id: "client-test", href: "/admin/clients/test", label: "Cliente prueba", icon: "science" },
  { id: "credit", href: "/admin/clients/test/credit", label: "Carga saldo prueba", icon: "add_card" },
  { id: "ledger", href: "/admin/clients/test/ledger", label: "Ledger técnico", icon: "receipt" },
  { id: "diagnostics", href: "/admin/asmsc/diagnostics", label: "Diagnóstico aSMSC", icon: "settings_ethernet" },
  { id: "leads", href: "/admin/leads", label: "Leads comerciales", icon: "group" },
  { id: "products", href: "/admin/products", label: "Productos (legacy)", icon: "inventory_2" },
  { id: "knowledge", href: "/admin/knowledge", label: "Knowledge base", icon: "menu_book" },
  { id: "calculator", href: "/admin/calculator", label: "Calculadora", icon: "calculate" },
  { id: "web-leads", href: "/admin/web-agent/leads", label: "Leads web", icon: "language" },
];

/** @deprecated use LEGACY_NAV — compatibilidad con imports antiguos */
export const SYSTEM_NAV = LEGACY_NAV;
