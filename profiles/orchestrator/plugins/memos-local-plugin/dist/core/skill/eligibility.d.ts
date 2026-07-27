/**
 * V7 §2.5.1 — Skill crystallization eligibility.
 *
 * A policy is eligible if **all** of:
 *   1. `policy.status === "active"` — archived / candidate policies never
 *      crystallize.
 *   2. `policy.gain >= minGain` — rewards have shown positive lift.
 *   3. `policy.support >= minSupport` — enough *distinct* episodes back it.
 *   4. Feedback-derived avoidance policies must have at least one success
 *      anchor before they can crystallize into a Skill.
 *   5. It is not already represented by a non-archived skill, OR the existing
 *      skill was built before the policy's latest `updatedAt` (→ rebuild).
 *
 * The check returns a structured verdict per policy so the orchestrator can
 * emit a single rollup event. We never mutate anything here — this module is
 * read-only on purpose to make it trivially unit-testable.
 */
import type { PolicyRow, SkillRow } from "../types.js";
import type { SkillConfig } from "./types.js";
export interface EligibilityDecision {
    policy: PolicyRow;
    existingSkill: SkillRow | null;
    /** "crystallize" = fresh mint; "rebuild" = replace existing skill. */
    action: "crystallize" | "rebuild" | "skip";
    reason: string;
}
export interface EligibilityInput {
    policies: PolicyRow[];
    /**
     * Map from policyId → the latest skill (non-archived) citing it, if any.
     * Callers collect this via `skillsRepo.list()` once per run.
     */
    skillsByPolicy: Map<string, SkillRow>;
}
export interface EligibilityResult {
    decisions: EligibilityDecision[];
    eligibleCount: number;
    skippedCount: number;
}
export declare function evaluateEligibility(input: EligibilityInput, config: SkillConfig): EligibilityResult;
//# sourceMappingURL=eligibility.d.ts.map