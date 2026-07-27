import type { PromptDef } from "./index.js";
/**
 * Relevance-filter prompt for retrieved candidates.
 *
 * Mirrors the legacy `memos-local-openclaw` `unifiedLLMFilter`, but
 * tuned for the plugin's tier-aware candidate labels (SKILL / TRACE /
 * EPISODE / WORLD-MODEL). Key design choices:
 *
 *   1. **Five few-shot examples** — useful facts, useful skills, and
 *      surface-similar wrong sub-problems — so the model learns to rank
 *      relevant items without imposing its own result cap.
 *   2. **Informational tone, not strict gatekeeping.** The filter is
 *      the *precision* pass, not a second retrieval — we lean towards
 *      keeping anything that could plausibly help, because the ranker
 *      already pruned the obvious noise.
 *   3. **`sufficient` self-report.** The model reports whether the
 *      useful set is enough to answer the query; callers surface this
 *      so the agent can decide whether to widen recall.
 *
 * Bumping `version` rotates the prompt-fingerprint id used by
 * `core/llm` audit trails, so A/B data from v2 and v3 stays separable.
 */
export declare const RETRIEVAL_FILTER_PROMPT: PromptDef;
//# sourceMappingURL=retrieval-filter.d.ts.map