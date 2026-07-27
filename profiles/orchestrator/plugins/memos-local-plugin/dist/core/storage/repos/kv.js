/**
 * Tiny key/value store. Values are JSON-serialized; keys are arbitrary strings.
 *
 * Use this for housekeeping that doesn't deserve its own table:
 *   - last_trace_ts, installed_version
 *   - hub.last_sync_at, telemetry.last_batch_id
 *   - debug toggles
 */
import { now } from "../../time.js";
import { fromJsonText, toJsonText } from "./_helpers.js";
export function makeKvRepo(db) {
    const upsert = db.prepare(`INSERT INTO kv (key, value_json, updated_at) VALUES (@key, @value, @updated)
     ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`);
    const select = db.prepare(`SELECT value_json, updated_at FROM kv WHERE key=@key`);
    const del = db.prepare(`DELETE FROM kv WHERE key=@key`);
    const list = db.prepare(`SELECT key, value_json, updated_at FROM kv ORDER BY key`);
    return {
        set(key, value) {
            upsert.run({ key, value: toJsonText(value), updated: now() });
        },
        get(key, fallback) {
            const row = select.get({ key });
            if (!row)
                return fallback;
            return fromJsonText(row.value_json, fallback);
        },
        getWithMeta(key, fallback) {
            const row = select.get({ key });
            if (!row)
                return { value: fallback, updatedAt: null };
            return {
                value: fromJsonText(row.value_json, fallback),
                updatedAt: row.updated_at,
            };
        },
        del(key) {
            del.run({ key });
        },
        all() {
            return list.all().map((r) => ({
                key: r.key,
                value: fromJsonText(r.value_json, null),
                updatedAt: r.updated_at,
            }));
        },
    };
}
//# sourceMappingURL=kv.js.map