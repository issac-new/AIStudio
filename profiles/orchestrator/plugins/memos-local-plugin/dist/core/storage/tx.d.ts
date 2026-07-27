/**
 * Transaction + small SQL-building helpers.
 *
 * `openDb().tx(fn)` handles the happy path. This file adds:
 *   - `withRetry` for the rare SQLITE_BUSY we might still see on first-run.
 *   - `buildInsert` / `buildUpdate` for repos that want a dumb "column=>value"
 *     shortcut instead of hand-written SQL.
 *   - `chunkIn` for IN (?, ?, ?) queries where the argument list is dynamic.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { StorageDb } from "./types.js";
/**
 * Retry a function a few times if SQLite reports SQLITE_BUSY. This should be
 * rare (better-sqlite3 is synchronous inside a process) but it can happen if
 * another process (e.g. the viewer reading a WAL snapshot) temporarily holds
 * a lock longer than `busy_timeout`.
 */
export declare function withRetry<T>(fn: () => T, opts?: {
    attempts?: number;
    delayMs?: number;
    label?: string;
}): T;
export interface InsertSpec {
    table: string;
    columns: string[];
    /** "replace" | "ignore" | "error". Default: error. */
    onConflict?: "replace" | "ignore" | "error";
}
/**
 * Build a parameterized INSERT for the given columns. Named parameters.
 * Example output:
 *   INSERT INTO traces (id, ts) VALUES (@id, @ts)
 */
export declare function buildInsert(spec: InsertSpec): string;
/**
 * Build a parameterized UPDATE by primary key (default `id`).
 *   UPDATE policies SET title=@title, gain=@gain WHERE id=@id
 */
export declare function buildUpdate(spec: {
    table: string;
    columns: string[];
    pk?: string;
}): string;
/**
 * Chunk an array of ids into groups of <= `chunkSize` so IN (?, ?, ?) clauses
 * stay under SQLite's default 999-parameter cap. Use with an already-prepared
 * statement that takes a fixed-size IN list, or with `buildInClause` below.
 */
export declare function chunkIn<T>(items: readonly T[], chunkSize?: number): T[][];
/** Build `IN (?, ?, …)` with the right number of placeholders. */
export declare function buildInClause(n: number): string;
/**
 * Execute `fn` inside a named savepoint. Useful when a repo is already inside
 * a larger transaction but wants partial rollback. Rolls back the savepoint
 * on throw; re-throws afterward.
 */
export declare function withSavepoint<T>(db: StorageDb, name: string, fn: () => T): T;
export declare function isBetterSqliteError(err: unknown): err is BetterSqlite3.SqliteError;
//# sourceMappingURL=tx.d.ts.map