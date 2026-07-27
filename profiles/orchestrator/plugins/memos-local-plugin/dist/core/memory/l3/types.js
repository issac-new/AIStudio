/**
 * `core/memory/l3` — types.
 *
 * V7 §1.1 / §2.4.1 L3 世界模型:
 *     f^(3) = (ℰ, ℐ, C, {f^(2)})
 *
 * The L3 pipeline turns a cluster of compatible, reward-weighted L2
 * policies into a **world model** — a compressed description of the
 * environment those policies operate in:
 *
 *   - ℰ environment topology   — "what lives where"
 *   - ℐ inference rules         — "how the env responds"
 *   - C constraints / taboos    — "what you must not do"
 *
 * All shapes here are internal; `index.ts` re-exports only what callers
 * (pipeline orchestrator, viewer, adapters) actually need.
 */
export {};
//# sourceMappingURL=types.js.map