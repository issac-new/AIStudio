/**
 * `core/feedback` — public + internal types for the Decision Repair pipeline.
 *
 * The feedback module does **two** related things that both feed V7 §2.4.6
 * (Decision Repair):
 *
 *   1. **Failure signalling** — track per-tool / per-context failure counts
 *      and raise a "stuck loop" alarm when the count crosses a threshold
 *      inside a short step window. This drives the `repair.triggered` event
 *      the pipeline uses to override the next turn's retrieval plan with
 *      `decision_repair`.
 *
 *   2. **User feedback classification + repair** — when the user says "no,
 *      not like that" or "prefer X over Y", extract a preference /
 *      anti-pattern pair and persist it to `decision_repairs`, grounded in
 *      the high-value and low-value traces of the recent context.
 *
 * The two paths share a final stage (`synthesizeDraft` → persist →
 * attach-to-policy) but have different triggers, so we model them as
 * two orchestrator entry points that share a common `DecisionRepairDeps`.
 *
 * Everything here is *internal* to `core/feedback`; `index.ts` re-exports
 * what the orchestrator and tests need.
 */
export {};
//# sourceMappingURL=types.js.map