/**
 * `runL2` — the one-episode-in/many-policy-updates-out orchestrator.
 *
 * Called by `subscriber.ts` on every `reward.updated` event. Steps:
 *
 *   1. Associate each high-V trace with an existing policy (cosine + sig).
 *      Matched traces bump `support` and feed the with-set for gain.
 *   2. Traces that don't match are added to `l2_candidate_pool`, keyed by
 *      their PatternSignature.
 *   3. We scan the pool for buckets with ≥ `minEpisodesForInduction` distinct
 *      episodes and run the `l2.induction` prompt on each.
 *   4. Successful drafts become new `candidate` policies; associated
 *      candidate-pool rows are promoted (policy_id filled in).
 *   5. For every policy touched (either via association or induction) we
 *      recompute `gain`, `support`, `status` and persist.
 *
 * Pure pipeline — takes deps (repos, llm, log, bus) and returns a
 * `L2ProcessResult`. No globals.
 */
import type { Logger } from "../../logger/types.js";
import type { LlmClient } from "../../llm/index.js";
import type { Repos } from "../../storage/repos/index.js";
import { makeCandidatePool } from "./candidate-pool.js";
import type { L2Config, L2EventBus, L2ProcessInput, L2ProcessResult } from "./types.js";
export interface RunL2Deps {
    repos: Pick<Repos, "candidatePool" | "embeddingRetryQueue" | "policies" | "tracePolicyLinks" | "traces">;
    db: Parameters<typeof makeCandidatePool>[0]["db"];
    llm: LlmClient | null;
    log: Logger;
    bus?: L2EventBus;
    config: L2Config;
    /** Thresholds that live alongside config.algorithm.skill — passed through. */
    thresholds: {
        minSupport: number;
        minGain: number;
        archiveGain: number;
    };
}
export declare function runL2(input: L2ProcessInput, deps: RunL2Deps): Promise<L2ProcessResult>;
//# sourceMappingURL=l2.d.ts.map