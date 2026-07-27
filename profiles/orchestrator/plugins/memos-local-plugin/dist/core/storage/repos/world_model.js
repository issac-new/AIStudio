import { buildInsert, buildUpdate } from "../tx.js";
import { scanAndTopK } from "../vector.js";
import { buildPageClauses, fromBlob, fromJsonText, normalizeShareForStorage, ownerFieldsFromRaw, ownerParamsFromRow, toBlob, toJsonText, } from "./_helpers.js";
const COLUMNS = [
    "id",
    "owner_agent_kind",
    "owner_profile_id",
    "owner_workspace_id",
    "title",
    "body",
    "policy_ids_json",
    "vec",
    "created_at",
    "updated_at",
    "version",
    "structure_json",
    "domain_tags_json",
    "confidence",
    "source_episodes_json",
    "induced_by",
    "status",
    "archived_at",
    "share_scope",
    "share_target",
    "shared_at",
    "edited_at",
];
export function makeWorldModelRepo(db) {
    const insert = db.prepare(buildInsert({ table: "world_model", columns: COLUMNS }));
    const upsert = db.prepare(buildInsert({ table: "world_model", columns: COLUMNS, onConflict: "replace" }));
    const updateBody = db.prepare(buildUpdate({
        table: "world_model",
        columns: [
            "id",
            "title",
            "body",
            "structure_json",
            "domain_tags_json",
            "policy_ids_json",
            "source_episodes_json",
            "updated_at",
            "vec",
        ],
    }));
    const updateConfidence = db.prepare(buildUpdate({
        table: "world_model",
        columns: ["id", "confidence", "updated_at"],
    }));
    const selectById = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM world_model WHERE id=@id`);
    const selectByDomain = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM world_model
       WHERE instr(domain_tags_json, @tag) > 0
       ORDER BY confidence DESC, updated_at DESC`);
    return {
        upsert(row) {
            upsert.run(rowToParams(row));
        },
        insert(row) {
            insert.run(rowToParams(row));
        },
        /**
         * Update everything that gets rewritten by an L3 abstraction pass
         * (body/structure/tags/policy links/episodes/vec). Leaves confidence
         * alone — that is its own update path.
         */
        updateBody(id, patch) {
            updateBody.run({
                id,
                title: patch.title,
                body: patch.body,
                structure_json: toJsonText(patch.structure),
                domain_tags_json: toJsonText(patch.domainTags),
                policy_ids_json: toJsonText(patch.policyIds),
                source_episodes_json: toJsonText(patch.sourceEpisodeIds),
                updated_at: patch.updatedAt,
                vec: toBlob(patch.vec),
            });
            db.prepare(`UPDATE world_model SET version=version + 1 WHERE id=@id`).run({ id });
        },
        updateConfidence(id, confidence, updatedAt) {
            updateConfidence.run({ id, confidence, updated_at: updatedAt });
        },
        getById(id) {
            const r = selectById.get({ id });
            if (!r)
                return null;
            return mapRow(r);
        },
        /**
         * Case-sensitive substring hit on the domain-tags JSON. Keeps it cheap
         * (no index needed) for our scale; retrieval callers pass quoted tags
         * like `"docker"` to avoid matching partial tokens.
         */
        findByDomainTag(tag) {
            return selectByDomain.all({ tag: JSON.stringify(tag) }).map(mapRow);
        },
        list(opts = {}) {
            const page = buildPageClauses(opts, "updated_at");
            const sql = `SELECT ${COLUMNS.join(", ")} FROM world_model ${page}`;
            return db.prepare(sql).all().map(mapRow);
        },
        count() {
            const sql = `SELECT COUNT(*) AS n FROM world_model`;
            return db.prepare(sql).get()?.n ?? 0;
        },
        searchByVector(query, k, opts = {}) {
            const where = opts.minConfidence !== undefined
                ? `vec IS NOT NULL AND confidence >= ${Number(opts.minConfidence)}`
                : "vec IS NOT NULL";
            return scanAndTopK(db, "world_model", ["title", "owner_agent_kind", "owner_profile_id", "owner_workspace_id"], query, k, {
                vecColumn: "vec",
                where,
                hardCap: opts.hardCap,
            });
        },
        /**
         * Keyword channel — FTS5 trigram MATCH against `world_model_fts`.
         * Indexes `title` + `body` + `domain_tags`.
         */
        searchByText(ftsMatch, k, opts = {}) {
            if (!ftsMatch || k <= 0)
                return [];
            const params = {
                match: ftsMatch,
                k: Math.max(1, Math.min(200, Math.floor(k))),
            };
            const conf = opts.minConfidence !== undefined
                ? `AND w.confidence >= ${Number(opts.minConfidence)}`
                : "";
            const sql = `
        SELECT w.id    AS id,
               w.title AS title,
               w.owner_agent_kind AS owner_agent_kind,
               w.owner_profile_id AS owner_profile_id,
               w.owner_workspace_id AS owner_workspace_id
          FROM world_model_fts f
          JOIN world_model     w ON w.id = f.world_id
         WHERE world_model_fts MATCH @match ${conf}
         ORDER BY rank
         LIMIT @k`;
            const rows = db
                .prepare(sql)
                .all(params);
            return rows.map((r, idx) => ({
                id: r.id,
                score: 1 / (idx + 1),
                meta: { title: r.title, owner_agent_kind: r.owner_agent_kind, owner_profile_id: r.owner_profile_id, owner_workspace_id: r.owner_workspace_id },
            }));
        },
        /**
         * Pattern channel — substring fallback for queries that fall below
         * the trigram window (2-char CJK etc.).
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
                ors.push(`(title LIKE @${key} ESCAPE '\\' OR body LIKE @${key} ESCAPE '\\' OR COALESCE(domain_tags_json,'') LIKE @${key} ESCAPE '\\')`);
            });
            const whereParts = [`(${ors.join(" OR ")})`];
            if (opts.minConfidence !== undefined) {
                whereParts.push(`confidence >= ${Number(opts.minConfidence)}`);
            }
            const sql = `
        SELECT id, title, owner_agent_kind, owner_profile_id, owner_workspace_id
          FROM world_model
         WHERE ${whereParts.join(" AND ")}
         ORDER BY updated_at DESC
         LIMIT @k`;
            const rows = db
                .prepare(sql)
                .all(params);
            return rows.map((r, idx) => ({
                id: r.id,
                score: 1 / (idx + 1),
                meta: { title: r.title, owner_agent_kind: r.owner_agent_kind, owner_profile_id: r.owner_profile_id, owner_workspace_id: r.owner_workspace_id },
            }));
        },
        deleteById(id) {
            db.prepare(`DELETE FROM world_model WHERE id=@id`).run({ id });
        },
        /**
         * Soft archive / unarchive. When status flips to `'archived'` we
         * stamp `archived_at`; flipping back to `'active'` clears it. The
         * caller is responsible for deciding what counts as a transition.
         */
        setStatus(id, status, updatedAt) {
            db.prepare(`UPDATE world_model SET status=@status, updated_at=@updated_at, archived_at=@archived_at WHERE id=@id`).run({
                id,
                status,
                updated_at: updatedAt,
                archived_at: status === "archived" ? updatedAt : null,
            });
        },
        /**
         * Apply a share-state transition. `scope = null` clears the share.
         */
        updateShare(id, share) {
            db.prepare(`UPDATE world_model SET share_scope=@share_scope, share_target=@share_target, shared_at=@shared_at WHERE id=@id`).run({
                id,
                share_scope: normalizeShareForStorage(share.scope),
                share_target: share.target ?? null,
                shared_at: share.sharedAt ?? null,
            });
        },
        /**
         * User-driven content patch from the viewer's edit modal. Limited
         * to `title` / `body`; structure, vec, confidence, policyIds are
         * owned by the L3 abstraction pipeline. Stamps `edited_at` on any
         * change.
         */
        updateContent(id, patch) {
            const sets = [];
            const params = { id };
            if (patch.title !== undefined) {
                sets.push("title = @title");
                params.title = patch.title;
            }
            if (patch.body !== undefined) {
                sets.push("body = @body");
                params.body = patch.body;
            }
            if (sets.length === 0)
                return;
            sets.push("edited_at = @edited_at");
            params.edited_at = Date.now();
            const sql = `UPDATE world_model SET ${sets.join(", ")} WHERE id = @id`;
            db.prepare(sql).run(params);
        },
        updateVector(id, vec) {
            const res = db.prepare(`UPDATE world_model SET vec=@vec, updated_at=@updated_at WHERE id=@id`).run({ id, vec: toBlob(vec), updated_at: Date.now() });
            return res.changes > 0;
        },
    };
}
const EMPTY_STRUCTURE = {
    environment: [],
    inference: [],
    constraints: [],
};
function rowToParams(row) {
    return {
        id: row.id,
        ...ownerParamsFromRow(row),
        title: row.title,
        body: row.body,
        policy_ids_json: toJsonText(row.policyIds),
        vec: toBlob(row.vec),
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        version: row.version ?? 1,
        structure_json: toJsonText(row.structure ?? EMPTY_STRUCTURE),
        domain_tags_json: toJsonText(row.domainTags ?? []),
        confidence: row.confidence ?? 0.5,
        source_episodes_json: toJsonText(row.sourceEpisodeIds ?? []),
        induced_by: row.inducedBy ?? "",
        status: row.status ?? "active",
        archived_at: row.archivedAt ?? null,
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
        body: r.body,
        policyIds: fromJsonText(r.policy_ids_json, []),
        vec: fromBlob(r.vec),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        version: r.version ?? 1,
        structure: fromJsonText(r.structure_json, EMPTY_STRUCTURE),
        domainTags: fromJsonText(r.domain_tags_json, []),
        confidence: r.confidence,
        sourceEpisodeIds: fromJsonText(r.source_episodes_json, []),
        inducedBy: r.induced_by,
        status: r.status === "archived" ? "archived" : "active",
        archivedAt: r.archived_at,
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
//# sourceMappingURL=world_model.js.map