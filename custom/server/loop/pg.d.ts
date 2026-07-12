declare module 'pg' {
  export interface PoolClient {
    query(text: string, params?: unknown[]): Promise<{ rows: any[] }>
    release(): void
  }
  export class Pool {
    constructor(config?: { connectionString?: string })
    connect(): Promise<PoolClient>
    query(text: string, params?: unknown[]): Promise<{ rows: any[] }>
    end(): Promise<void>
  }
}
