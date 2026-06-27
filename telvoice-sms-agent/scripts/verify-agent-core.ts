/**
 * Verifica tablas y rutas del Telvoice Agent Core.
 * Uso: npm run verify:agent-core
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import { createQuickQuote } from "../src/services/commercialQuoteService.js";
import { getSupabase } from "../src/database/supabaseClient.js";

async function tableExists(name: string): Promise<boolean> {
  const { error } = await getSupabase().from(name).select("id").limit(1);
  if (!error) {
    return true;
  }
  const msg = String(error.message ?? "");
  return !/does not exist|relation.*does not exist/i.test(msg);
}

async function countKnowledgePanel(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("knowledge_articles")
    .select("id", { count: "exact", head: true })
    .in("category", ["panel_cliente", "estrategia", "comercial"]);

  if (error) {
    return 0;
  }
  return count ?? 0;
}

function checkRoutesRegistered(): boolean {
  const root = join(process.cwd(), "src", "routes");
  const apiIndex = readFileSync(join(root, "index.ts"), "utf8");
  const appAgent = readFileSync(join(root, "app-agent.routes.ts"), "utf8");
  const webAgent = readFileSync(join(root, "web-agent.routes.ts"), "utf8");

  const hasAppMount = apiIndex.includes('"/app/agent"');
  const hasWebMount = apiIndex.includes('"/web-agent"');
  const hasAppChat = appAgent.includes('post("/chat"');
  const hasWebChat = webAgent.includes('post("/chat"');

  console.log(
    `  Rutas: POST /api/app/agent/chat=${hasAppMount && hasAppChat}, POST /api/web-agent/chat=${hasWebMount && hasWebChat}`,
  );
  return hasAppMount && hasWebMount && hasAppChat && hasWebChat;
}

async function main(): Promise<void> {
  console.log("=== verify:agent-core ===\n");
  let ok = true;

  const tables = [
    "panel_agent_sessions",
    "panel_agent_messages",
    "agent_pending_actions",
    "agent_unanswered_questions",
  ];

  for (const t of tables) {
    const exists = await tableExists(t);
    console.log(`${exists ? "✓" : "✗"} tabla ${t}`);
    if (!exists) {
      ok = false;
    }
  }

  const kCount = await countKnowledgePanel();
  const kOk = kCount > 0;
  console.log(
    `${kOk ? "✓" : "⚠"} knowledge_articles panel/estrategia/comercial: ${kCount} artículos (aplicar 040 y 044 si es 0)`,
  );

  const routesOk = checkRoutesRegistered();
  console.log(`${routesOk ? "✓" : "✗"} endpoints /api/app/agent y /api/web-agent registrados`);
  if (!routesOk) {
    ok = false;
  }

  const quoteChecks = [
    { qty: 30000, total: 249_900 },
    { qty: 70000, total: 499_800 },
    { qty: 12500, quoted: 13000, total: 123_760 },
  ];
  let quoteWarnings = 0;
  for (const c of quoteChecks) {
    const q = await createQuickQuote(c.qty);
    const okTotal = q.total_with_iva === c.total;
    const okRound =
      c.quoted == null || q.quoted_quantity === c.quoted;
    const pass = okTotal && okRound;
    console.log(
      `${pass ? "✓" : "⚠"} cotización ${c.qty.toLocaleString("es-CL")} SMS → total ${q.total_with_iva} (esperado ${c.total})`,
    );
    if (!pass) {
      quoteWarnings++;
    }
  }
  if (quoteWarnings > 0) {
    console.log(
      "  (aviso: cotizaciones fuera de expectativa no bloquean deploy; revisar sms_products/pricing)",
    );
  }

  try {
    const landing = await runAgentCore({
      channel: "landing",
      message: "cuánto cuesta 30000 sms",
      sessionId: "verify-landing",
    });
    console.log(
      `${landing.confidence >= 0.5 ? "✓" : "⚠"} Agent Core landing (intent=${landing.intent}, conf=${landing.confidence})`,
    );
    if (!landing.reply || landing.reply.length < 20) {
      ok = false;
      console.log("  ✗ respuesta vacía");
    }
  } catch (e) {
    ok = false;
    console.log("  ✗ Agent Core landing:", e);
  }

  if (!kOk) {
    console.log("  (aviso: conocimiento panel vacío no bloquea el deploy)");
  }

  console.log(ok ? "\nOK — Agent Core listo." : "\nFALLO — revisar migraciones y build.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
