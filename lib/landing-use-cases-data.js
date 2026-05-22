/**
 * Casos de uso del landing (#casos-uso) — mensajería SMS A2P en Chile.
 */
export const USE_CASES_INTRO =
  "En Telvoice.cl puedes usar SMS para confirmar acciones, enviar alertas, validar usuarios, recordar citas y mantener informados a tus clientes. Trabajamos con rutas directas hacia operadores en Chile, preparadas para tráfico A2P, campañas comerciales y mensajes transaccionales.";

export const LANDING_USE_CASES = [
  {
    sector: "Retail",
    tagline: "Promociones y seguimiento de compra",
    answer:
      "Retail: informa ofertas, confirma compras y mantén a tus clientes al tanto del estado de sus pedidos por SMS.",
    keys: ["retail", "promociones", "seguimiento de compra", "estado del pedido"],
  },
  {
    sector: "E-commerce",
    tagline: "Carritos, cupones y despacho",
    answer:
      "E-commerce: envía recordatorios de carrito abandonado, cupones, confirmaciones de compra y avisos de despacho.",
    keys: [
      "ecommerce",
      "e commerce",
      "carrito",
      "cupones",
      "despacho",
      "notificaciones",
    ],
  },
  {
    sector: "Supermercados",
    tagline: "Ofertas y fidelización",
    answer:
      "Supermercados: comunica promociones, beneficios de fidelización y actualizaciones de entrega a tu base de clientes.",
    keys: ["supermercado", "supermercados", "fidelizacion", "ofertas"],
  },
  {
    sector: "Fintech y aplicaciones",
    tagline: "OTP y seguridad de acceso",
    answer:
      "Fintech y apps: envía códigos OTP, validación de identidad, recuperación de cuenta y alertas de seguridad.",
    keys: [
      "otp",
      "autenticacion",
      "autenticación",
      "fintech",
      "codigo de validacion",
      "seguridad de acceso",
      "2fa",
    ],
  },
  {
    sector: "Salud",
    tagline: "Recordatorios de citas",
    answer:
      "Salud: reduce inasistencias con recordatorios de citas, confirmaciones de hora y avisos relevantes para pacientes.",
    keys: [
      "salud",
      "recordatorios",
      "recordatorio de cita",
      "citas medicas",
      "clinica",
      "hospital",
    ],
  },
  {
    sector: "Finanzas",
    tagline: "Alertas transaccionales",
    answer:
      "Finanzas: notifica movimientos, pagos, validaciones y eventos importantes de forma directa por SMS.",
    keys: [
      "finanzas",
      "alertas transaccionales",
      "transaccional",
      "movimientos",
      "banco",
    ],
  },
];

export function formatAllUseCasesForChat() {
  const lines = [USE_CASES_INTRO, "", "Casos de uso en Telvoice.cl:"];
  LANDING_USE_CASES.forEach((item, i) => {
    lines.push(`${i + 1}) ${item.sector} — ${item.tagline}: ${item.answer}`);
  });
  lines.push(
    "",
    "¿Te interesa alguno en particular? Puedo cotizar una bolsa SMS o explicarte integración API.",
  );
  return lines.join("\n");
}
