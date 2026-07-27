/**
 * Idempotent schema migrator.
 *
 * On open:
 *   1. Ensure the `schema_migrations` table exists.
 *   2. Enumerate `migrations/*.sql` (in lexicographic order).
 *   3. For each not-yet-applied file, run it inside a transaction.
 *   4. Insert a row into `schema_migrations` (version, name, applied_at).
 *   5. Mark the StorageDb as "ready".
 *
 * Migrations are **additive only**. Renames / drops need a major version bump.
 */
import type { StorageDb } from "./types.js";
export interface MigrationFile {
    version: number;
    name: string;
    fullPath: string;
}
export interface MigrationsResult {
    applied: Array<{
        version: number;
        name: string;
        durationMs: number;
    }>;
    skipped: number;
    total: number;
}
/**
 * Resolve the `migrations/` directory next to this file. Works both when the
 * package is run via `tsx` (source) and when it's bundled/compiled, because
 * we ship the `.sql` files as runtime assets (see `package.json#files`).
 */
export declare function defaultMigrationsDir(): string;
export declare function discoverMigrations(dir: string): MigrationFile[];
/**
 * Run every not-yet-applied migration found under `dir`. Returns a summary.
 * Idempotent.
 */
export declare function runMigrations(db: StorageDb, dir?: string): MigrationsResult;
/**
 * Convenience helper for tests / CLIs: open, migrate, return.
 */
export declare function runMigrationsForPath(openFn: () => StorageDb, dir?: string): {
    db: StorageDb;
    result: MigrationsResult;
};
//# sourceMappingURL=migrator.d.ts.map