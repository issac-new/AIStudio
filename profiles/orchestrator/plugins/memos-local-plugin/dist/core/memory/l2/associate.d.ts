/**
 * Trace → policy association.
 *
 * For each high-V trace, we try to attach it to an existing L2 policy:
 *
 *   1. Pull the top-K nearest policies (cosine on `trace.vecSummary`).
 *   2. Score each candidate via `tracePolicySimilarity` (cosine + signature
 *      overlap).
 *   3. Pick the best whose score ≥ `minSimilarity` (algorithm.l2Induction).
 *   4. Emit an event, push the trace id into the policy's source episodes.
 *
 * If nothing meets the threshold, the trace is handed off to the candidate
 * pool for later induction.
 *
 * This module does NOT mutate policy.support / gain / status — that's the
 * gain step's job (we want one coherent write per policy per episode).
 */
import type { Logger } from "../../logger/types.js";
import type { TraceRow } from "../../types.js";
import type { Repos } from "../../storage/repos/index.js";
import type { AssociationResult } from "./types.js";
interface AssociateDeps {
    repos: Pick<Repos, "policies">;
    log: Logger;
    config: {
        minSimilarity: number;
        poolFactor: number;
    };
}
/**
 * Attempt to associate each trace with an existing `active` or `candidate`
 * L2 policy. Returns one result per input trace (null `matchedPolicyId`
 * when nothing matched).
 */
export declare function associateTraces(traces: readonly TraceRow[], deps: AssociateDeps): AssociationResult[];
export {};
//# sourceMappingURL=associate.d.ts.map