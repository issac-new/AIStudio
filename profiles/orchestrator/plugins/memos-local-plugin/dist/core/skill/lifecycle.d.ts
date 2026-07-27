/**
 * V7 §2.5.4 — Skill lifecycle.
 *
 * A skill moves through three visible states: `candidate`, `active`,
 * `archived`. Transitions are driven by:
 *
 *   - **Trials**: `trialsAttempted` grows on every `trial.pass` / `trial.fail`
 *     feedback signal. Once `trialsAttempted >= candidateTrials` we check
 *     the success ratio + η and promote to `active` or bounce back.
 *   - **Reward**: `reward.updated` on the source policy bubbles into
 *     `recomputeEta`, which re-seeds η from the policy's updated gain.
 *   - **User thumbs**: direct `user.positive` / `user.negative` signals
 *     adjust η by `etaDelta`.
 *
 * Everything here is pure over a `SkillRow`. The orchestrator calls these
 * helpers inside a `tx` so updates are atomic and auditable.
 */
import type { PolicyRow, SkillRow } from "../types.js";
import type { SkillConfig, SkillFeedbackKind, SkillLifecycleTransition } from "./types.js";
export interface LifecycleUpdate {
    status: SkillRow["status"];
    eta: number;
    trialsAttempted: number;
    trialsPassed: number;
    transition?: SkillLifecycleTransition;
}
/**
 * Apply one feedback signal to a skill. Returns the post-update state.
 */
export declare function applyFeedback(skill: SkillRow, kind: SkillFeedbackKind, cfg: SkillConfig, magnitude?: number): LifecycleUpdate;
/**
 * Recompute the η a freshly-built skill should carry given its source
 * policy's latest gain + support. Used when we detect policy drift large
 * enough to rebuild a skill.
 */
export declare function recomputeEta(skill: SkillRow, policy: PolicyRow, cfg: SkillConfig): number;
/**
 * Decide if a skill has decayed enough to archive without any new
 * evidence (e.g. it has been inactive with a low-eta source policy).
 * Used by the orchestrator's periodic `lifecycle.tick`.
 */
export declare function shouldArchiveIdle(skill: SkillRow, idleMs: number, cfg: SkillConfig, now: number): boolean;
//# sourceMappingURL=lifecycle.d.ts.map