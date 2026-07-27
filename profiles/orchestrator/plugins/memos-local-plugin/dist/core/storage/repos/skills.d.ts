import type { EmbeddingVector, ShareScope, SkillId, SkillRow } from "../../types.js";
import type { SkillListFilter, StorageDb } from "../types.js";
import { type VectorHit } from "../vector.js";
export interface SkillSearchMeta {
    name: string;
    status: SkillRow["status"];
    eta: number;
    gain: number;
    owner_agent_kind?: string;
    owner_profile_id?: string;
    owner_workspace_id?: string | null;
}
export declare function makeSkillsRepo(db: StorageDb): {
    insert(row: SkillRow): void;
    upsert(row: SkillRow): void;
    setStatus(id: SkillId, status: SkillRow["status"], updatedAt: number): void;
    bumpTrial(id: SkillId, passed: boolean, updatedAt: number): {
        trialsAttempted: number;
        trialsPassed: number;
        eta: number;
    };
    getById(id: SkillId): SkillRow | null;
    getByName(name: string): SkillRow | null;
    list(filter?: SkillListFilter): SkillRow[];
    count(filter?: Omit<SkillListFilter, "limit" | "offset">): number;
    searchByVector(query: EmbeddingVector, k: number, opts?: {
        statusIn?: SkillRow["status"][];
        hardCap?: number;
    }): Array<VectorHit<string, SkillSearchMeta>>;
    /**
     * Keyword channel — FTS5 trigram MATCH against `skills_fts`.
     * Indices `name` + `invocation_guide`. Returns hits with the same
     * `meta` shape `searchByVector` produces so the retrieval ranker
     * can fuse channels via RRF.
     */
    searchByText(ftsMatch: string, k: number, opts?: {
        statusIn?: SkillRow["status"][];
    }): Array<VectorHit<string, SkillSearchMeta>>;
    /**
     * Pattern channel — substring fallback for short queries (e.g. 2-char
     * CJK). Searched over `name` + `invocation_guide`.
     */
    searchByPattern(terms: readonly string[], k: number, opts?: {
        statusIn?: SkillRow["status"][];
    }): Array<VectorHit<string, SkillSearchMeta>>;
    deleteById(id: SkillId): void;
    /**
     * Apply a share-state transition. `scope = null` clears the share
     * fields and resets `shared_at`. Mirrors `traces.updateShare`.
     */
    updateShare(id: SkillId, share: {
        scope: ShareScope | null;
        target?: string | null;
        sharedAt?: number | null;
    }): void;
    /**
     * User-driven content patch from the viewer's edit modal. Only the
     * narrowly user-facing fields are mutable here; trial counters,
     * vectors, and source ids stay owned by the algorithm pipeline.
     * Stamps `edited_at = Date.now()` whenever any field changes.
     */
    updateContent(id: SkillId, patch: {
        name?: string;
        invocationGuide?: string;
    }): void;
    updateVector(id: SkillId, vec: EmbeddingVector): boolean;
    recordUse(id: SkillId, usedAt: number): boolean;
};
//# sourceMappingURL=skills.d.ts.map