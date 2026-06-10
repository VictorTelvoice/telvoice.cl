import type { AuditGenerateJobStatus } from "../types/adminDataAudit.js";
import { generateAuditFlags } from "./adminDataAuditService.js";

export type AuditGenerateJobResult = NonNullable<AuditGenerateJobStatus["lastResult"]>;

let jobState: AuditGenerateJobStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  actorEmail: null,
  lastError: null,
  lastResult: null,
};

export function getAuditGenerateJobStatus(): AuditGenerateJobStatus {
  return {
    ...jobState,
    lastResult: jobState.lastResult
      ? {
          inserted: jobState.lastResult.inserted,
          byClassification: { ...jobState.lastResult.byClassification },
        }
      : null,
  };
}

export function startAuditGenerateJob(actorEmail?: string): {
  started: boolean;
  message: string;
} {
  if (jobState.running) {
    const since = jobState.startedAt ? ` (desde ${jobState.startedAt})` : "";
    return {
      started: false,
      message: `Generación de auditoría ya en curso${since}.`,
    };
  }

  jobState = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    actorEmail: actorEmail ?? null,
    lastError: null,
    lastResult: null,
  };

  setImmediate(() => {
    void (async () => {
      try {
        const result = await generateAuditFlags(actorEmail);
        jobState = {
          ...jobState,
          running: false,
          finishedAt: new Date().toISOString(),
          lastError: null,
          lastResult: result,
        };
      } catch (err) {
        jobState = {
          ...jobState,
          running: false,
          finishedAt: new Date().toISOString(),
          lastError: err instanceof Error ? err.message : String(err),
        };
      }
    })();
  });

  return {
    started: true,
    message: "Generación de auditoría iniciada en segundo plano.",
  };
}
