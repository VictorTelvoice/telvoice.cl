export function formatClp(amount) {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function maskRut(rut) {
  if (!rut || typeof rut !== "string") return null;
  const clean = rut.replace(/\./g, "").trim();
  if (clean.length < 4) return clean;
  const body = clean.slice(0, -2);
  const dv = clean.slice(-2);
  const visible = body.slice(-3);
  return `•••••${visible}${dv}`;
}
