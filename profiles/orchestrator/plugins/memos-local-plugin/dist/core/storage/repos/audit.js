/**
 * Database-side audit log. Every write here is also mirrored to the file-based
 * audit.log sink (`core/logger/sinks/audit-log.ts`). Both are kept forever.
 */
import { buildInsert } from "../tx.js";
import { buildPageClauses, fromJsonText, toJsonText } from "./_helpers.js";
const COLUMNS = ["ts", "actor", "kind", "target", "detail_json"];
export function makeAuditRepo(db) {
    const insert = db.prepare(buildInsert({ table: "audit_events", columns: COLUMNS }));
    const selectById = db.prepare(`SELECT id, ts, actor, kind, target, detail_json FROM audit_events WHERE id=@id`);
    const selectKind = db.prepare(`SELECT id, ts, actor, kind, target, detail_json FROM audit_events WHERE kind=@kind ORDER BY ts DESC LIMIT @limit`);
    return {
        append(row) {
            const r = insert.run({
                ts: row.ts,
                actor: row.actor,
                kind: row.kind,
                target: row.target ?? null,
                detail_json: toJsonText(row.detail ?? {}),
            });
            return Number(r.lastInsertRowid);
        },
        getById(id) {
            const r = selectById.get({ id });
            return r ? mapRow(r) : null;
        },
        listKind(kind, limit = 200) {
            return selectKind.all({ kind, limit }).map(mapRow);
        },
        list(opts = {}) {
            const page = buildPageClauses(opts, "ts");
            const sql = `SELECT id, ts, actor, kind, target, detail_json FROM audit_events ${page}`;
            return db.prepare(sql).all().map(mapRow);
        },
    };
}
function mapRow(r) {
    return {
        id: r.id,
        ts: r.ts,
        actor: r.actor,
        kind: r.kind,
        target: r.target,
        detail: fromJsonText(r.detail_json, {}),
    };
}
//# sourceMappingURL=audit.js.map