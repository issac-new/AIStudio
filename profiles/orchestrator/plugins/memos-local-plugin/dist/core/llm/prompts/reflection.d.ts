import type { PromptDef } from "./index.js";
/**
 * V7 §3.2 — Windowed path-relevance scoring (tri-valued relevance).
 *
 * One LLM call per episode window. The LLM returns only:
 * - `idx`
 * - `relevance ∈ {IRRELEVANT, RELATED, PIVOTAL}`
 * - `reason` (short reason code)
 *
 * `alpha` is mapped in backend: IRRELEVANT=0, RELATED=0.5, PIVOTAL=1.
 * `RELATED_DEFAULT` is backend fallback only and must not be emitted by LLM.
 */
export declare const BATCH_REFLECTION_PROMPT: PromptDef;
//# sourceMappingURL=reflection.d.ts.map