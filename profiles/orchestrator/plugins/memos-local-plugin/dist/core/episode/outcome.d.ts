/**
 * Episode-level outcome classification for skill evidence routing.
 *
 * See docs: 2026-06-01-failure-aware-skill-sinking-design.md §2.1.
 */
import type { FeedbackRow } from "../types.js";
export type EpisodeOutcome = "success" | "failure" | "unknown";
export interface OutcomeThresholds {
    successThreshold: number;
    failureThreshold: number;
}
export declare const DEFAULT_OUTCOME_THRESHOLDS: OutcomeThresholds;
/**
 * Require a non-empty neutral band: rTask must be able to land between the two
 * thresholds without matching success (>=) or failure (<=) first.
 */
export declare function assertValidOutcomeThresholds(cfg: OutcomeThresholds): void;
/**
 * Classify an episode outcome from rTask + verifier signal.
 *
 * Priority:
 *   1. verifierPassed === false  → failure  (one-vote veto)
 *   2. rTask in judgment band    → rTask decides
 *   3. neutral rTask + verifierPassed === true → success
 *   4. otherwise → unknown
 */
export declare function computeEpisodeOutcome(rTask: number | null, verifierPassed: boolean | null, cfg?: OutcomeThresholds): EpisodeOutcome;
/**
 * Tri-state verifier pass from feedback rows (no rTask fallback).
 *
 * Uses the same parser as strict repair trials (`objectiveOutcome` with
 * `rTask=null`) so episode.verifierPassed stays aligned with subscriber.ts.
 * Any fail → false (one-vote veto); else any pass → true; else null.
 */
export declare function extractEpisodeVerifierPassed(feedbacks: ReadonlyArray<Pick<FeedbackRow, "raw">>): boolean | null;
//# sourceMappingURL=outcome.d.ts.map