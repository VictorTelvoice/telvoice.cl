/** Navegación principal — Superadmin Telvoice (operación interna). */
export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: string;
  /** Enlace deshabilitado — sección documentada, UI próxima. */
  comingSoon?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

/** Retail Chile — bolsas SMS, clientes, telco operativo Chile. */
export const RETAIL_CHILE_NAV: NavItem[] = [
  { id: "dashboard", href: "/admin", label: "Dashboard", icon: "dashboard" },
  { id: "clients", href: "/admin/clients", label: "Clientes retail", icon: "business" },
  { id: "pricing", href: "/admin/pricing", label: "Bolsas y tarifas", icon: "sell" },
  { id: "orders", href: "/admin/orders", label: "Órdenes / compras", icon: "shopping_cart" },
  { id: "wallets", href: "/admin/wallets", label: "Wallets", icon: "account_balance_wallet" },
  { id: "campaigns", href: "/admin/campaigns", label: "Campañas", icon: "campaign" },
  { id: "messages", href: "/admin/messages", label: "Mensajería", icon: "forum" },
  { id: "dlr", href: "/admin/dlr", label: "DLR / Estados", icon: "mark_email_read" },
  { id: "providers", href: "/admin/providers", label: "Proveedores Chile", icon: "hub" },
  { id: "routes", href: "/admin/routes", label: "Rutas SMS Chile", icon: "route" },
  { id: "rate-plans", href: "/admin/rate-plans", label: "Planes tarifarios", icon: "payments" },
  { id: "traffic-control", href: "/admin/traffic-control", label: "Tráfico / TPS", icon: "speed" },
  { id: "test", href: "/admin/test", label: "Test envío", icon: "science" },
];

/** Wholesale internacional — vendors, SMPP, rates, routes, clientes. */
export const WHOLESALE_NAV: NavItem[] = [
  { id: "wholesale", href: "/admin/wholesale", label: "Dashboard wholesale", icon: "public" },
  {
    id: "wholesale-providers",
    href: "/admin/wholesale/providers",
    label: "Vendors",
    icon: "corporate_fare",
  },
  {
    id: "wholesale-smpp",
    href: "/admin/wholesale/smpp-lab",
    label: "Vendor SMPP Accounts",
    icon: "cable",
  },
  {
    id: "wholesale-intl-rates",
    href: "/admin/wholesale/international-rates",
    label: "Vendor Rate Plans",
    icon: "currency_exchange",
  },
  {
    id: "wholesale-routes",
    href: "/admin/wholesale/routes",
    label: "Route Manager",
    icon: "alt_route",
  },
  {
    id: "wholesale-customers",
    href: "/admin/wholesale/customers",
    label: "Customer Accounts",
    icon: "groups",
  },
  {
    id: "wholesale-customer-smpp",
    href: "#",
    label: "Customer SMPP/API",
    icon: "vpn_key",
    comingSoon: true,
  },
  {
    id: "wholesale-customer-rates",
    href: "#",
    label: "Customer Rate Plans",
    icon: "price_check",
    comingSoon: true,
  },
  {
    id: "wholesale-route-tests",
    href: "/admin/wholesale/route-tests",
    label: "Route Tests",
    icon: "science",
  },
  {
    id: "wholesale-opportunities",
    href: "/admin/wholesale/opportunities",
    label: "Opportunities",
    icon: "lightbulb",
  },
];

/** NOC / Traffic — monitoreo wholesale SMPP. */
export const NOC_NAV: NavItem[] = [
  {
    id: "wholesale-smpp-noc",
    href: "/admin/wholesale/smpp-lab",
    label: "SMPP Bind Status",
    icon: "link",
  },
  {
    id: "noc-traffic",
    href: "#",
    label: "Traffic Monitor",
    icon: "monitoring",
    comingSoon: true,
  },
  {
    id: "noc-dlr",
    href: "#",
    label: "DLR Monitor",
    icon: "mark_email_read",
    comingSoon: true,
  },
  {
    id: "noc-errors",
    href: "#",
    label: "Error Codes",
    icon: "error",
    comingSoon: true,
  },
  {
    id: "noc-alerts",
    href: "#",
    label: "Alerts",
    icon: "notifications",
    comingSoon: true,
  },
];

/** Billing wholesale + facturación transversal. */
export const BILLING_NAV: NavItem[] = [
  {
    id: "billing-vendor",
    href: "#",
    label: "Vendor Billing",
    icon: "payments",
    comingSoon: true,
  },
  {
    id: "billing-customer",
    href: "#",
    label: "Customer Billing",
    icon: "account_balance",
    comingSoon: true,
  },
  { id: "invoices", href: "/admin/invoices", label: "Invoices", icon: "receipt_long" },
  {
    id: "billing-settlements",
    href: "#",
    label: "Settlements",
    icon: "handshake",
    comingSoon: true,
  },
  {
    id: "billing-margins",
    href: "#",
    label: "Margins",
    icon: "trending_up",
    comingSoon: true,
  },
];

/** System — API, emails, config, soporte. */
export const SYSTEM_NAV: NavItem[] = [
  { id: "api", href: "/admin/api", label: "API", icon: "api" },
  { id: "email-logs", href: "/admin/email-logs", label: "Emails", icon: "mail" },
  {
    id: "system-users",
    href: "#",
    label: "Users",
    icon: "manage_accounts",
    comingSoon: true,
  },
  { id: "settings", href: "/admin/settings", label: "Settings", icon: "settings" },
  { id: "support", href: "/admin/support", label: "Support", icon: "confirmation_number" },
];

/** @deprecated use SYSTEM_NAV — compatibilidad */
export const OPERATIONS_NAV = SYSTEM_NAV;

export const NAV_SECTIONS: NavSection[] = [
  { id: "retail", label: "Retail Chile", items: RETAIL_CHILE_NAV },
  { id: "wholesale", label: "Wholesale internacional", items: WHOLESALE_NAV },
  { id: "noc", label: "NOC / Traffic", items: NOC_NAV },
  { id: "billing", label: "Billing", items: BILLING_NAV },
  { id: "system", label: "System", items: SYSTEM_NAV },
];

/** Lista plana — compatibilidad con código que importa MAIN_NAV. */
export const MAIN_NAV: NavItem[] = [
  ...RETAIL_CHILE_NAV,
  ...WHOLESALE_NAV,
  ...NOC_NAV,
  ...BILLING_NAV,
  ...SYSTEM_NAV,
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
  { id: "agent-training", href: "/admin/agent-training", label: "Agente Telvoice", icon: "psychology" },
  { id: "calculator", href: "/admin/calculator", label: "Calculadora", icon: "calculate" },
  { id: "web-leads", href: "/admin/web-agent/leads", label: "Leads web", icon: "language" },
  {
    id: "wholesale-rates",
    href: "/admin/wholesale/rates",
    label: "Ofertas rates (raw)",
    icon: "description",
  },
  { id: "api-usage", href: "/admin/api-usage", label: "Uso de API", icon: "monitoring" },
  { id: "bot", href: "/admin/bot", label: "Bot", icon: "smart_toy" },
  { id: "chat", href: "/admin/chat", label: "Chat soporte", icon: "support_agent" },
  { id: "reports", href: "/admin/reports", label: "Reportes", icon: "analytics" },
];

/** @deprecated use LEGACY_NAV — compatibilidad con imports antiguos */
export const SYSTEM_NAV_LEGACY = LEGACY_NAV;
