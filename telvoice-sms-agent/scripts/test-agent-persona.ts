/**
 * Pruebas manuales de personalidad y routing del Agent Core.
 */
import "dotenv/config";
import { runAgentCore } from "../src/services/agent/agentCore.js";

type Case = { channel: "landing" | "web_client" | "telegram"; message: string; companyId?: string };

const TEST_COMPANY = process.env.TEST_COMPANY_ID?.trim();

const CASES: Case[] = [
  { channel: "landing", message: "hola" },
  { channel: "landing", message: "quiero comprar más SMS" },
  { channel: "landing", message: "cuánto cuesta 30000 SMS" },
  { channel: "landing", message: "necesito SMS para mi empresa" },
  { channel: "landing", message: "sirve para OTP" },
  ...(TEST_COMPANY
    ? [
        { channel: "web_client" as const, message: "hola", companyId: TEST_COMPANY },
        { channel: "web_client" as const, message: "cuánto saldo tengo", companyId: TEST_COMPANY },
        { channel: "web_client" as const, message: "quiero crear una campaña", companyId: TEST_COMPANY },
        { channel: "web_client" as const, message: "qué significa failed", companyId: TEST_COMPANY },
        {
          channel: "web_client" as const,
          message: "optimiza este mensaje: Estimado cliente tenemos descuentos hoy",
          companyId: TEST_COMPANY,
        },
      ]
    : []),
  { channel: "telegram", message: "saldo" },
  { channel: "telegram", message: "cotizar 70000 sms" },
  { channel: "telegram", message: "quiero comprar mas sms" },
  { channel: "telegram", message: "no entiendo" },
];

async function main(): Promise<void> {
  console.log("=== test:agent-persona ===\n");
  let ok = 0;
  let fail = 0;

  for (const c of CASES) {
    const sessionId = `test-${c.channel}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const r = await runAgentCore({
        channel: c.channel,
        message: c.message,
        sessionId,
        companyId: c.companyId ?? null,
        metadata:
          c.channel === "telegram"
            ? { authorized: Boolean(c.companyId), telegramAuthorized: Boolean(c.companyId) }
            : {},
      });
      const preview = r.reply.replace(/\n/g, " ").slice(0, 100);
      console.log(`✓ [${c.channel}] "${c.message}" → ${r.intent} (${r.confidence})`);
      console.log(`  ${preview}…\n`);
      ok += 1;
    } catch (e) {
      console.log(`✗ [${c.channel}] "${c.message}" → ${e instanceof Error ? e.message : e}\n`);
      fail += 1;
    }
  }

  console.log(`Resultado: ${ok} OK, ${fail} fallos`);
  console.log(
    "\nNota: casos web_client con companyId real deben probarse en /app con sesión autenticada.",
  );
  process.exit(fail > 3 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
