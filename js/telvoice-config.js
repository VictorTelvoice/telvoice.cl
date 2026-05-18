/**
 * Configuración comercial Telvoice.cl — editar precios y contacto aquí.
 * No hay checkout integrado: CHECKOUT_URL debe quedar null hasta tener pasarela real.
 */
window.TELVOICE_CONFIG = {
  salesEmail: "ventas@telvoice.net",
  whatsapp: {
    number: "56912345678",
    message: "Hola, quiero cotizar una bolsa de SMS para Chile.",
  },
  checkoutUrl: null,
  ivaRate: 0.19,
  quoteVolumeMin: 200000,
  hero: {
    fromPriceSms: 5,
    fromPriceNote: "bolsas desde 100.000 SMS",
    corporatePriceSms: 4,
    corporateNote: "desde 500.000 SMS/mes (plan corporativo)",
  },
  bags: [
    {
      id: "3k",
      label: "Bolsa 3.000 SMS",
      sms: 3000,
      priceNet: 24000,
      pxSms: 8,
    },
    {
      id: "15k",
      label: "Bolsa 15.000 SMS",
      sms: 15000,
      priceNet: 105000,
      pxSms: 7,
      featured: true,
    },
    {
      id: "100k",
      label: "Bolsa 100.000 SMS",
      sms: 100000,
      priceNet: 600000,
      pxSms: 6,
    },
  ],
  volumeTiers: [
    { min: 3000, max: 14999, pxSMS: 8, plan: "Starter" },
    { min: 15000, max: 99999, pxSMS: 7, plan: "Silver" },
    { min: 100000, max: 199999, pxSMS: 6, plan: "Business" },
    { min: 200000, max: 499999, pxSMS: 5, plan: "Pro" },
    { min: 500000, max: Infinity, pxSMS: 4, plan: "Corporativo" },
  ],
};
