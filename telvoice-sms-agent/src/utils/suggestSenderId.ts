export type CompanySenderSource = {
  name: string;
  legal_name?: string | null;
};

/** Razón social acreditada si existe; si no, nombre comercial de la cuenta. */
export function resolveAccreditedCompanyName(company: CompanySenderSource): string {
  const legal = company.legal_name?.trim();
  if (legal) return legal;
  return company.name?.trim() ?? "";
}

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

/** Remitente sugerido a partir de la empresa acreditada en la cuenta. */
export function suggestSenderIdFromCompany(company: CompanySenderSource): string {
  return suggestSenderIdFromCompanyName(resolveAccreditedCompanyName(company));
}
