/**
 * V7 §2.4.6 — synthesize a `DecisionRepairDraft` from evidence + trigger.
 *
 * Two paths:
 *
 *   - `useLlm === true` + `llm` provided: call `decision.repair` prompt
 *     for a polished `{preference, anti_pattern, severity, confidence}`
 *     block grounded in the evidence.
 *   - `useLlm === false` OR the LLM fails: fall back to a deterministic
 *     template that picks the highest-value trace for `preference` and the
 *     lowest-value trace for `anti_pattern`. The template is intentionally
 *     blunt — it's better to have a conservative repair than none at all.
 *
 * Either way, the output is normalised to a consistent `DecisionRepairDraft`
 * and the confidence is clamped to `[0, 1]`. The orchestrator decides
 * whether to persist based on `valueDelta`.
 */
import type { LlmClient } from "../llm/types.js";
import type { Logger } from "../logger/types.js";
import type { PolicyRow, TraceRow } from "../types.js";
import type { ClassifiedFeedback, DecisionRepairDraft, FeedbackConfig, RepairTrigger } from "./types.js";
export interface SynthesizeInput {
    trigger: RepairTrigger;
    contextHash: string;
    highValue: TraceRow[];
    lowValue: TraceRow[];
    classifiedFeedback?: ClassifiedFeedback;
    toolId?: string;
    /** Policies referenced by the high/low-value traces — used for attach. */
    candidatePolicies?: readonly PolicyRow[];
}
export interface SynthesizeDeps {
    llm: LlmClient | null;
    log: Logger;
    config: FeedbackConfig;
}
export type SynthesizeResult = {
    ok: true;
    draft: DecisionRepairDraft;
} | {
    ok: false;
    reason: "insufficient-evidence" | "llm-failed" | "llm-disabled";
    detail?: string;
};
export declare function synthesizeDraft(input: SynthesizeInput, deps: SynthesizeDeps): Promise<SynthesizeResult>;
//# sourceMappingURL=synthesize.d.ts.map