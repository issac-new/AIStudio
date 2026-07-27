import { buildInsert } from "../tx.js";
import { buildPageClauses, fromJsonText, joinWhere, ownerFieldsFromRaw, ownerParamsFromRow, timeRangeWhere, toJsonText, } from "./_helpers.js";
const COLUMNS = [
    "id",
    "owner_agent_kind",
    "owner_profile_id",
    "owner_workspace_id",
    "ts",
    "episode_id",
    "trace_id",
    "channel",
    "polarity",
    "magnitude",
    "rationale",
    "raw_json",
];
export function makeFeedbackRepo(db) {
    const insert = db.prepare(buildInsert({ table: "feedback", columns: COLUMNS }));
    const selectById = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM feedback WHERE id=@id`);
    const selectForTrace = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM feedback WHERE trace_id=@id ORDER BY ts DESC`);
    const selectForEpisode = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM feedback WHERE episode_id=@id ORDER BY ts DESC`);
    return {
        insert(row) {
            insert.run({
                id: row.id,
                ...ownerParamsFromRow(row),
                ts: row.ts,
                episode_id: row.episodeId ?? null,
                trace_id: row.traceId ?? null,
                channel: row.channel,
                polarity: row.polarity,
                magnitude: row.magnitude,
                rationale: row.rationale ?? null,
                raw_json: toJsonText(row.raw ?? null),
            });
        },
        getById(id) {
            const r = selectById.get({ id });
            return r ? mapRow(r) : null;
        },
        getForTrace(id) {
            return selectForTrace.all({ id }).map(mapRow);
        },
        getForEpisode(id) {
            return selectForEpisode.all({ id }).map(mapRow);
        },
        list(filter = {}) {
            const tr = timeRangeWhere(filter, "ts");
            const fragments = [];
            const params = { ...tr.params };
            if (filter.episodeId) {
                fragments.push(`episode_id = @episode_id`);
                params.episode_id = filter.episodeId;
            }
            if (filter.traceId) {
                fragments.push(`trace_id = @trace_id`);
                params.trace_id = filter.traceId;
            }
            if (filter.polarity) {
                fragments.push(`polarity = @polarity`);
                params.polarity = filter.polarity;
            }
            if (tr.sql)
                fragments.push(tr.sql);
            const where = joinWhere(fragments);
            const page = buildPageClauses(filter, "ts");
            const sql = `SELECT ${COLUMNS.join(", ")} FROM feedback ${where} ${page}`;
            return db.prepare(sql).all(params).map(mapRow);
        },
    };
}
function mapRow(r) {
    return {
        id: r.id,
        ...ownerFieldsFromRaw(r),
        ts: r.ts,
        episodeId: r.episode_id,
        traceId: r.trace_id,
        channel: r.channel,
        polarity: r.polarity,
        magnitude: r.magnitude,
        rationale: r.rationale,
        raw: fromJsonText(r.raw_json, null),
    };
}
//# sourceMappingURL=feedback.js.map