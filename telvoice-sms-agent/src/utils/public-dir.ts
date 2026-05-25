import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directorio `public/` del proyecto (válido desde `dist/` tras `tsc`). */
export function getPublicDir(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "public",
  );
}
