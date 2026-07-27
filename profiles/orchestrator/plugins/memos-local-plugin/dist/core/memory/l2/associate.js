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
import { tracePolicySimilarity } from "./similarity.js";
/**
 * Attempt to associate each trace with an existing `active` or `candidate`
 * L2 policy. Returns one result per input trace (null `matchedPolicyId`
 * when nothing matched).
 */
export function associateTraces(traces, deps) {
    const { repos, log, config } = deps;
    const results = [];
    for (const tr of traces) {
        const vec = tr.vecSummary ?? tr.vecAction ?? null;
        if (!vec) {
            results.push(emptyResult(tr));
            continue;
        }
        const poolSize = Math.max(4, Math.floor(config.poolFactor * 4));
        let hits;
        try {
            hits = repos.policies.searchByVector(vec, poolSize, {
                statusIn: ["active", "candidate"],
            });
        }
        catch (err) {
            log.warn("associate.search_failed", {
                traceId: tr.id,
                err: err instanceof Error ? err.message : String(err),
            });
            results.push(emptyResult(tr));
            continue;
        }
        if (hits.length === 0) {
            results.push(emptyResult(tr));
            continue;
        }
        let best = null;
        for (const h of hits) {
            const p = repos.policies.getById(h.id);
            if (!p)
                continue;
            const s = tracePolicySimilarity(tr, p, null);
            if (!best || s.score > best.score)
                best = { score: s.score, cosine: s.cosine, policy: p };
        }
        if (!best || best.score < config.minSimilarity) {
            results.push(emptyResult(tr));
            continue;
        }
        results.push({
            traceId: tr.id,
            signature: "",
            matchedPolicyId: best.policy.id,
            matchSimilarity: best.cosine,
            addedToCandidatePool: false,
        });
    }
    return results;
}
function emptyResult(tr) {
    return {
        traceId: tr.id,
        signature: "",
        matchedPolicyId: null,
        matchSimilarity: 0,
        addedToCandidatePool: false,
    };
}
//# sourceMappingURL=associate.js.map