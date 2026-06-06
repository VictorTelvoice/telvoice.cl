#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "8091";

console.log("");
console.log("Telvoice Lab — servidor local");
console.log("Directorio:", root);
console.log("");
console.log("  http://localhost:" + port + "/landing-agent-lab/");
console.log("");
console.log("Importante: debe servirse desde la raíz del repo, no desde landing-agent-lab/");
console.log("Ctrl+C para detener");
console.log("");

const child = spawn(
  "python3",
  ["-m", "http.server", port, "--bind", "127.0.0.1"],
  { cwd: root, stdio: "inherit" },
);

child.on("error", function (err) {
  console.error("No se pudo iniciar el servidor:", err.message);
  process.exit(1);
});

child.on("exit", function (code) {
  if (code === 1) {
    console.error("");
    console.error("Si el puerto " + port + " está ocupado, libéralo con:");
    console.error("  lsof -ti:" + port + " | xargs kill -9");
  }
  process.exit(code ?? 0);
});
