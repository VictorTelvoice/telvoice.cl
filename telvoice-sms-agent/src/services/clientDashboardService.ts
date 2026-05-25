import { findCompanyById } from "./companyService.js";
import { listSmsOrdersByCompany } from "./smsOrderService.js";
import { listCustomerVisiblePackages } from "./smsPackageService.js";
import { getCompanyBalance } from "./smsWalletService.js";
import { listTransactionsByCompany } from "./walletTransactionService.js";
import type { CompanyRow } from "../types/tenant.js";
import type {
  CompanyBalanceView,
  SmsOrderWithDetails,
  SmsPackageRow,
  WalletTransactionRow,
} from "../types/wallet.js";

export type ClientDashboardData = {
  company: CompanyRow;
  balance: CompanyBalanceView;
  recentOrders: SmsOrderWithDetails[];
  recentTransactions: WalletTransactionRow[];
  pendingOrdersCount: number;
  packagesAvailable: number;
  lastPurchaseAt: string | null;
};

export async function getClientDashboardData(
  companyId: string,
  country = "CL",
  preloaded?: Pick<ClientDashboardData, "company" | "balance">,
): Promise<ClientDashboardData> {
  const [orders, transactions, packages] = await Promise.all([
    listSmsOrdersByCompany(companyId, 20),
    listTransactionsByCompany(companyId, 10),
    listCustomerVisiblePackages(country),
  ]);

  const company = preloaded?.company ?? (await findCompanyById(companyId));
  const balance =
    preloaded?.balance ?? (await getCompanyBalance(companyId, country));

  if (!company) {
    throw new Error("Empresa no encontrada");
  }

  const pendingOrdersCount = orders.filter(
    (o) =>
      o.payment_status === "pending" ||
      (o.payment_status === "paid" && o.credit_status === "pending"),
  ).length;

  const credited = orders.filter((o) => o.credit_status === "credited");
  const lastPurchaseAt = credited[0]?.credited_at ?? credited[0]?.created_at ?? null;

  return {
    company,
    balance,
    recentOrders: orders.slice(0, 5),
    recentTransactions: transactions.slice(0, 5),
    pendingOrdersCount,
    packagesAvailable: packages.length,
    lastPurchaseAt,
  };
}

export async function getClientCatalogPackages(
  country = "CL",
): Promise<SmsPackageRow[]> {
  return listCustomerVisiblePackages(country);
}
