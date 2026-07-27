/**
 * LLM-driven L2 policy induction.
 *
 * Given a candidate bucket (≥ N distinct episodes' worth of evidence traces
 * sharing a PatternSignature), call the `l2.induction` prompt and build a
 * `PolicyRow` draft. If the draft passes cheap validation we persist it as a
 * new row with `status = 'candidate'`; gain updates can later promote it.
 *
 * Pure induction logic — no candidate-pool or events writes. Callers handle
 * that.
 */
import type { LlmClient } from "../../llm/index.js";
import type { Logger } from "../../logger/types.js";
import type { EpisodeId, PolicyId, PolicyRow, TraceRow } from "../../types.js";
import type { InductionDraft, InductionDraftResult } from "./types.js";
export interface InduceInput {
    /** Traces that back the induction (one from each episode; may contain duplicates). */
    evidenceTraces: readonly TraceRow[];
    /** Episode ids these traces came from — must be the distinct set. */
    episodeIds: readonly EpisodeId[];
    /** Human-readable signature for the bucket — appears in prompts. */
    signatureLabel: string;
    charCap: number;
    /**
     * Episode that triggered this induction run (i.e. the episode whose
     * trace just landed and re-fired runL2). Forwarded to the LLM call so
     * the resulting `system_model_status` audit row can be grouped with
     * the rest of that episode's pipeline activity in the Logs viewer.
     */
    triggerEpisodeId?: EpisodeId;
}
export interface InduceDeps {
    llm: LlmClient | null;
    log: Logger;
    /** When provided, run after JSON parse but before we accept the draft. */
    validate?: (d: InductionDraft) => void;
}
/**
 * Run the induction LLM call and validate the draft. Returns a tagged union
 * — callers can decide whether to persist.
 */
export declare function induceDraft(input: InduceInput, deps: InduceDeps): Promise<InductionDraftResult>;
/**
 * Convert a validated draft into a ready-to-persist `PolicyRow`.
 * Gain/support are zero-initialised — the gain step fills them in.
 */
export declare function buildPolicyRow(args: {
    draft: InductionDraft;
    episodeIds: readonly EpisodeId[];
    evidenceTraces: readonly TraceRow[];
    inducedBy: string;
    now?: number;
    id?: PolicyId;
}): PolicyRow;
//# sourceMappingURL=induce.d.ts.map