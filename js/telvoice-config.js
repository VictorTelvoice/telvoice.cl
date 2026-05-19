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
  quoteVolumeMin: 100001,
  hero: {
    bagsFromLabel: "Bolsas desde 1.000 SMS",
    fromPriceSms: 5,
    fromPriceNote: "Plan Volumen · 100.000 SMS",
    fromPriceDetail: "Desde $5 + IVA por SMS en la bolsa de 100.000 SMS",
  },
  bags: [
    {
      id: "1k",
      planName: "Plan Inicial",
      label: "Plan Inicial — 1.000 SMS",
      sms: 1000,
      priceNet: 10000,
      pxSms: 10,
      maxNeed: 1000,
    },
    {
      id: "15k",
      planName: "Plan Empresa",
      label: "Plan Empresa — 15.000 SMS",
      sms: 15000,
      priceNet: 105000,
      pxSms: 7,
      maxNeed: 15000,
      featured: true,
    },
    {
      id: "100k",
      planName: "Plan Volumen",
      label: "Plan Volumen — 100.000 SMS",
      sms: 100000,
      priceNet: 500000,
      pxSms: 5,
      maxNeed: 100000,
    },
  ],
};
