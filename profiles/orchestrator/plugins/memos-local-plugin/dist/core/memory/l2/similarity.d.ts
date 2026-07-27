/**
 * Similarity helpers for the L2 association / induction steps.
 *
 * Trace↔policy similarity blends:
 *   - vector cosine between `trace.vecSummary` and `policy.vec` (if any),
 *   - signature overlap bonus (share tag / tool / errCode → +0.05 each),
 *   - hard gate when signatures disagree completely on primaryTag AND errCode.
 *
 * Scores are in [0, 1]. This is deliberately simple — V7 doesn't prescribe a
 * specific fusion; we just want a cheap, interpretable blend that works well
 * in practice.
 */
import type { EmbeddingVector, PolicyRow, TraceRow } from "../../types.js";
import type { SignatureComponents } from "./types.js";
export interface TracePolicySimilarity {
    score: number;
    cosine: number;
    sharedComponents: number;
    policyId: string;
}
/**
 * Compute blended trace↔policy similarity.
 *
 * Policies are persisted with only one embedding (`policy.vec`); we use
 * `trace.vecSummary` when present, falling back to `vecAction`. When neither
 * side has an embedding we return 0 — the caller treats that as "no match".
 */
export declare function tracePolicySimilarity(trace: TraceRow, policy: PolicyRow, policySignature: SignatureComponents | null): TracePolicySimilarity;
/**
 * Trace↔trace similarity used inside the candidate pool. Purely vector-based
 * (we already bucket by signature before calling this).
 */
export declare function traceTraceSimilarity(a: TraceRow, b: TraceRow): number;
/**
 * Value-weighted aggregation of a set of traces, used by gain.ts and for
 * logging "this policy explains +0.62 of V". V7 §0.6 eq. 3:
 *   w_t = softmax(V_t / τ)
 * Then weighted mean = Σ w_t · V_t.
 */
export declare function valueWeightedMean(traces: readonly TraceRow[], tau: number): number;
/**
 * Simple arithmetic mean — used for `G_without`. Weighted softmax doesn't
 * help the baseline leg because its variance is already what we care about.
 */
export declare function arithmeticMeanValue(traces: readonly TraceRow[]): number;
/**
 * Centroid of a set of embedding vectors (same dimension). Used as the
 * policy.vec for newly induced L2 rows.
 */
export declare function centroid(vectors: readonly (EmbeddingVector | null)[]): EmbeddingVector | null;
//# sourceMappingURL=similarity.d.ts.map