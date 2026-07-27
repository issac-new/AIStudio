/**
 * Wires the skill module to the upstream event buses.
 *
 * Upstream triggers (all debounced via `queueMicrotask` so they never block
 * the emitter):
 *
 *   - `l2.policy.induced`        → `runSkill({ trigger, policyId })`
 *   - `l2.policy.status_changed` → `runSkill({ trigger, policyId })` when
 *                                  the new status is `active`
 *   - `reward.updated`           → `runSkill({ trigger: "reward.updated" })`
 *                                  — evaluates every policy referenced by
 *                                  the updated episode. Also drives the η
 *                                  drift adjustment on existing skills.
 *
 * The handle returns `runOnce` for manual runs (used by the CLI / viewer
 * rebuild button) and `applyFeedback` for explicit skill feedback.
 */
import type { L2EventBus } from "../memory/l2/types.js";
import type { Logger } from "../logger/types.js";
import type { RewardEventBus } from "../reward/types.js";
import { type RunSkillDeps } from "./skill.js";
import type { RunSkillInput, RunSkillResult, SkillEventBus, SkillFeedbackKind, SkillTrigger } from "./types.js";
import type { SkillId } from "../types.js";
export interface SkillSubscriberDeps extends Omit<RunSkillDeps, "log" | "bus"> {
    log?: Logger;
    bus: SkillEventBus;
    l2Bus: L2EventBus;
    rewardBus: RewardEventBus;
}
export interface SkillSubscriberHandle {
    dispose(): void;
    runOnce(input: Omit<RunSkillInput, "trigger"> & {
        trigger?: SkillTrigger;
    }): Promise<RunSkillResult>;
    applyFeedback(skillId: SkillId, kind: SkillFeedbackKind, magnitude?: number): void;
    /**
     * Await any in-flight scheduled run. Primarily useful in tests where we
     * want to assert on the effects of an event-driven run after the bus has
     * fanned out the event.
     */
    flush(): Promise<void>;
}
export declare function attachSkillSubscriber(deps: SkillSubscriberDeps): SkillSubscriberHandle;
//# sourceMappingURL=subscriber.d.ts.map