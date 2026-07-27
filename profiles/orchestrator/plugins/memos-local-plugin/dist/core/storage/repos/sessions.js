/**
 * Session rows are lightweight: we only track birth/last-seen + a JSON meta
 * bag for whatever adapters want to stash (e.g. OpenClaw's `hostPid`).
 */
import { buildInsert, buildUpdate } from "../tx.js";
import { fromJsonText, ownerFieldsFromRaw, ownerParamsFromRow, toJsonText } from "./_helpers.js";
const COLUMNS = [
    "id",
    "agent",
    "owner_agent_kind",
    "owner_profile_id",
    "owner_workspace_id",
    "started_at",
    "last_seen_at",
    "meta_json",
];
export function makeSessionsRepo(db) {
    const insert = db.prepare(buildInsert({ table: "sessions", columns: COLUMNS, onConflict: "replace" }));
    const update = db.prepare(buildUpdate({ table: "sessions", columns: ["id", "last_seen_at", "meta_json"] }));
    const selectById = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM sessions WHERE id=@id`);
    const selectRecent = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM sessions ORDER BY last_seen_at DESC LIMIT @limit`);
    const deleteOlderThan = db.prepare(`DELETE FROM sessions WHERE last_seen_at < @cutoff`);
    return {
        upsert(row) {
            insert.run({
                id: row.id,
                agent: row.agent,
                ...ownerParamsFromRow(row),
                started_at: row.startedAt,
                last_seen_at: row.lastSeenAt,
                meta_json: toJsonText(row.meta ?? {}),
            });
        },
        touch(id, lastSeenAt, meta) {
            update.run({
                id,
                last_seen_at: lastSeenAt,
                meta_json: toJsonText(meta ?? {}),
            });
        },
        getById(id) {
            const r = selectById.get({ id });
            if (!r)
                return null;
            return mapRow(r);
        },
        listRecent(limit = 50) {
            return selectRecent.all({ limit }).map(mapRow);
        },
        deleteOlderThan(cutoffMs) {
            const r = deleteOlderThan.run({ cutoff: cutoffMs });
            return r.changes;
        },
    };
}
function mapRow(r) {
    return {
        id: r.id,
        agent: r.agent,
        ...ownerFieldsFromRaw(r),
        startedAt: r.started_at,
        lastSeenAt: r.last_seen_at,
        meta: fromJsonText(r.meta_json, {}),
    };
}
//# sourceMappingURL=sessions.js.map