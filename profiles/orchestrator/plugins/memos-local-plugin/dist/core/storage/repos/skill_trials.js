import { buildInsert } from "../tx.js";
import { fromJsonText, ownerFieldsFromRaw, ownerParamsFromRow, toJsonText } from "./_helpers.js";
const COLUMNS = [
    "id",
    "owner_agent_kind",
    "owner_profile_id",
    "owner_workspace_id",
    "skill_id",
    "session_id",
    "episode_id",
    "trace_id",
    "turn_id",
    "tool_call_id",
    "status",
    "created_at",
    "resolved_at",
    "evidence_json",
];
export function makeSkillTrialsRepo(db) {
    const insert = db.prepare(buildInsert({ table: "skill_trials", columns: COLUMNS }));
    const selectPendingForEpisodeSkill = db.prepare(`SELECT ${COLUMNS.join(", ")}
       FROM skill_trials
      WHERE skill_id=@skill_id AND episode_id=@episode_id AND status='pending'
      LIMIT 1`);
    const selectPendingForEpisode = db.prepare(`SELECT ${COLUMNS.join(", ")}
       FROM skill_trials
      WHERE episode_id=@episode_id AND status='pending'
      ORDER BY created_at ASC`);
    const resolve = db.prepare(`UPDATE skill_trials
        SET status=@status,
            resolved_at=@resolved_at,
            evidence_json=@evidence_json
      WHERE id=@id AND status='pending'`);
    return {
        createPending(row) {
            const existing = selectPendingForEpisodeSkill.get({
                skill_id: row.skillId,
                episode_id: row.episodeId,
            });
            if (existing)
                return mapRow(existing);
            insert.run(rowToParams(row));
            return row;
        },
        listPendingForEpisode(episodeId) {
            return selectPendingForEpisode
                .all({ episode_id: episodeId })
                .map(mapRow);
        },
        resolve(id, status, resolvedAt, evidence) {
            const res = resolve.run({
                id,
                status,
                resolved_at: resolvedAt,
                evidence_json: toJsonText(evidence),
            });
            return res.changes > 0;
        },
    };
}
function rowToParams(row) {
    return {
        id: row.id,
        ...ownerParamsFromRow(row),
        skill_id: row.skillId,
        session_id: row.sessionId,
        episode_id: row.episodeId,
        trace_id: row.traceId,
        turn_id: row.turnId,
        tool_call_id: row.toolCallId,
        status: row.status,
        created_at: row.createdAt,
        resolved_at: row.resolvedAt,
        evidence_json: toJsonText(row.evidence),
    };
}
function mapRow(row) {
    return {
        id: row.id,
        ...ownerFieldsFromRaw(row),
        skillId: row.skill_id,
        sessionId: row.session_id,
        episodeId: row.episode_id,
        traceId: row.trace_id,
        turnId: row.turn_id,
        toolCallId: row.tool_call_id,
        status: row.status,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        evidence: fromJsonText(row.evidence_json, {}),
    };
}
//# sourceMappingURL=skill_trials.js.map