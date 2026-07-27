/**
 * Episode-level outcome classification for skill evidence routing.
 *
 * See docs: 2026-06-01-failure-aware-skill-sinking-design.md §2.1.
 */
import { objectiveOutcome } from "../experience/feedback-builder.js";
export const DEFAULT_OUTCOME_THRESHOLDS = {
    successThreshold: 0.5,
    failureThreshold: -0.15,
};
/**
 * Require a non-empty neutral band: rTask must be able to land between the two
 * thresholds without matching success (>=) or failure (<=) first.
 */
export function assertValidOutcomeThresholds(cfg) {
    if (cfg.successThreshold <= cfg.failureThreshold) {
        throw new Error(`outcomeRTaskSuccessThreshold (${cfg.successThreshold}) must be > outcomeRTaskFailureThreshold (${cfg.failureThreshold})`);
    }
}
/**
 * Classify an episode outcome from rTask + verifier signal.
 *
 * Priority:
 *   1. verifierPassed === false  → failure  (one-vote veto)
 *   2. rTask in judgment band    → rTask decides
 *   3. neutral rTask + verifierPassed === true → success
 *   4. otherwise → unknown
 */
export function computeEpisodeOutcome(rTask, verifierPassed, cfg = DEFAULT_OUTCOME_THRESHOLDS) {
    if (verifierPassed === false)
        return "failure";
    if (rTask != null) {
        if (rTask >= cfg.successThreshold)
            return "success";
        if (rTask <= cfg.failureThreshold)
            return "failure";
    }
    if (verifierPassed === true)
        return "success";
    return "unknown";
}
/**
 * Tri-state verifier pass from feedback rows (no rTask fallback).
 *
 * Uses the same parser as strict repair trials (`objectiveOutcome` with
 * `rTask=null`) so episode.verifierPassed stays aligned with subscriber.ts.
 * Any fail → false (one-vote veto); else any pass → true; else null.
 */
export function extractEpisodeVerifierPassed(feedbacks) {
    let sawPass = false;
    for (const f of feedbacks) {
        const o = objectiveOutcome(f.raw, null);
        if (o === "fail")
            return false;
        if (o === "pass")
            sawPass = true;
    }
    return sawPass ? true : null;
}
//# sourceMappingURL=outcome.js.map