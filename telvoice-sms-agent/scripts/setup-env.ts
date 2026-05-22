import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const envPath = resolve(projectRoot, ".env");
const force = process.argv.includes("--force");

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

function buildEnvContent(): string {
  const jwtSecret = generateSecret();
  const sessionSecret = generateSecret();

  return `# Telvoice SMS Agent — configuración local
# Generado por: npm run setup:env
# Completa los valores que dicen PEGAR_ o CREAR_ antes de iniciar el servidor.

PORT=3001
NODE_ENV=development

# --- aSMSC / Telvoice API ---
ASMSC_BASE_URL=http://api.telvoice.net/api
ASMSC_API_ID=API298332411
ASMSC_API_PASSWORD=PEGAR_PASSWORD_API_ASMSC
ASMSC_DEFAULT_SENDER_ID=TELVOICE
ASMSC_DEFAULT_SMS_TYPE=P

# --- URLs locales (cambiar a https://agent.telvoice.cl en producción) ---
PUBLIC_APP_URL=http://localhost:3001
PUBLIC_WEBHOOK_BASE_URL=http://localhost:3001

# --- Supabase (Project Settings > API) ---
SUPABASE_URL=https://ezhzvqdbvvcebvtsinyn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PEGAR_SERVICE_ROLE_KEY_DE_SUPABASE

# --- Panel administrativo ---
SUPERADMIN_EMAIL=admin@telvoice.cl
SUPERADMIN_PASSWORD=CREAR_PASSWORD_SUPERADMIN
SUPERADMIN_NAME=Telvoice Superadmin

# Secretos generados automáticamente (no compartir)
JWT_SECRET=${jwtSecret}
SESSION_SECRET=${sessionSecret}

# Opcional
ENCRYPTION_KEY=

# --- Telegram bot (opcional) ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=
TELEGRAM_MODE=polling
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_PATH=/api/telegram/webhook
`;
}

function main(): void {
  if (existsSync(envPath) && !force) {
    console.log("");
    console.log("  El archivo .env ya existe.");
    console.log(`  Ruta: ${envPath}`);
    console.log("");
    console.log("  Para regenerarlo usa:");
    console.log("    npm run setup:env:force");
    console.log("");
    process.exit(0);
  }

  const content = buildEnvContent();
  writeFileSync(envPath, content, { encoding: "utf8" });

  console.log("");
  console.log("  ✓ Archivo .env creado correctamente");
  console.log(`  Ruta: ${envPath}`);
  console.log("");
  console.log("  Siguiente paso: abre .env y completa estos 3 valores:");
  console.log("");
  console.log("  1) SUPABASE_SERVICE_ROLE_KEY");
  console.log("     → Supabase → Project Settings → API → service_role");
  console.log("");
  console.log("  2) ASMSC_API_PASSWORD");
  console.log("     → Contraseña de tu cuenta API aSMSC/Telvoice");
  console.log("");
  console.log("  3) SUPERADMIN_PASSWORD");
  console.log("     → Contraseña que usarás en http://localhost:3001/admin/login");
  console.log("");
  console.log("  JWT_SECRET y SESSION_SECRET ya fueron generados automáticamente.");
  console.log("");
  console.log("  Luego ejecuta en Supabase SQL Editor:");
  console.log("    supabase/setup_all.sql");
  console.log("");
  console.log("  Y en la terminal:");
  console.log("    npm run seed:admin");
  console.log("    npm run verify:setup");
  console.log("    npm run dev");
  console.log("");
}

main();
