/**
 * Tiny key/value store. Values are JSON-serialized; keys are arbitrary strings.
 *
 * Use this for housekeeping that doesn't deserve its own table:
 *   - last_trace_ts, installed_version
 *   - hub.last_sync_at, telemetry.last_batch_id
 *   - debug toggles
 */
import type { StorageDb } from "../types.js";
export declare function makeKvRepo(db: StorageDb): {
    set<T>(key: string, value: T): void;
    get<T = unknown>(key: string, fallback: T): T;
    getWithMeta<T = unknown>(key: string, fallback: T): {
        value: T;
        updatedAt: number | null;
    };
    del(key: string): void;
    all(): Array<{
        key: string;
        value: unknown;
        updatedAt: number;
    }>;
};
//# sourceMappingURL=kv.d.ts.map