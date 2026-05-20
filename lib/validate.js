const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/\s+/g, "");
}

export function normalizeRut(rut) {
  return String(rut || "")
    .trim()
    .replace(/\./g, "")
    .toUpperCase();
}

export function validateCustomer(customer) {
  const errors = [];
  if (!customer || typeof customer !== "object") {
    return { ok: false, errors: ["Datos del cliente inválidos."] };
  }

  const name = String(customer.name || "").trim();
  const email = String(customer.email || "").trim().toLowerCase();
  const phone = normalizePhone(customer.phone);
  const rut = normalizeRut(customer.rut);
  const businessName = String(customer.business_name || "").trim();

  if (name.length < 2) errors.push("Nombre o empresa es obligatorio.");
  if (!EMAIL_RE.test(email)) errors.push("Email inválido.");
  if (phone.length < 8) errors.push("WhatsApp es obligatorio.");
  if (rut.length < 8) errors.push("RUT es obligatorio.");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    customer: {
      name,
      email,
      phone,
      rut,
      business_name: businessName || null,
    },
  };
}
