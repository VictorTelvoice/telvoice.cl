#!/usr/bin/env node
/**
 * Escribe dist/build-sha.txt con el SHA de git actual (para /health).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distDir = join(root, "dist");

function readShaFromEnvFile() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return "";
  const match = readFileSync(envPath, "utf8").match(/^GIT_COMMIT_SHA=(.+)$/m);
  return match?.[1]?.trim() || "";
}

let sha = process.env.GIT_COMMIT_SHA?.trim() || "";
if (!sha) {
  try {
    sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    sha = readShaFromEnvFile();
  }
}
if (!sha) sha = "unknown";

mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, "build-sha.txt"), `${sha}\n`, "utf8");
console.log(`[embed-git-sha] ${sha}`);
