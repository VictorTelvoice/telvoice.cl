import type { AdminSessionUser } from "../../types/admin.js";
import { renderLayout, type LayoutTopbarOptions } from "./shell.js";

export function wrapAdminPage(options: {
  admin: AdminSessionUser;
  title: string;
  body: string;
  activeNav: string;
  topbar?: LayoutTopbarOptions;
}): string {
  return renderLayout({
    title: options.title,
    body: options.body,
    adminName: options.admin.name,
    showNav: true,
    activeNav: options.activeNav,
    topbar: {
      companyName: "Telvoice · Superadmin",
      routesLabel: "Red global OK",
      routesOk: true,
      ...options.topbar,
    },
  });
}
