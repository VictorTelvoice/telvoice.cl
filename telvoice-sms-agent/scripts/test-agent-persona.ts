/**
 * Pruebas de personalidad y detección comercial (mensajes → SMS).
 */
import "dotenv/config";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import {
  extractCommercialQuantity,
  isLikelyCommercialPhrase,
  matchesCommercialBuyIntentNormalized,
  normalizeCommercialText,
} from "../src/services/agent/agentCommercialText.js";

type Case = {
  channel: "landing" | "web_client" | "telegram";
  message: string;
  companyId?: string;
  expectIntent?: string;
  expectQuote?: boolean;
};

const TEST_COMPANY = process.env.TEST_COMPANY_ID?.trim();

const CASES: Case[] = [
  { channel: "landing", message: "quiero comprar mensajes", expectIntent: "commercial", expectQuote: false },
  { channel: "landing", message: "quiero comprar más mensajes", expectIntent: "commercial", expectQuote: false },
  { channel: "landing", message: "quiero comprar 30000 mensajes", expectIntent: "commercial", expectQuote: true },
  { channel: "landing", message: "cuánto cuesta 70000 mensajes", expectIntent: "commercial", expectQuote: true },
  { channel: "landing", message: "necesito una bolsa de mensajes", expectIntent: "commercial", expectQuote: false },
  { channel: "landing", message: "necesito mensajes para mi empresa", expectIntent: "commercial", expectQuote: false },
  { channel: "landing", message: "quiero enviar campañas", expectIntent: "commercial" },
  { channel: "telegram", message: "quiero comprar mensajes", expectIntent: "commercial" },
  { channel: "telegram", message: "cotizar 30000 mensajes", expectIntent: "commercial", expectQuote: true },
  { channel: "telegram", message: "saldo", expectIntent: "unknown" },
  ...(TEST_COMPANY
    ? [
        { channel: "web_client" as const, message: "quiero comprar más mensajes", companyId: TEST_COMPANY, expectIntent: "commercial" },
        { channel: "web_client" as const, message: "necesito cargar saldo", companyId: TEST_COMPANY, expectIntent: "commercial" },
        { channel: "web_client" as const, message: "quiero enviar campaña", companyId: TEST_COMPANY, expectIntent: "campaign_draft" },
      ]
    : []),
];

function assertCommercialNormalization(): void {
  const samples = [
    ["quiero comprar mensajes", "quiero comprar sms"],
    ["necesito 70000 mensajes", "necesito 70000 sms"],
    ["cargar saldo", "comprar sms"],
  ];
  for (const [inText, expected] of samples) {
    const out = normalizeCommercialText(inText);
    if (!out.includes(expected.split(" ").slice(-1)[0]!)) {
      throw new Error(`normalizeCommercialText("${inText}") → "${out}", esperaba contener parte de "${expected}"`);
    }
  }
  if (!matchesCommercialBuyIntentNormalized("quiero comprar mensajes")) {
    throw new Error("matchesCommercialBuyIntentNormalized falló para quiero comprar mensajes");
  }
  if (!isLikelyCommercialPhrase("necesito mensajes para mi empresa")) {
    throw new Error("isLikelyCommercialPhrase falló");
  }
  if (extractCommercialQuantity("cotizar 12500 mensajes") !== 12500) {
    throw new Error("extractCommercialQuantity 12500 mensajes");
  }
  console.log("✓ normalización comercial");
}

async function main(): Promise<void> {
  console.log("=== test:agent-persona ===\n");
  assertCommercialNormalization();

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
      const preview = r.reply.replace(/\n/g, " ").slice(0, 120);
      let pass = true;
      if (c.expectIntent && r.intent !== c.expectIntent) {
        pass = false;
      }
      if (c.expectQuote === true && !r.quote) {
        pass = false;
      }
      if (c.expectQuote === false && r.quote) {
        pass = false;
      }
      console.log(
        `${pass ? "✓" : "✗"} [${c.channel}] "${c.message}" → ${r.intent}${r.quote ? " +quote" : ""}`,
      );
      console.log(`  ${preview}…\n`);
      if (pass) {
        ok += 1;
      } else {
        fail += 1;
      }
    } catch (e) {
      console.log(`✗ [${c.channel}] "${c.message}" → ${e instanceof Error ? e.message : e}\n`);
      fail += 1;
    }
  }

  console.log(`Resultado: ${ok} OK, ${fail} fallos`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
