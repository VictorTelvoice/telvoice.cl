export interface BootstrapStatus {
  supabaseReady: boolean;
  warning: string | null;
  pgrestSchemaCacheIssue: boolean;
}

let status: BootstrapStatus = {
  supabaseReady: true,
  warning: null,
  pgrestSchemaCacheIssue: false,
};

export function setBootstrapWarning(
  message: string,
  pgrestSchemaCacheIssue = false,
): void {
  status = {
    supabaseReady: false,
    warning: message,
    pgrestSchemaCacheIssue,
  };
}

export function clearBootstrapWarning(): void {
  status = {
    supabaseReady: true,
    warning: null,
    pgrestSchemaCacheIssue: false,
  };
}

export function getBootstrapStatus(): BootstrapStatus {
  return status;
}
