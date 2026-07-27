/**
 * `backprop` — normalized credit assignment with position smoothing.
 *
 * For traces in chronological order (t = 1..T):
 *
 *   f_t = (1-λ) + λ·γ^(T-t)
 *   recovery_t = 1 if α_t>0 and α_{t-1}=0 else 0
 *   r_t = 1 + δ·recovery_t
 *   w_t = α_t·f_t·r_t
 *   V_t = (w_t / Σw)·R_human            when Σw>0
 *   V_t = 0                              when Σw=0
 *
 * Priority stays:
 *   priority(f1_t) = max(V_t, 0) · decay(Δt)
 *   decay(Δt)     = 0.5 ^ (Δt_days / halfLifeDays)
 */
import type { BackpropInput, BackpropResult } from "./types.js";
export declare function backprop(input: BackpropInput): BackpropResult;
/**
 * Standalone helper: priority for an existing (V, ts) pair. Exposed for
 * `core/memory/l1` retrieval tests and the L3 abstraction pass, both of
 * which need to reweight traces without re-running backprop.
 */
export declare function priorityFor(value: number, ts: number, decayHalfLifeDays: number, now?: number): number;
//# sourceMappingURL=backprop.d.ts.map