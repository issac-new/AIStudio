/**
 * Candidate-pool management for L2 incremental induction.
 *
 * A candidate row = "this trace is a likely example of a sub-problem but we
 * don't yet have a policy for it". Rows are bucketed by `PatternSignature`.
 * When a bucket accumulates traces from ≥ N distinct episodes we run the
 * induction prompt (see `induce.ts`).
 *
 * Responsibilities:
 *   - generate candidate ids (`cand_<signature_hash>_<traceId>`)
 *   - add / dedupe rows, extending `evidenceTraceIds`
 *   - list buckets ready for induction
 *   - prune expired rows
 *   - promote (write `policy_id`) when induction succeeds
 */
import type { TraceId, TraceRow } from "../../types.js";
import type { Repos } from "../../storage/repos/index.js";
import type { StorageDb } from "../../storage/types.js";
import type { PatternSignature } from "./types.js";
interface CandidatePoolDeps {
    db: StorageDb;
    repos: Pick<Repos, "candidatePool" | "traces">;
}
export interface CandidateBucket {
    signature: PatternSignature;
    candidateIds: string[];
    evidenceTraceIds: TraceId[];
    episodeIds: string[];
}
export interface AddCandidateInput {
    trace: TraceRow;
    ttlMs: number;
    similarity?: number;
    now?: number;
}
export declare function signatureHash(sig: PatternSignature): string;
export declare function candidateIdFor(sig: PatternSignature, traceId: TraceId): string;
export declare function makeCandidatePool(deps: CandidatePoolDeps): {
    addCandidate: (input: AddCandidateInput) => {
        candidateId: string;
        signature: PatternSignature;
        created: boolean;
    };
    bucketsReadyForInduction: (opts: {
        minDistinctEpisodes: number;
        now?: number;
    }) => CandidateBucket[];
    promote: (candidateIds: readonly string[], policyId: string) => void;
    prune: (now?: number) => number;
    deleteBucket: (signature: PatternSignature) => number;
};
export {};
//# sourceMappingURL=candidate-pool.d.ts.map