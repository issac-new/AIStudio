import type { EmbeddingVector, PolicyId, PolicyRow, ShareScope } from "../../types.js";
import type { PolicyListFilter, StorageDb } from "../types.js";
import { type VectorHit } from "../vector.js";
export interface PolicySearchMeta {
    title: string;
    status: "candidate" | "active" | "archived";
    support: number;
    gain: number;
    experience_type?: NonNullable<PolicyRow["experienceType"]>;
    evidence_polarity?: NonNullable<PolicyRow["evidencePolarity"]>;
    salience?: number;
    confidence?: number;
    owner_agent_kind?: string;
    owner_profile_id?: string;
    owner_workspace_id?: string | null;
}
export declare function makePoliciesRepo(db: StorageDb): {
    insert(row: PolicyRow): void;
    upsert(row: PolicyRow): void;
    updateStats(id: PolicyId, p: {
        support: number;
        gain: number;
        status: PolicyRow["status"];
        updatedAt: number;
    }): void;
    getById(id: PolicyId): PolicyRow | null;
    list(filter?: PolicyListFilter): PolicyRow[];
    count(filter?: Omit<PolicyListFilter, "limit" | "offset">): number;
    searchByVector(query: EmbeddingVector, k: number, opts?: {
        statusIn?: PolicyRow["status"][];
        hardCap?: number;
    }): Array<VectorHit<string, PolicySearchMeta>>;
    /**
     * Keyword channel — FTS5 trigram MATCH against `policies_fts`.
     * Indexes the same user-facing fields the prompt renderer injects:
     * title, trigger, procedure, verification, boundary and guidance.
     */
    searchByText(ftsMatch: string, k: number, opts?: {
        statusIn?: PolicyRow["status"][];
    }): Array<VectorHit<string, PolicySearchMeta>>;
    /**
     * Policy experience keyword channel used by automatic recall. It
     * intentionally searches only title + trigger so long policy bodies
     * cannot drown out exact task-name matches.
     */
    searchTitleTriggerByText(ftsMatch: string, k: number, opts?: {
        statusIn?: PolicyRow["status"][];
    }): Array<VectorHit<string, PolicySearchMeta>>;
    /**
     * Pattern channel — substring fallback for short queries (2-char CJK,
     * short ids, etc.) that cannot arm the trigram FTS channel.
     */
    searchByPattern(terms: readonly string[], k: number, opts?: {
        statusIn?: PolicyRow["status"][];
    }): Array<VectorHit<string, PolicySearchMeta>>;
    deleteById(id: PolicyId): void;
    /**
     * Apply a share-state transition. `scope = null` clears the share
     * fields and resets `shared_at`. Mirrors `traces.updateShare`.
     */
    updateShare(id: PolicyId, share: {
        scope: ShareScope | null;
        target?: string | null;
        sharedAt?: number | null;
    }): void;
    /**
     * User-driven content patch from the viewer's edit modal. Limited
     * to the title / trigger / procedure / verification / boundary
     * fields; status, support, gain, vec are owned by the induction
     * pipeline. Stamps `edited_at = Date.now()` on any change.
     */
    updateContent(id: PolicyId, patch: {
        title?: string;
        trigger?: string;
        procedure?: string;
        verification?: string;
        boundary?: string;
    }): void;
    updateVector(id: PolicyId, vec: EmbeddingVector): boolean;
};
//# sourceMappingURL=policies.d.ts.map