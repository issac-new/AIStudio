/**
 * Gathers supporting L1 traces for a crystallization candidate.
 *
 * Reads episode **canonical** `traceIds` when present, otherwise a high
 * `limit` list, then dedupes by `traceIdentitySignature` before scoring.
 */
import type { EpisodeOutcome } from "../episode/outcome.js";
import type { EpisodeId, PolicyRow, SkillRow, TraceRow } from "../types.js";
import type { Repos } from "../storage/repos/index.js";
import type { SkillConfig } from "./types.js";
/** Match `traces.list` cap — long episodes must not truncate to the default 50. */
export declare const EPISODE_TRACE_POOL_LIMIT = 500;
export interface AnnotatedTrace {
    trace: TraceRow;
    episodeOutcome: EpisodeOutcome;
    episodeRTask: number | null;
    episodeVerifierPassed: boolean | null;
}
export interface EvidenceResult {
    traces: AnnotatedTrace[];
    episodeIds: EpisodeId[];
    medianValue: number;
    /** Traces considered before top-N slice (after signature dedupe). */
    poolAfterDedupe: number;
    /** Traces dropped because episode.outcome === failure (hard exclude). */
    excludedFailureCount: number;
    outcomeCounts: {
        success: number;
        failure: number;
        unknown: number;
    };
}
export interface EvidenceDeps {
    repos: Pick<Repos, "traces" | "episodes">;
    config: Pick<SkillConfig, "evidenceLimit" | "traceCharCap">;
}
export declare function gatherEvidence(policy: PolicyRow, deps: EvidenceDeps): EvidenceResult;
export interface IncrementalEvidenceResult {
    traces: AnnotatedTrace[];
    poolAfterDedupe: number;
}
/**
 * Canonical traces whose ids are not yet in `skill.evidenceAnchors`, after
 * signature dedupe (ignores orphan duplicate rows).
 */
export declare function gatherIncrementalEvidence(policy: PolicyRow, existingSkill: SkillRow, deps: EvidenceDeps): IncrementalEvidenceResult;
export declare function gatherCounterExamples(policy: PolicyRow, deps: EvidenceDeps): AnnotatedTrace[];
//# sourceMappingURL=evidence.d.ts.map