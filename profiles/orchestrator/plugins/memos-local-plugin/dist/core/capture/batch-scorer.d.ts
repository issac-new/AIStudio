/**
 * `batch-scorer` — windowed tri-valued path-relevance scoring for one episode
 * window. Always invoked through `capture.ts :: runEpisodeBatchScoring`,
 * which owns the primary/degrade window topology and retry ladder.
 *
 * Wire format ↔ prompt:
 *   Send `{ host_context?, task_context?, steps: [{idx, state, thinking,
 *           action, tool_calls, outcome}] }`.
 *   Receive `{ scores: [{idx,
 *           relevance: "IRRELEVANT" | "RELATED" | "PIVOTAL", reason: str}] }`.
 *   See `core/llm/prompts/reflection.ts :: BATCH_REFLECTION_PROMPT`.
 *
 * Validation: relevance outside {IRRELEVANT, RELATED, PIVOTAL} raises
 * `LLM_OUTPUT_MALFORMED` so the caller's window retry ladder can take over.
 * A missing/empty `reason` is downgraded to a per-window warn — we keep the
 * (relevance, alpha) signal rather than fall the whole episode into
 * `RELATED_DEFAULT` just because the model dropped the reason code.
 */
import type { LlmClient } from "../llm/index.js";
import type { NormalizedStep, ReflectionScore } from "./types.js";
export interface BatchScoreInput {
    step: NormalizedStep;
}
export interface BatchScoreOptions {
    episodeId?: string;
    phase?: string;
    taskSummary?: string | null;
    perFieldChars?: {
        state: number;
        action: number;
        outcome: number;
    };
}
export interface BatchScoreResult {
    /** Per-step `ReflectionScore`, one entry per input, in input order. */
    scores: ReflectionScore[];
    /** `servedBy` model id from the underlying LLM call. */
    model: string;
}
export declare const BATCH_OP_TAG: string;
/**
 * One LLM call → tri-valued relevance; backend maps α for every input step.
 *
 * Throws `MemosError` with `LLM_OUTPUT_MALFORMED` when the LLM returns a
 * shape we cannot parse even after the facade's malformed-retry. Caller
 * (capture.ts) catches and falls back to per-step.
 *
 * Empty `inputs` → returns empty `scores` without invoking the LLM.
 */
export declare function batchScoreReflections(llm: LlmClient, inputs: ReadonlyArray<BatchScoreInput>, opts: BatchScoreOptions): Promise<BatchScoreResult>;
//# sourceMappingURL=batch-scorer.d.ts.map