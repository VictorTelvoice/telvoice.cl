export type AdminDashboardChart = {
  labels: string[];
  values: number[];
};

export type AdminDashboardTopClient = {
  companyId: string;
  name: string;
  consumed: number;
  balance: number;
  deliveryRate: string;
};

export type AdminDashboardRecentCampaign = {
  companyName: string;
  name: string;
  sent: number;
  delivered: number;
  status: string;
  createdAt: string;
};

export type AdminDashboardSnapshot = {
  activeClients: number;
  smsToday: number;
  smsMonth: number;
  totalPurchasedSms: number;
  totalConsumedSms: number;
  activeCampaigns: number;
  deliveryRate: string | null;
  failedLast24h: number;
  activeWallets: number;
  pendingOrders: number;
  paidPendingCredit: number;
  paidPendingClaim: number;
  lowBalanceCompanies: number;
  chart7Days: AdminDashboardChart;
  topClients: AdminDashboardTopClient[];
  recentCampaigns: AdminDashboardRecentCampaign[];
  operationalAlerts: string[];
  productionCompanyCount: number;
};
