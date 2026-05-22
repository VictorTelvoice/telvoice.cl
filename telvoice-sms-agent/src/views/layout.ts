import { escapeHtml } from "../utils/html.js";

export interface LayoutOptions {
  title: string;
  body: string;
  adminName?: string;
  showNav?: boolean;
  activeNav?: string;
}

const NAV_ITEMS: { id: string; href: string; label: string }[] = [
  { id: "dashboard", href: "/admin", label: "Dashboard" },
  { id: "send", href: "/admin/sms/send-test", label: "Enviar SMS" },
  { id: "client", href: "/admin/clients/test", label: "Cliente prueba" },
  { id: "credit", href: "/admin/clients/test/credit", label: "Saldo" },
  { id: "diagnostics", href: "/admin/asmsc/diagnostics", label: "Diagnóstico aSMSC" },
  { id: "telegram", href: "/admin/telegram/diagnostics", label: "Diagnóstico Telegram" },
  { id: "calculator", href: "/admin/calculator", label: "Calculadora" },
  { id: "products", href: "/admin/products", label: "Productos SMS" },
  { id: "leads", href: "/admin/leads", label: "Leads" },
  { id: "web-leads", href: "/admin/web-agent/leads", label: "Web agent leads" },
  { id: "web-sessions", href: "/admin/web-agent/sessions", label: "Web sesiones" },
  { id: "web-quotes", href: "/admin/web-agent/quotes", label: "Web cotiz." },
  { id: "pricing-tiers", href: "/admin/pricing-tiers", label: "Tramos precio" },
  { id: "knowledge", href: "/admin/knowledge", label: "Base Telvoice" },
  { id: "knowledge-test", href: "/admin/knowledge/test", label: "Probar base" },
  { id: "settings", href: "/admin/settings", label: "Settings" },
];

export function renderLayout(options: LayoutOptions): string {
  const active = options.activeNav ?? "";
  const navLinks = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href}" class="${active === item.id ? "nav-active" : ""}">${escapeHtml(item.label)}</a>`,
  ).join("");

  const nav = options.showNav
    ? `<nav class="nav">
        <a href="/admin" class="brand">Telvoice <span>SMS Agent</span></a>
        <div class="nav-links">${navLinks}</div>
        <div class="nav-end">
          <span class="nav-user">${escapeHtml(options.adminName ?? "Admin")}</span>
          <form method="post" action="/admin/logout" class="logout-form">
            <button type="submit" class="btn btn-ghost btn-sm">Salir</button>
          </form>
        </div>
      </nav>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)} | Telvoice SMS Agent</title>
  <style>
    :root {
      --primary: #0052cc;
      --primary-dark: #003d99;
      --bg: #f8fafd;
      --card: #ffffff;
      --border: rgba(195, 198, 214, 0.65);
      --text: #0f172a;
      --muted: #64748b;
      --ok: #059669;
      --warn: #d97706;
      --err: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, sans-serif;
      background: linear-gradient(180deg, #f8fafd 0%, #edf3fa 100%);
      color: var(--text);
      min-height: 100vh;
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 1rem;
      padding: 0.85rem 1.25rem;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      box-shadow: 0 4px 24px -12px rgba(15, 23, 42, 0.08);
    }
    .brand {
      font-family: Montserrat, sans-serif;
      font-weight: 700;
      text-decoration: none;
      color: #000;
      font-size: 1.05rem;
      margin-right: auto;
    }
    .brand span {
      background: linear-gradient(105deg, #5b21b6 0%, #4338ca 35%, #0052cc 70%, #006875 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .nav-links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.65rem;
    }
    .nav-links a {
      color: var(--muted);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.82rem;
      padding: 0.35rem 0.55rem;
      border-radius: 0.45rem;
    }
    .nav-links a:hover { color: var(--primary); background: #eef2ff; }
    .nav-links a.nav-active { color: var(--primary); background: #dbeafe; }
    .nav-end { display: flex; align-items: center; gap: 0.65rem; }
    .nav-user { color: var(--muted); font-size: 0.8rem; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .logout-form { margin: 0; }
    .container { max-width: 1280px; margin: 0 auto; padding: 1.25rem 1.5rem 2rem; }
    h1 { font-family: Montserrat, sans-serif; font-size: 1.65rem; margin: 0 0 0.4rem; }
    h2 { font-family: Montserrat, sans-serif; font-size: 1.1rem; margin: 1.75rem 0 0.85rem; }
    h3 { font-size: 0.95rem; margin: 1.25rem 0 0.5rem; color: var(--muted); }
    .subtitle { color: var(--muted); margin-bottom: 1.25rem; line-height: 1.5; }
    .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .grid-stats { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.1rem 1.2rem;
      box-shadow: 0 4px 24px -8px rgba(15, 23, 42, 0.08);
    }
    .card-stat .value { font-size: 1.5rem; }
    .card .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); font-weight: 700; }
    .card .value { font-size: 1.2rem; font-weight: 700; margin-top: 0.3rem; line-height: 1.3; }
    .card .hint { font-size: 0.78rem; color: var(--muted); margin-top: 0.25rem; }
    .badge {
      display: inline-block;
      padding: 0.18rem 0.5rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .badge-ok { background: #d1fae5; color: var(--ok); }
    .badge-warn { background: #fef3c7; color: var(--warn); }
    .badge-err { background: #fee2e2; color: var(--err); }
    .badge-muted { background: #e2e8f0; color: #475569; }
    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; min-width: 720px; }
    th, td { padding: 0.6rem 0.55rem; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; background: #f8fafc; position: sticky; top: 0; }
    tbody tr:hover td { background: #f8fafc; }
    a.row-link { color: var(--primary); font-weight: 600; text-decoration: none; }
    a.row-link:hover { text-decoration: underline; }
    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 0.75rem;
      overflow: auto;
      font-size: 0.78rem;
      line-height: 1.45;
      max-height: 420px;
    }
    .btn {
      display: inline-block;
      padding: 0.5rem 0.9rem;
      border-radius: 0.55rem;
      border: none;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      font-size: 0.88rem;
      font-family: inherit;
    }
    .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.8rem; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover { background: var(--primary-dark); }
    .btn-secondary { background: #eef2ff; color: var(--primary); border: 1px solid rgba(0, 82, 204, 0.2); }
    .btn-secondary:hover { background: #dbeafe; }
    .btn-danger { background: #fee2e2; color: var(--err); border: 1px solid #fecaca; }
    .btn-danger:hover { background: #fecaca; }
    .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
    .actions-row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.25rem; }
    .alert { padding: 0.75rem 1rem; border-radius: 0.6rem; margin-bottom: 1rem; font-size: 0.9rem; line-height: 1.45; }
    .alert-success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .alert-warn { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .alert-error { background: #fee2e2; color: var(--err); border: 1px solid #fecaca; }
    .login-wrap { max-width: 400px; margin: 4rem auto; }
    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; font-weight: 600; margin-bottom: 0.35rem; font-size: 0.88rem; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.55rem;
      font-size: 0.95rem;
      font-family: inherit;
    }
    .form-group textarea { min-height: 100px; resize: vertical; }
    .field-hint { font-size: 0.8rem; color: var(--muted); margin: 0.35rem 0 0; line-height: 1.4; }
    .meta-grid { display: grid; gap: 0.85rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .meta-item dt { font-size: 0.68rem; text-transform: uppercase; color: var(--muted); font-weight: 700; letter-spacing: 0.04em; }
    .meta-item dd { margin: 0.2rem 0 0; font-weight: 600; word-break: break-word; }
    .message-box {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 0.6rem;
      padding: 0.85rem 1rem;
      margin-top: 1rem;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.92rem;
    }
    .dlr-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.25rem; }
    @media (max-width: 768px) {
      .nav { flex-direction: column; align-items: stretch; }
      .brand { margin-right: 0; }
      .nav-end { justify-content: space-between; }
      .container { padding: 1rem; }
      table { min-width: 600px; font-size: 0.78rem; }
    }
  </style>
</head>
<body>
  ${nav}
  <main class="container">${options.body}</main>
</body>
</html>`;
}

export function statusBadge(status: string | null | undefined): string {
  const key = (status ?? "unknown").toLowerCase();
  let cls = "badge-muted";
  if (["delivered", "submitted", "active", "ok", "s"].includes(key)) {
    cls = "badge-ok";
  } else if (["failed", "error", "rejected", "f"].includes(key)) {
    cls = "badge-err";
  } else if (
    ["pending", "pending_submit", "unknown", "p"].includes(key)
  ) {
    cls = "badge-warn";
  }
  return `<span class="badge ${cls}">${escapeHtml(status ?? "—")}</span>`;
}
