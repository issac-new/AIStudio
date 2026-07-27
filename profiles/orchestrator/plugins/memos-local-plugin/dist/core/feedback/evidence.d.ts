/**
 * V7 §2.4.6 — gather evidence for a decision-repair synthesis.
 *
 * Given a context hash + sessionId (and, optionally, an episodeId), we need
 * two sets of traces:
 *
 *   - **HIGH_VALUE**: recent traces in the same session with value > 0 whose
 *     agentText overlaps with the failing context. These drive the
 *     `preference` field.
 *   - **LOW_VALUE**: recent traces in the same session with value ≤ 0 (or
 *     explicit failure markers). These drive the `anti_pattern` field.
 *
 * The gather is a cheap SQL scan — no vector math — because the traces
 * we're interested in are always very recent. The orchestrator caps the
 * evidence at `evidenceLimit` per class.
 */
import type { Logger } from "../logger/types.js";
import type { Repos } from "../storage/repos/index.js";
import type { SessionId, TraceRow } from "../types.js";
import type { FeedbackConfig } from "./types.js";
export interface EvidenceInput {
    sessionId: SessionId;
    /** Optional token to match inside trace agentText/userText/reflection. */
    keyword?: string;
    limit?: number;
}
export interface EvidenceResult {
    highValue: TraceRow[];
    lowValue: TraceRow[];
}
export interface EvidenceDeps {
    repos: Repos;
    config: FeedbackConfig;
    log: Logger;
}
export declare function gatherRepairEvidence(input: EvidenceInput, deps: EvidenceDeps): EvidenceResult;
/**
 * Truncate a trace trio to roughly `maxChars` preserving the tail (the
 * most recent lines) — the error messages we want to learn from usually
 * live at the end of the agentText.
 */
export declare function capTrace(trace: TraceRow, maxChars: number): TraceRow;
//# sourceMappingURL=evidence.d.ts.map