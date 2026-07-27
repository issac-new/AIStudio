import type { PromptDef } from "./index.js";
/**
 * V7 §1.1 / §2.4.1 / §2.4.4 — L3 world-model abstraction.
 *
 * Given a cluster of compatible L2 policies (plus a short sample of the
 * L1 traces that minted them), distill a **world model** answering
 * "what does this environment look like?" — not "what should I do?".
 *
 * Output must follow the V7 triple (ℰ, ℐ, C):
 *   - environment: topology facts ("src/ contains components/, utils/, …")
 *   - inference:   behavioural rules ("Alpine ships musl libc; binary
 *                  wheels built against glibc fail to load")
 *   - constraints: taboos ("don't edit node_modules/")
 *
 * The LLM also names up to 4 `domain_tags` — stable short strings
 * (`docker`, `node`, `npm`) we use for Tier-3 retrieval and for merging
 * future world models into the same row.
 *
 * Boundary contract (see `docs/GRANULARITY-AND-MEMORY-LAYERS.md` §6):
 * A world model is **declarative** ("how the environment is"), not
 * **procedural** ("what to do"). Procedural knowledge belongs to the
 * L2 layer; this prompt explicitly rejects action-prescription drift to
 * keep the two layers semantically orthogonal. Bumping to v2 captures
 * that change.
 */
export declare const L3_ABSTRACTION_PROMPT: PromptDef;
//# sourceMappingURL=l3-abstraction.d.ts.map