import { normalizeIntentText } from "./intent.js";

const FAQ_ENTRIES = [
  {
    keys: ["que es telvoice", "que es telvoice cl", "quienes son"],
    answer:
      "Telvoice.cl es la plataforma de SMS masivos para empresas en Chile. Vendemos bolsas prepago, panel web, reportería y API REST para campañas, OTP, validaciones y notificaciones.",
  },
  {
    keys: ["como funciona", "como se usa", "como empezar"],
    answer:
      "El flujo es simple: 1) cotizas o compras una bolsa SMS, 2) pagas con MercadoPago, 3) recibes acceso al portal cliente para enviar mensajes y ver reportes. Si necesitas ayuda con integración API, un asesor te acompaña.",
  },
  {
    keys: ["otp", "validacion", "notificacion", "campaña", "campañas"],
    answer:
      "Sí. Telvoice sirve para OTP y validaciones, notificaciones transaccionales y campañas masivas de marketing, según las políticas de uso responsable y las reglas de cada operador en Chile.",
  },
  {
    keys: ["como se compra", "como comprar"],
    answer:
      "Elige la cantidad de SMS (múltiplos de 1.000), revisa la cotización con IVA y paga online con MercadoPago. También puedes hablar con un asesor para volúmenes especiales o integración API.",
  },
  {
    keys: ["como se paga", "mercadopago", "pago"],
    answer:
      "El pago es online en pesos chilenos (CLP) mediante MercadoPago. Tras aprobarse el pago, Telvoice activa tu bolsa y puedes operar desde el portal cliente.",
  },
  {
    keys: ["solo chile", "chile", "operadores", "entel", "movistar"],
    answer:
      "Telvoice.cl vende SMS masivos solo para Chile, con cobertura Entel, Movistar, Claro y WOM.",
  },
  {
    keys: ["api", "integracion", "rest"],
    answer:
      "Ofrecemos API REST para integrar envíos en tus sistemas. La habilitación depende de tu caso de uso y validación comercial; un asesor puede guiarte.",
  },
  {
    keys: ["despues de comprar", "que pasa despues", "activacion"],
    answer:
      "Después del pago recibes confirmación, activación de la bolsa y acceso al portal cliente (portal.telvoice.net) para enviar SMS, revisar estados (submitted, delivered, etc.) y descargar reportes.",
  },
  {
    keys: ["factura", "iva"],
    answer:
      "Los precios del sitio son netos + IVA 19%. Emitimos factura electrónica en CLP según los datos de tu empresa.",
  },
];

export function answerFaq(text) {
  const n = normalizeIntentText(text);
  for (const entry of FAQ_ENTRIES) {
    if (entry.keys.some((k) => n.includes(k))) {
      return entry.answer;
    }
  }
  return (
    "Telvoice.cl ayuda a empresas en Chile con SMS masivos: bolsas prepago, panel, API y soporte local. " +
    "Puedo cotizar una bolsa, mostrarte precios por volumen o conectarte con un asesor. ¿Qué necesitas?"
  );
}
