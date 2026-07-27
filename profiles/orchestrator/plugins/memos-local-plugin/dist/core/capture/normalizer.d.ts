/**
 * `normalizer` — trim / clamp / dedup freshly extracted steps.
 *
 * Responsibilities (cheap, synchronous):
 *   1. Truncate userText / agentText above config.maxTextChars.
 *      We keep both the head AND the tail, joined with a marker, so both
 *      "what the user asked" and "how the assistant wrapped up" survive.
 *   2. Truncate per-tool-output above config.maxToolOutputChars. Input
 *      is capped separately (via JSON stringify length).
 *   3. Drop steps where BOTH userText and agentText are empty (unusable).
 *   4. Dedup adjacent identical agent-text steps (LLM occasionally double-
 *      emits on retry).
 *
 * No LLM, no I/O. Pure data transformation.
 */
import type { CaptureConfig, NormalizedStep, StepCandidate } from "./types.js";
export declare function normalizeSteps(steps: readonly StepCandidate[], cfg: CaptureConfig): NormalizedStep[];
//# sourceMappingURL=normalizer.d.ts.map