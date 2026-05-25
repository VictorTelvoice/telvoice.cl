/** Remitente alfanumérico (máx. 11) derivado del nombre de la empresa. */
export function suggestSenderIdFromCompanyName(companyName: string): string {
  const cleaned = companyName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 11);

  return cleaned.length > 0 ? cleaned : "EMPRESA";
}
