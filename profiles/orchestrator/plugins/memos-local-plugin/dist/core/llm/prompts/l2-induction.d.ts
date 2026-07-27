import type { PromptDef } from "./index.js";
/**
 * V7 §5 — Cross-task L2 induction.
 *
 * Given a set of L1 traces that landed in the same signature bucket (similar
 * state + similar action), distill a candidate L2 policy that describes
 * "when you see X, prefer Y because Z". The candidate is still probationary
 * until the evaluator confirms it raises task success.
 *
 * Boundary contract (see `docs/GRANULARITY-AND-MEMORY-LAYERS.md` §6):
 * an L2 policy is **procedural** ("how to do it") — it MUST contain an
 * action template. Anything declarative ("the environment looks like X")
 * belongs to the L3 world model, not here. The system prompt explicitly
 * rejects environment-fact drift to keep the two layers semantically
 * orthogonal. Bumping the version to v2 captures that change.
 */
export declare const L2_INDUCTION_PROMPT: PromptDef;
//# sourceMappingURL=l2-induction.d.ts.map