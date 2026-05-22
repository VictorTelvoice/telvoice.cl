import { randomUUID } from "node:crypto";

export function generateSmsUid(): string {
  return `tv-${randomUUID()}`;
}
