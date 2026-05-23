import { escapeHtml } from "../../utils/html.js";
import { roleDisplayLabel } from "../../types/roles.js";
import type { CompanyRow } from "../../types/tenant.js";
import type { UserProfileContext } from "../../types/tenant.js";
import type { CompanyBalanceView } from "../../types/wallet.js";
import { renderAppLayout, renderAppMinimalPage, type AppLayoutTopbar } from "./app-shell.js";

export type AppPageContext = {
  profile: UserProfileContext;
  company: CompanyRow;
  balance: CompanyBalanceView;
  flash?: string;
  error?: string;
};

function fmtSms(n: number): string {
  return new Intl.NumberFormat("es-CL").format(n);
}

function companyStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: "Cuenta activa",
    pending: "Cuenta pendiente",
    suspended: "Cuenta suspendida",
    blocked: "Cuenta bloqueada",
  };
  return map[status] ?? status;
}

export function buildAppTopbar(ctx: AppPageContext): AppLayoutTopbar {
  return {
    companyName: ctx.company.name,
    smsAvailable: fmtSms(ctx.balance.availableSms),
    accountStatus: companyStatusLabel(ctx.company.status),
    accountStatusOk: ctx.company.status === "active",
    userName: ctx.profile.fullName,
  };
}

export function wrapAppPage(
  ctx: AppPageContext,
  activeNav: string,
  title: string,
  body: string,
): string {
  const alert = ctx.error
    ? `<div class="alert alert-error">${escapeHtml(ctx.error)}</div>`
    : ctx.flash
      ? `<div class="alert alert-success">${escapeHtml(ctx.flash)}</div>`
      : "";

  return renderAppLayout({
    title,
    activeNav,
    topbar: buildAppTopbar(ctx),
    body: alert + body,
  });
}

export function renderNoCompanyPage(profile: UserProfileContext): string {
  const body = `<div class="tv-no-company">
    <span class="material-symbols-outlined" style="font-size:3rem;color:var(--tv-primary)" aria-hidden="true">business_center</span>
    <h1 class="tv-page-title">Empresa no asociada</h1>
    <p class="tv-page-sub">
      Tu usuario (${escapeHtml(profile.email)}) aún no está asociado a una empresa cliente.
      Contacta al equipo Telvoice para activar tu cuenta.
    </p>
    <p class="field-hint">Rol: ${escapeHtml(roleDisplayLabel(profile.role))}</p>
    <div style="margin-top:1.5rem;display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap">
      <a href="/admin" class="btn btn-secondary">Ir a Superadmin</a>
      <a href="/admin/logout" class="btn btn-ghost">Cerrar sesión</a>
    </div>
  </div>`;
  return renderAppMinimalPage("Empresa no asociada", body);
}

// re-export formatters for pages
export { fmtSms };

export function fmtMoney(amount: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
