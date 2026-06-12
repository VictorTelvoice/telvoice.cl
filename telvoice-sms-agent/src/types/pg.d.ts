declare module "pg" {
  export class Client {
    constructor(config?: { connectionString?: string; ssl?: unknown });
    connect(): Promise<void>;
    query(queryText: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    end(): Promise<void>;
  }
}
