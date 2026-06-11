import { escapeHtml } from "../../utils/html.js";

/** Banner contextual Superadmin — retirado; cada pantalla usa solo su título. */
export function renderSuperadminBanner(_note?: string): string {
  return "";
}

/** Aviso futuro panel cliente (solo en dashboard). */
export function renderClientPanelNotice(): string {
  return `<div class="tv-future-panel">
    <span class="material-symbols-outlined" aria-hidden="true">groups</span>
    <div>
      <strong>Panel cliente (futuro)</strong>
      <p>El portal <code>/app</code> permitirá a cada empresa comprar bolsas, ver su saldo y operar campañas sin acceso a proveedores, márgenes ni tráfico global.</p>
    </div>
  </div>`;
}

export function statusBadgeSa(status: string): string {
  const map: Record<string, [string, string]> = {
    activo: ["ok", "Activo"],
    activa: ["ok", "Activa"],
    pendiente: ["warn", "Pendiente"],
    suspendido: ["warn", "Suspendido"],
    bloqueado: ["err", "Bloqueado"],
    operativa: ["ok", "Operativa"],
    operativo: ["ok", "Operativo"],
    degradado: ["warn", "Degradado"],
    degradada: ["warn", "Degradada"],
    caido: ["err", "Caído"],
    en_revision: ["warn", "En revisión"],
    en_prueba: ["warn", "En prueba"],
    pagada: ["ok", "Pagada"],
    paid: ["ok", "Pagada"],
    credited: ["ok", "Acreditada"],
    acreditada: ["ok", "Acreditada"],
    cancelled: ["muted", "Cancelada"],
    cancelada: ["muted", "Cancelada"],
    rejected: ["err", "Rechazada"],
    pending: ["warn", "Pendiente"],
    "visible app": ["ok", "Visible /app"],
    rechazada: ["err", "Rechazada"],
    entregado: ["ok", "Entregado"],
    fallido: ["err", "Fallido"],
    mantenimiento: ["warn", "En mantenimiento"],
  };
  const key = status.toLowerCase().replace(/\s+/g, "_");
  const [cls, label] = map[key] ?? ["muted", status];
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}
