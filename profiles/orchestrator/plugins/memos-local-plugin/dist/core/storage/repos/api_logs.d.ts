/**
 * `api_logs` repository — structured log of the user-facing memory
 * operations (`memos_search`, `memory_add`). Mirrors the legacy
 * `memos-local-openclaw` plugin's table so the new viewer can render
 * the same rich JSON payloads (candidates, filtered, hub results,
 * ingestion stats, …).
 *
 * Schema: see `core/storage/migrations/007-api-logs.sql`.
 *
 * Write path: invoked synchronously inside the pipeline whenever we
 * complete a `memory.search` retrieval (adapter tool bridge) or an
 * `agent_end`-driven ingest turn.
 *
 * Read path: paginated newest-first by `called_at`. The viewer tails
 * the table via `GET /api/v1/api-logs`.
 */
import type { StorageDb } from "../types.js";
export declare const API_LOG_RETENTION_LIMIT = 10000;
export interface ApiLogRow {
    id: number;
    toolName: string;
    inputJson: string;
    outputJson: string;
    durationMs: number;
    success: boolean;
    calledAt: number;
}
export interface ApiLogInsert {
    toolName: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    success: boolean;
    calledAt?: number;
}
export interface ApiLogFilter {
    /** Filter by a single tool name. */
    toolName?: string;
    /** Filter by several tool names while preserving newest-first pagination. */
    toolNames?: readonly string[];
    /** Default 50; max 500 to keep viewer paint times sane. */
    limit?: number;
    offset?: number;
}
export declare function makeApiLogsRepo(db: StorageDb): {
    insert(row: ApiLogInsert): void;
    count(filter?: Pick<ApiLogFilter, "toolName" | "toolNames">): number;
    list(filter?: ApiLogFilter): ApiLogRow[];
};
//# sourceMappingURL=api_logs.d.ts.map