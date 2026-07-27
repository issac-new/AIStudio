import type { EmbeddingVector, ShareScope, WorldModelId, WorldModelRow, WorldModelStructure } from "../../types.js";
import type { PageOptions, StorageDb } from "../types.js";
import { type VectorHit } from "../vector.js";
export interface WorldSearchMeta {
    title: string;
    owner_agent_kind?: string;
    owner_profile_id?: string;
    owner_workspace_id?: string | null;
}
export declare function makeWorldModelRepo(db: StorageDb): {
    upsert(row: WorldModelRow): void;
    insert(row: WorldModelRow): void;
    /**
     * Update everything that gets rewritten by an L3 abstraction pass
     * (body/structure/tags/policy links/episodes/vec). Leaves confidence
     * alone — that is its own update path.
     */
    updateBody(id: WorldModelId, patch: {
        title: string;
        body: string;
        structure: WorldModelStructure;
        domainTags: string[];
        policyIds: string[];
        sourceEpisodeIds: string[];
        vec: EmbeddingVector | null;
        updatedAt: number;
    }): void;
    updateConfidence(id: WorldModelId, confidence: number, updatedAt: number): void;
    getById(id: WorldModelId): WorldModelRow | null;
    /**
     * Case-sensitive substring hit on the domain-tags JSON. Keeps it cheap
     * (no index needed) for our scale; retrieval callers pass quoted tags
     * like `"docker"` to avoid matching partial tokens.
     */
    findByDomainTag(tag: string): WorldModelRow[];
    list(opts?: PageOptions): WorldModelRow[];
    count(): number;
    searchByVector(query: EmbeddingVector, k: number, opts?: {
        hardCap?: number;
        minConfidence?: number;
    }): Array<VectorHit<string, WorldSearchMeta>>;
    /**
     * Keyword channel — FTS5 trigram MATCH against `world_model_fts`.
     * Indexes `title` + `body` + `domain_tags`.
     */
    searchByText(ftsMatch: string, k: number, opts?: {
        minConfidence?: number;
    }): Array<VectorHit<string, WorldSearchMeta>>;
    /**
     * Pattern channel — substring fallback for queries that fall below
     * the trigram window (2-char CJK etc.).
     */
    searchByPattern(terms: readonly string[], k: number, opts?: {
        minConfidence?: number;
    }): Array<VectorHit<string, WorldSearchMeta>>;
    deleteById(id: WorldModelId): void;
    /**
     * Soft archive / unarchive. When status flips to `'archived'` we
     * stamp `archived_at`; flipping back to `'active'` clears it. The
     * caller is responsible for deciding what counts as a transition.
     */
    setStatus(id: WorldModelId, status: "active" | "archived", updatedAt: number): void;
    /**
     * Apply a share-state transition. `scope = null` clears the share.
     */
    updateShare(id: WorldModelId, share: {
        scope: ShareScope | null;
        target?: string | null;
        sharedAt?: number | null;
    }): void;
    /**
     * User-driven content patch from the viewer's edit modal. Limited
     * to `title` / `body`; structure, vec, confidence, policyIds are
     * owned by the L3 abstraction pipeline. Stamps `edited_at` on any
     * change.
     */
    updateContent(id: WorldModelId, patch: {
        title?: string;
        body?: string;
    }): void;
    updateVector(id: WorldModelId, vec: EmbeddingVector): boolean;
};
//# sourceMappingURL=world_model.d.ts.map