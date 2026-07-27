/**
 * Open and own a `better-sqlite3` database handle.
 *
 * Responsibilities of this module:
 *   1. Open the file with the right pragmas (WAL, foreign keys, busy timeout).
 *   2. Register custom functions we need across the codebase (none yet, but
 *      `cosine_sim` will land in `vector.ts`).
 *   3. Provide a stable `StorageDb` facade that hides `BetterSqlite3` from the
 *      rest of `core/`.
 *
 * This module **does not** run migrations — that's `migrator.ts`. Callers are
 * expected to open the DB, run migrations, *then* hand the DB to repos.
 */
import type { OpenDbOptions, StorageDb } from "./types.js";
export declare function openDb(opts: OpenDbOptions): StorageDb;
export declare const MARK_READY: unique symbol;
export declare function markReady(db: StorageDb): void;
//# sourceMappingURL=connection.d.ts.map