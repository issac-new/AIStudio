import { buildInsert, buildUpdate } from "../tx.js";
import { scanAndTopK } from "../vector.js";
import { buildPageClauses, fromBlob, fromJsonText, joinWhere, normalizeShareForStorage, ownerFieldsFromRaw, ownerParamsFromRow, timeRangeWhere, toBlob, toJsonText, } from "./_helpers.js";
const COLUMNS = [
    "id",
    "owner_agent_kind",
    "owner_profile_id",
    "owner_workspace_id",
    "title",
    "trigger",
    "procedure",
    "verification",
    "boundary",
    "support",
    "gain",
    "status",
    "experience_type",
    "merge_family",
    "evidence_polarity",
    "salience",
    "confidence",
    "source_episodes_json",
    "source_feedback_ids_json",
    "source_trace_ids_json",
    "induced_by",
    "decision_guidance_json",
    "verifier_meta_json",
    "skill_eligible",
    "vec",
    "created_at",
    "updated_at",
    "share_scope",
    "share_target",
    "shared_at",
    "edited_at",
];
export function makePoliciesRepo(db) {
    const insert = db.prepare(buildInsert({ table: "policies", columns: COLUMNS }));
    const upsert = db.prepare(buildInsert({ table: "policies", columns: COLUMNS, onConflict: "replace" }));
    const updateStats = db.prepare(buildUpdate({
        table: "policies",
        columns: ["id", "support", "gain", "status", "updated_at"],
    }));
    const selectById = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM policies WHERE id=@id`);
    return {
        insert(row) {
            insert.run(rowToParams(row));
        },
        upsert(row) {
            upsert.run(rowToParams(row));
        },
        updateStats(id, p) {
            updateStats.run({
                id,
                support: p.support,
                gain: p.gain,
                status: p.status,
                updated_at: p.updatedAt,
            });
        },
        getById(id) {
            const r = selectById.get({ id });
            if (!r)
                return null;
            return mapRow(r);
        },
        list(filter = {}) {
            const tr = timeRangeWhere(filter, "updated_at");
            const fragments = [];
            const params = { ...tr.params };
            if (filter.status) {
                fragments.push(`status = @status`);
                params.status = filter.status;
            }
            if (filter.minSupport !== undefined) {
                fragments.push(`support >= @min_support`);
                params.min_support = filter.minSupport;
            }
            if (tr.sql)
                fragments.push(tr.sql);
            const where = joinWhere(fragments);
            const page = buildPageClauses(filter, "updated_at");
            const sql = `SELECT ${COLUMNS.join(", ")} FROM policies ${where} ${page}`;
            return db.prepare(sql).all(params).map(mapRow);
        },
        count(filter = {}) {
            const tr = timeRangeWhere(filter, "updated_at");
            const fragments = [];
            const params = { ...tr.params };
            if (filter.status) {
                fragments.push(`status = @status`);
                params.status = filter.status;
            }
            if (filter.minSupport !== undefined) {
                fragments.push(`support >= @min_support`);
                params.min_support = filter.minSupport;
            }
            if (tr.sql)
                fragments.push(tr.sql);
            const where = joinWhere(fragments);
            const sql = `SELECT COUNT(*) AS n FROM policies ${where}`;
            return db.prepare(sql).get(params)?.n ?? 0;
        },
        searchByVector(query, k, opts = {}) {
            const statusIn = opts.statusIn;
            const whereParts = ["vec IS NOT NULL"];
            const params = {};
            if (statusIn && statusIn.length > 0) {
                const placeholders = statusIn.map((_, i) => `@status_${i}`).join(",");
                whereParts.push(`status IN (${placeholders})`);
                statusIn.forEach((s, i) => {
                    params[`status_${i}`] = s;
                });
            }
            return scanAndTopK(db, "policies", [
                "title",
                "status",
                "support",
                "gain",
                "experience_type",
                "evidence_polarity",
                "salience",
                "confidence",
                "owner_agent_kind",
                "owner_profile_id",
                "owner_workspace_id",
            ], query, k, {
                vecColumn: "vec",
                where: whereParts.join(" AND "),
                params,
                hardCap: opts.hardCap,
            });
        },
        /**
         * Keyword channel — FTS5 trigram MATCH against `policies_fts`.
         * Indexes the same user-facing fields the prompt renderer injects:
         * title, trigger, procedure, verification, boundary and guidance.
         */
        searchByText(ftsMatch, k, opts = {}) {
            return searchPoliciesFts(db, ftsMatch, k, opts);
        },
        /**
         * Policy experience keyword channel used by automatic recall. It
         * intentionally searches only title + trigger so long policy bodies
         * cannot drown out exact task-name matches.
         */
        searchTitleTriggerByText(ftsMatch, k, opts = {}) {
            return searchPoliciesFts(db, `{title trigger}: ${ftsMatch}`, k, opts);
        },
        /**
         * Pattern channel — substring fallback for short queries (2-char CJK,
         * short ids, etc.) that cannot arm the trigram FTS channel.
         */
        searchByPattern(terms, k, opts = {}) {
            if (!terms || terms.length === 0 || k <= 0)
                return [];
            const dedup = Array.from(new Set(terms.map((t) => String(t).trim()).filter(Boolean)));
            if (dedup.length === 0)
                return [];
            const params = {
                k: Math.max(1, Math.min(200, Math.floor(k))),
            };
            const ors = [];
            dedup.slice(0, 16).forEach((t, i) => {
                const key = `pat_${i}`;
                const escaped = t.replace(/[\\%_]/g, (m) => `\\${m}`);
                params[key] = `%${escaped}%`;
                ors.push(`(title LIKE @${key} ESCAPE '\\' OR trigger LIKE @${key} ESCAPE '\\' OR procedure LIKE @${key} ESCAPE '\\' OR verification LIKE @${key} ESCAPE '\\' OR boundary LIKE @${key} ESCAPE '\\' OR decision_guidance_json LIKE @${key} ESCAPE '\\')`);
            });
            const whereParts = [`(${ors.join(" OR ")})`];
            if (opts.statusIn && opts.statusIn.length > 0) {
                const placeholders = opts.statusIn.map((_, i) => `@status_${i}`).join(",");
                whereParts.push(`status IN (${placeholders})`);
                opts.statusIn.forEach((st, i) => {
                    params[`status_${i}`] = st;
                });
            }
            const sql = `
        SELECT id,
               title,
               status,
               support,
               gain,
               experience_type,
               evidence_polarity,
               salience,
               confidence,
               owner_agent_kind,
               owner_profile_id,
               owner_workspace_id
          FROM policies
         WHERE ${whereParts.join(" AND ")}
         ORDER BY updated_at DESC
         LIMIT @k`;
            const rows = db
                .prepare(sql)
                .all(params);
            return rows.map((r, idx) => ({
                id: r.id,
                score: 1 / (idx + 1),
                meta: policySearchMeta(r),
            }));
        },
        deleteById(id) {
            db.prepare(`DELETE FROM policies WHERE id=@id`).run({ id });
        },
        /**
         * Apply a share-state transition. `scope = null` clears the share
         * fields and resets `shared_at`. Mirrors `traces.updateShare`.
         */
        updateShare(id, share) {
            db.prepare(`UPDATE policies SET share_scope=@share_scope, share_target=@share_target, shared_at=@shared_at WHERE id=@id`).run({
                id,
                share_scope: normalizeShareForStorage(share.scope),
                share_target: share.target ?? null,
                shared_at: share.sharedAt ?? null,
            });
        },
        /**
         * User-driven content patch from the viewer's edit modal. Limited
         * to the title / trigger / procedure / verification / boundary
         * fields; status, support, gain, vec are owned by the induction
         * pipeline. Stamps `edited_at = Date.now()` on any change.
         */
        updateContent(id, patch) {
            const sets = [];
            const params = { id };
            if (patch.title !== undefined) {
                sets.push("title = @title");
                params.title = patch.title;
            }
            if (patch.trigger !== undefined) {
                sets.push("trigger = @trigger");
                params.trigger = patch.trigger;
            }
            if (patch.procedure !== undefined) {
                sets.push("procedure = @procedure");
                params.procedure = patch.procedure;
            }
            if (patch.verification !== undefined) {
                sets.push("verification = @verification");
                params.verification = patch.verification;
            }
            if (patch.boundary !== undefined) {
                sets.push("boundary = @boundary");
                params.boundary = patch.boundary;
            }
            if (sets.length === 0)
                return;
            sets.push("edited_at = @edited_at");
            params.edited_at = Date.now();
            const sql = `UPDATE policies SET ${sets.join(", ")} WHERE id = @id`;
            db.prepare(sql).run(params);
        },
        updateVector(id, vec) {
            const res = db.prepare(`UPDATE policies SET vec=@vec, updated_at=@updated_at WHERE id=@id`).run({ id, vec: toBlob(vec), updated_at: Date.now() });
            return res.changes > 0;
        },
    };
}
const EMPTY_GUIDANCE = Object.freeze({
    preference: [],
    antiPattern: [],
});
function rowToParams(row) {
    return {
        id: row.id,
        ...ownerParamsFromRow(row),
        title: row.title,
        trigger: row.trigger,
        procedure: row.procedure,
        verification: row.verification,
        boundary: row.boundary,
        support: row.support,
        gain: row.gain,
        status: row.status,
        experience_type: row.experienceType ?? "success_pattern",
        merge_family: row.mergeFamily ?? null,
        evidence_polarity: row.evidencePolarity ?? "positive",
        salience: row.salience ?? 0,
        confidence: row.confidence ?? 0.5,
        source_episodes_json: toJsonText(row.sourceEpisodeIds),
        source_feedback_ids_json: toJsonText(row.sourceFeedbackIds ?? []),
        source_trace_ids_json: toJsonText(row.sourceTraceIds ?? []),
        induced_by: row.inducedBy,
        decision_guidance_json: toJsonText({
            preference: row.decisionGuidance.preference,
            antiPattern: row.decisionGuidance.antiPattern,
        }),
        verifier_meta_json: toJsonText(row.verifierMeta ?? null),
        skill_eligible: row.skillEligible === false ? 0 : 1,
        vec: toBlob(row.vec),
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        share_scope: normalizeShareForStorage(row.share?.scope),
        share_target: row.share?.target ?? null,
        shared_at: row.share?.sharedAt ?? null,
        edited_at: row.editedAt ?? null,
    };
}
function mapRow(r) {
    return {
        id: r.id,
        ...ownerFieldsFromRaw(r),
        title: r.title,
        trigger: r.trigger,
        procedure: r.procedure,
        verification: r.verification,
        boundary: r.boundary,
        support: r.support,
        gain: r.gain,
        status: r.status,
        experienceType: normalizeExperienceType(r.experience_type),
        mergeFamily: normalizeMergeFamily(r.merge_family),
        evidencePolarity: normalizeEvidencePolarity(r.evidence_polarity),
        salience: finiteOr(r.salience, 0),
        confidence: finiteOr(r.confidence, 0.5),
        sourceEpisodeIds: fromJsonText(r.source_episodes_json, []),
        sourceFeedbackIds: fromJsonText(r.source_feedback_ids_json ?? "[]", []),
        sourceTraceIds: fromJsonText(r.source_trace_ids_json ?? "[]", []),
        inducedBy: r.induced_by,
        decisionGuidance: parseGuidance(r.decision_guidance_json),
        verifierMeta: fromJsonText(r.verifier_meta_json ?? "null", null),
        skillEligible: r.skill_eligible == null ? true : r.skill_eligible !== 0,
        vec: fromBlob(r.vec),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        share: r.share_scope != null
            ? {
                scope: normalizeShareForStorage(r.share_scope),
                target: r.share_target,
                sharedAt: r.shared_at,
            }
            : null,
        editedAt: r.edited_at,
    };
}
function policySearchMeta(r) {
    return {
        title: r.title,
        status: r.status,
        support: r.support,
        gain: r.gain,
        experience_type: normalizeExperienceType(r.experience_type),
        evidence_polarity: normalizeEvidencePolarity(r.evidence_polarity),
        salience: finiteOr(r.salience, 0),
        confidence: finiteOr(r.confidence, 0.5),
        owner_agent_kind: r.owner_agent_kind,
        owner_profile_id: r.owner_profile_id,
        owner_workspace_id: r.owner_workspace_id,
    };
}
function searchPoliciesFts(db, ftsMatch, k, opts = {}) {
    if (!ftsMatch || k <= 0)
        return [];
    const params = {
        match: ftsMatch,
        k: Math.max(1, Math.min(200, Math.floor(k))),
    };
    const whereParts = [];
    if (opts.statusIn && opts.statusIn.length > 0) {
        const placeholders = opts.statusIn.map((_, i) => `@status_${i}`).join(",");
        whereParts.push(`p.status IN (${placeholders})`);
        opts.statusIn.forEach((st, i) => {
            params[`status_${i}`] = st;
        });
    }
    const extra = whereParts.length > 0 ? ` AND ${whereParts.join(" AND ")}` : "";
    const sql = `
    SELECT p.id AS id,
           p.title AS title,
           p.status AS status,
           p.support AS support,
           p.gain AS gain,
           p.experience_type AS experience_type,
           p.evidence_polarity AS evidence_polarity,
           p.salience AS salience,
           p.confidence AS confidence,
           p.owner_agent_kind AS owner_agent_kind,
           p.owner_profile_id AS owner_profile_id,
           p.owner_workspace_id AS owner_workspace_id
      FROM policies_fts f
      JOIN policies     p ON p.id = f.policy_id
     WHERE policies_fts MATCH @match${extra}
     ORDER BY rank
     LIMIT @k`;
    const rows = db.prepare(sql).all(params);
    return rows.map((r, idx) => ({
        id: r.id,
        score: 1 / (idx + 1),
        meta: policySearchMeta(r),
    }));
}
/**
 * Deserialise the `decision_guidance_json` column into the typed
 * `{ preference, antiPattern }` shape. Defensively guards against
 * malformed JSON (returns the empty pair) since the column carries
 * LLM-derived content that may someday surprise us. Both arrays are
 * coerced to `string[]` to keep the read side honest even if a
 * future writer puts non-strings in there.
 */
function parseGuidance(raw) {
    if (!raw)
        return { ...EMPTY_GUIDANCE };
    try {
        const parsed = JSON.parse(raw);
        return {
            preference: Array.isArray(parsed.preference)
                ? parsed.preference.map((s) => String(s))
                : [],
            antiPattern: Array.isArray(parsed.antiPattern)
                ? parsed.antiPattern.map((s) => String(s))
                : [],
        };
    }
    catch {
        return { ...EMPTY_GUIDANCE };
    }
}
function normalizeExperienceType(raw) {
    switch (raw) {
        case "success_pattern":
        case "repair_validated":
        case "failure_avoidance":
        case "repair_instruction":
        case "preference":
        case "verifier_feedback":
        case "procedural":
            return raw;
        default:
            return "success_pattern";
    }
}
function normalizeEvidencePolarity(raw) {
    switch (raw) {
        case "positive":
        case "negative":
        case "neutral":
        case "mixed":
            return raw;
        default:
            return "positive";
    }
}
function normalizeMergeFamily(raw) {
    switch (raw) {
        case "success_induction":
        case "failure_corrective":
        case "failure_avoidance":
            return raw;
        default:
            return undefined;
    }
}
function finiteOr(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
//# sourceMappingURL=policies.js.map