import { buildInsert, buildUpdate } from "../tx.js";
import { buildPageClauses, fromJsonText, ownerFieldsFromRaw, ownerParamsFromRow, toJsonText } from "./_helpers.js";
const COLUMNS = [
    "id",
    "owner_agent_kind",
    "owner_profile_id",
    "owner_workspace_id",
    "policy_id",
    "evidence_trace_ids_json",
    "signature",
    "similarity",
    "expires_at",
];
export function makeCandidatePoolRepo(db) {
    const insert = db.prepare(buildInsert({ table: "l2_candidate_pool", columns: COLUMNS }));
    const update = db.prepare(buildUpdate({
        table: "l2_candidate_pool",
        columns: ["id", "policy_id", "evidence_trace_ids_json", "similarity", "expires_at"],
    }));
    const selectBySignature = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM l2_candidate_pool WHERE signature=@sig ORDER BY similarity DESC`);
    const selectById = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM l2_candidate_pool WHERE id=@id`);
    const deleteExpired = db.prepare(`DELETE FROM l2_candidate_pool WHERE expires_at < @now`);
    const deleteById = db.prepare(`DELETE FROM l2_candidate_pool WHERE id=@id`);
    const promote = db.prepare(`UPDATE l2_candidate_pool SET policy_id=@policyId WHERE id=@id`);
    return {
        insert(row) {
            insert.run({
                id: row.id,
                ...ownerParamsFromRow(row),
                policy_id: row.policyId,
                evidence_trace_ids_json: toJsonText(row.evidenceTraceIds),
                signature: row.signature,
                similarity: row.similarity,
                expires_at: row.expiresAt,
            });
        },
        upsert(row) {
            const existing = selectById.get({ id: row.id });
            if (existing) {
                update.run({
                    id: row.id,
                    policy_id: row.policyId,
                    evidence_trace_ids_json: toJsonText(row.evidenceTraceIds),
                    similarity: row.similarity,
                    expires_at: row.expiresAt,
                });
            }
            else {
                this.insert(row);
            }
        },
        getById(id) {
            const r = selectById.get({ id });
            return r ? mapRow(r) : null;
        },
        listBySignature(signature) {
            return selectBySignature.all({ sig: signature }).map(mapRow);
        },
        list(opts = {}) {
            const page = buildPageClauses(opts, "expires_at");
            return db
                .prepare(`SELECT ${COLUMNS.join(", ")} FROM l2_candidate_pool ${page}`)
                .all()
                .map(mapRow);
        },
        prune(nowMs) {
            return deleteExpired.run({ now: nowMs }).changes;
        },
        delete(id) {
            deleteById.run({ id });
        },
        promote(id, policyId) {
            promote.run({ id, policyId });
        },
    };
}
function mapRow(r) {
    return {
        id: r.id,
        ...ownerFieldsFromRaw(r),
        policyId: r.policy_id,
        evidenceTraceIds: fromJsonText(r.evidence_trace_ids_json, []),
        signature: r.signature,
        similarity: r.similarity,
        expiresAt: r.expires_at,
    };
}
//# sourceMappingURL=candidate_pool.js.map