#!/usr/bin/env node
/**
 * Reenvío real vía API admin en producción (usa RESEND del servidor).
 * Uso: node scripts/send-post-purchase-via-admin.mjs --email=jaoyarzu@gmail.com
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";

const email = process.argv
  .find((a) => a.startsWith("--email="))
  ?.slice(8)
  ?.trim()
  ?.toLowerCase();
if (!email) {
  console.error("Uso: --email=user@domain.com");
  process.exit(1);
}

const TARGETS = {
  "jaoyarzu@gmail.com": {
    invoiceId: "75b8b5eb-ece7-464e-af0f-d2a3952f0995",
    welcomeLogId: "f7241ca7-a30a-4ca3-867c-e0ae3649d135",
    activationLogId: "ffdbab4b-c637-45c4-ab1b-536a69fa2747",
  },
  "geaed2003@icloud.com": {
    invoiceId: "9e715c7f-1042-4bec-a32b-8252e63d7045",
    welcomeLogId: null,
    activationLogId: null,
  },
};

const target = TARGETS[email];
if (!target) {
  console.error("Email no autorizado en este script.");
  process.exit(1);
}

const adminEmail = process.env.SUPERADMIN_EMAIL?.trim();
const adminPassword = process.env.SUPERADMIN_PASSWORD?.trim();
if (!adminEmail || !adminPassword) {
  console.error("Faltan SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD en .env");
  process.exit(1);
}

const base = "https://agent.telvoice.cl";
const dir = mkdtempSync(join(tmpdir(), "tv-admin-cookies-"));
const jar = join(dir, "cookies.txt");

function curl(args, label) {
  const full = ["-sS", "-c", jar, "-b", jar, ...args];
  const r = spawnSync("curl", full, { encoding: "utf8" });
  console.log(`\n=== ${label} ===`);
  console.log("exit", r.status);
  if (r.stdout) console.log(r.stdout.slice(0, 500));
  if (r.stderr) console.log(r.stderr.slice(0, 300));
  return r.status === 0;
}

curl(
  [
    "-X",
    "POST",
    `${base}/admin/login`,
    "-d",
    `email=${encodeURIComponent(adminEmail)}&password=${encodeURIComponent(adminPassword)}`,
    "-L",
    "-o",
    "/dev/null",
    "-w",
    "login_http=%{http_code}\n",
  ],
  "admin login",
);

curl(
  [
    "-X",
    "POST",
    `${base}/admin/invoices/${target.invoiceId}/resend-email`,
    "-L",
    "-o",
    "/dev/null",
    "-w",
    "receipt_http=%{http_code}\n",
  ],
  "resend purchase_receipt",
);

if (target.welcomeLogId) {
  curl(
    [
      "-X",
      "POST",
      `${base}/admin/email-logs/${target.welcomeLogId}/resend`,
      "-L",
      "-o",
      "/dev/null",
      "-w",
      "welcome_http=%{http_code}\n",
    ],
    "resend welcome_sms_credited",
  );
} else {
  const { getSupabase } = await import("../src/database/supabaseClient.ts");
  const { data } = await getSupabase()
    .from("email_logs")
    .select("id")
    .eq("template_key", "welcome_sms_credited")
    .eq("recipient_email", email)
    .order("created_at", { ascending: false })
    .limit(1);
  const id = data?.[0]?.id;
  if (id) {
    curl(
      [
        "-X",
        "POST",
        `${base}/admin/email-logs/${id}/resend`,
        "-L",
        "-o",
        "/dev/null",
        "-w",
        "welcome_http=%{http_code}\n",
      ],
      "resend welcome_sms_credited (lookup)",
    );
  }
}

if (target.activationLogId) {
  curl(
    [
      "-X",
      "POST",
      `${base}/admin/email-logs/${target.activationLogId}/resend`,
      "-L",
      "-o",
      "/dev/null",
      "-w",
      "activation_http=%{http_code}\n",
    ],
    "resend purchase_activation_notice",
  );
} else {
  const { getSupabase } = await import("../src/database/supabaseClient.ts");
  const { data } = await getSupabase()
    .from("email_logs")
    .select("id")
    .eq("template_key", "purchase_activation_notice")
    .eq("recipient_email", email)
    .order("created_at", { ascending: false })
    .limit(1);
  const id = data?.[0]?.id;
  if (id) {
    curl(
      [
        "-X",
        "POST",
        `${base}/admin/email-logs/${id}/resend`,
        "-L",
        "-o",
        "/dev/null",
        "-w",
        "activation_http=%{http_code}\n",
      ],
      "resend purchase_activation_notice (lookup)",
    );
  } else {
    console.log("\n=== activation_notice: sin log previo; requiere hotfix admin o notify en VPS ===");
  }
}

writeFileSync(join(dir, "done.txt"), new Date().toISOString());
console.log("\nListo. Revisa audit-post-purchase-emails para provider_message_id reales.");
