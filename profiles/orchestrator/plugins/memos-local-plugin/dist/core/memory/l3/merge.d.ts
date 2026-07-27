/**
 * L3 upsert / merge logic.
 *
 * Given a freshly-abstracted world-model draft, decide whether to:
 *   1. Create a new row in `world_model`, or
 *   2. Update an existing row in-place (when a similar WM already covers
 *      the same domain), or
 *   3. Retire explicitly superseded WMs (`draft.supersedesWorldIds`).
 *
 * "Similar enough" is defined as a cosine cutoff against a shortlist of
 * WMs that share at least one `domainTag` with the cluster. This avoids
 * spraying near-duplicate world models across runs while still letting
 * genuinely distinct environments coexist (e.g. "Alpine python" vs
 * "Debian python").
 *
 * Pure decisions; no DB writes here. The orchestrator applies the result.
 */
import type { EmbeddingVector, PolicyId, WorldModelRow } from "../../types.js";
import type { L3AbstractionDraft, L3Config, PolicyCluster } from "./types.js";
export interface MergeCandidateLookup {
    findByDomainTag(tag: string): WorldModelRow[];
    list?(opts?: {
        limit?: number;
    }): WorldModelRow[];
}
export interface MergeDeps {
    lookup: MergeCandidateLookup;
    config: Pick<L3Config, "clusterMinSimilarity">;
}
/**
 * Pull the small shortlist of WMs that might be the "same environment"
 * as the given cluster. De-dupes by id and skips entries with no vector
 * (no vector = nothing we can compare against).
 */
export declare function gatherMergeCandidates(cluster: PolicyCluster, deps: MergeDeps): WorldModelRow[];
export type MergeDecision = {
    kind: "create";
} | {
    kind: "update";
    target: WorldModelRow;
    cosineScore: number;
};
/**
 * Pick the closest existing WM that passes the similarity cutoff.
 * If none qualify we return `{kind: "create"}` — the caller will
 * insert a fresh row.
 */
export declare function chooseMergeTarget(cluster: PolicyCluster, candidates: readonly WorldModelRow[], draft: L3AbstractionDraft, deps: MergeDeps): MergeDecision;
export interface MergedPatch {
    title: string;
    body: string;
    structure: {
        environment: Array<{
            label: string;
            description: string;
            evidenceIds?: string[];
        }>;
        inference: Array<{
            label: string;
            description: string;
            evidenceIds?: string[];
        }>;
        constraints: Array<{
            label: string;
            description: string;
            evidenceIds?: string[];
        }>;
    };
    domainTags: string[];
    policyIds: PolicyId[];
    sourceEpisodeIds: string[];
    vec: EmbeddingVector | null;
}
/**
 * Build the patch we hand to `worldModel.updateBody(...)`. We prefer the
 * fresh draft's sections but retain any unique structured entries from
 * the existing row so we don't forget evidence accumulated across runs.
 */
export declare function mergeForUpdate(args: {
    existing: WorldModelRow;
    draft: L3AbstractionDraft;
    cluster: PolicyCluster;
    episodeIds: readonly string[];
}): MergedPatch;
//# sourceMappingURL=merge.d.ts.map