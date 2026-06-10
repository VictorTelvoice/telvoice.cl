#!/usr/bin/env node
/** Read-only: audita wallet y ledger por email o company_id. */
import "dotenv/config";
import { buildAuditReport, loadWalletLedgerAudit } from "./lib/wallet-ledger-audit.mjs";

const email = process.argv.find((a) => a.startsWith("--email="))?.slice(8)?.trim();
const companyId = process.argv.find((a) => a.startsWith("--company-id="))?.slice(13)?.trim();

if (!email && !companyId) {
  console.error("Uso: npm run audit:wallet-ledger -- --email=user@domain.com");
  console.error("  o: npm run audit:wallet-ledger -- --company-id=<uuid>");
  process.exit(1);
}

const { getSupabase } = await import("../src/database/supabaseClient.ts");
const audit = await loadWalletLedgerAudit(getSupabase(), { email, companyId });
console.log(JSON.stringify(buildAuditReport(audit), null, 2));
