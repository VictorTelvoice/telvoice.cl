#!/usr/bin/env node
/**
 * Resuelve los 3 feedback negativos pendientes conocidos (backfill + reviewed/converted).
 * Uso: npm run build && node scripts/resolve-pending-negative-feedback.mjs
 */
import "dotenv/config";
import pg from "pg";

const FEEDBACK_RESOLUTIONS = [
  {
    id: "10a8c194-80ea-4559-95ab-358bf3acee61",
    status: "converted_to_article",
    articleTitle: "Número de destino no autorizado en Telvoice",
    admin_notes:
      "Knowledge incorrecto (estrategia restaurantes). Router: destino no autorizado → dlr_help/technical. Artículo soporte creado.",
    proposed_answer:
      "Si el panel indica que el número de destino no está autorizado, revisa formato 569XXXXXXXX, límites live test, tipo P/T y whitelist IP en API/SMPP. Detalle en /app/inbox o /app/support.",
  },
  {
    id: "b1c669ba-411e-4876-bcbe-3f0ebfd8c47f",
    status: "reviewed",
    admin_notes:
      "Usuario preguntó integración API; agente devolvió artículo P/T. Fix: technical_doubt + artículo API + campaign_draft antes de knowledge.",
    proposed_answer:
      "Integración API Telvoice: solicita credenciales a soporte, usa Sender autorizado y números 569XXXXXXXX. SMPP requiere IP en whitelist. Prueba en /app/send-sms.",
  },
  {
    id: "e5b9211f-c06d-4278-a6d4-b311c60d5f65",
    status: "reviewed",
    admin_notes:
      "Optimizar mensaje agregó texto y alargó el SMS. Fix copy_help: no sugerir versión más larga.",
    proposed_answer:
      "Tu mensaje ya es breve (1 segmento). Si quieres acortarlo, quita saludos largos y evita CTAs redundantes; no agregamos texto que aumente segmentos.",
    qaOverride: {
      user_question: "Optimiza este mensaje: Hola cliente tenemos descuento hoy",
      agent_response:
        "Reviso tu mensaje para optimizarlo.\n\nOriginal: 34 caracteres, 1 segmento(s).\n\nVersión más corta sugerida:\n«Hola cliente tenemos descuento hoy Ver más en nuestra web.»\n58 caracteres, 1 segmento(s).",
      intent: "copy_help",
      confidence: 0.82,
    },
  },
];

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

function deriveQa(messages, beforeAt) {
  const cutoff = new Date(beforeAt).getTime();
  const slice = messages.filter((m) => new Date(m.created_at).getTime() <= cutoff);
  let user_question = null;
  let agent_response = null;
  let intent = null;
  let confidence = null;
  for (let i = slice.length - 1; i >= 0; i--) {
    const m = slice[i];
    if (!agent_response && m.role === "assistant") {
      agent_response = m.content;
      const meta = m.metadata || {};
      if (meta.intent) intent = meta.intent;
      if (meta.confidence != null) confidence = Number(meta.confidence);
    }
    if (!user_question && m.role === "user") {
      user_question = m.content;
    }
    if (user_question && agent_response) break;
  }
  return { user_question, agent_response, intent, confidence };
}

await client.connect();
try {
  for (const item of FEEDBACK_RESOLUTIONS) {
    const { rows: fb } = await client.query(
      "SELECT * FROM agent_feedback WHERE id = $1",
      [item.id],
    );
    if (!fb.length) {
      console.warn("SKIP", item.id, "no encontrado");
      continue;
    }
    const row = fb[0];
    const { rows: msgs } = await client.query(
      `SELECT role, content, metadata, created_at FROM panel_agent_messages
       WHERE session_id = $1 ORDER BY created_at ASC`,
      [row.session_id],
    );
    const qa = item.qaOverride ?? deriveQa(msgs, row.created_at);
    const meta = {
      ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
      user_question: qa.user_question,
      agent_response: qa.agent_response,
      intent: qa.intent,
      confidence: qa.confidence,
      resolved_by_script: "resolve-pending-negative-feedback.mjs",
    };

    let articleId = row.knowledge_article_id;
    if (item.status === "converted_to_article" && item.articleTitle) {
      const { rows: arts } = await client.query(
        "SELECT id FROM knowledge_articles WHERE title = $1 LIMIT 1",
        [item.articleTitle],
      );
      articleId = arts[0]?.id ?? articleId;
    }

    await client.query(
      `UPDATE agent_feedback SET
        status = $2,
        reviewed_at = now(),
        resolved = true,
        admin_notes = $3,
        proposed_answer = $4,
        metadata = $5::jsonb,
        detected_intent = COALESCE($6, detected_intent),
        confidence = COALESCE($7, confidence),
        knowledge_article_id = COALESCE($8::uuid, knowledge_article_id)
      WHERE id = $1`,
      [
        item.id,
        item.status,
        item.admin_notes,
        item.proposed_answer,
        JSON.stringify(meta),
        qa.intent ?? null,
        qa.confidence ?? null,
        articleId,
      ],
    );
    console.log("OK", item.id, item.status, qa.user_question?.slice(0, 60));
  }
} finally {
  await client.end();
}
