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
import { rootLogger } from "../logger/index.js";
import { objectiveOutcome } from "../experience/feedback-builder.js";
import { applySkillFeedback, runSkill, } from "./skill.js";
export function attachSkillSubscriber(deps) {
    const log = deps.log ?? rootLogger.child({ channel: "core.skill" });
    const runDeps = {
        repos: deps.repos,
        embedder: deps.embedder,
        llm: deps.llm,
        log,
        bus: deps.bus,
        config: deps.config,
    };
    let inflight = null;
    let queued = null;
    async function drain() {
        while (queued) {
            const next = queued;
            queued = null;
            try {
                await runSkill({ trigger: next.trigger, policyId: next.hint?.policyId, skillId: next.hint?.skillId }, runDeps);
            }
            catch (err) {
                log.error("skill.run.failed", {
                    trigger: next.trigger,
                    err: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }
    function triggerRun(trigger, hint) {
        queued = { trigger, hint };
        if (inflight) {
            log.debug("skill.run.queued", { trigger });
            return;
        }
        const promise = drain().finally(() => {
            if (inflight === promise)
                inflight = null;
        });
        inflight = promise;
    }
    const offInduced = deps.l2Bus.on("l2.policy.induced", (evt) => {
        if (evt.kind !== "l2.policy.induced")
            return;
        log.debug("trigger.l2.policy.induced", { policyId: evt.policyId });
        triggerRun("l2.policy.induced", { policyId: evt.policyId });
    });
    const offStatus = deps.l2Bus.on("l2.policy.updated", (evt) => {
        if (evt.kind !== "l2.policy.updated")
            return;
        if (evt.status !== "active")
            return;
        log.debug("trigger.l2.policy.updated", { policyId: evt.policyId, status: evt.status });
        triggerRun("l2.policy.status_changed", { policyId: evt.policyId });
    });
    const offReward = deps.rewardBus.on("reward.updated", (evt) => {
        if (evt.kind !== "reward.updated")
            return;
        log.debug("trigger.reward.updated", {
            episodeId: evt.result.episodeId,
        });
        resolveTrialsForReward(evt);
        triggerRun("reward.updated");
    });
    function dispose() {
        offInduced();
        offStatus();
        offReward();
        log.info("skill.subscriber.disposed");
    }
    async function runOnce(input) {
        const trigger = input.trigger ?? "manual";
        return runSkill({
            trigger,
            policyId: input.policyId,
            skillId: input.skillId,
        }, runDeps);
    }
    function applyFeedback(skillId, kind, magnitude) {
        applySkillFeedback(skillId, kind, runDeps, magnitude);
    }
    function resolveTrialsForReward(evt) {
        const rTask = evt.result.rHuman;
        const passTh = deps.config.outcomeRTaskSuccessThreshold;
        const failTh = deps.config.outcomeRTaskFailureThreshold;
        const looseOutcome = rTask >= passTh ? "pass" :
            rTask <= failTh ? "fail" :
                "unknown";
        const trials = deps.repos.skillTrials.listPendingForEpisode(evt.result.episodeId);
        if (trials.length === 0)
            return;
        // Strict (verifier-origin repair) trials judge by full credit only — never
        // the loose rTask threshold. Computed lazily (and once) since most trials
        // are loose.
        let strictMemo;
        const strictOutcome = () => {
            if (strictMemo === undefined) {
                strictMemo = computeStrictOutcome(evt.result.episodeId);
            }
            return strictMemo;
        };
        for (const trial of trials) {
            const skill = deps.repos.skills.getById(trial.skillId);
            const strict = skill?.strictTrial === true;
            const outcome = strict ? strictOutcome() : looseOutcome;
            const evidence = {
                source: "reward.updated",
                episodeId: evt.result.episodeId,
                rTask,
                mode: strict ? "strict-full-pass" : "loose-threshold",
                threshold: strict
                    ? { fullPassOnly: true }
                    : { pass: passTh, fail: failTh },
                reason: strict
                    ? outcome === "pass"
                        ? "verifier full pass"
                        : outcome === "fail"
                            ? "verifier not a full pass"
                            : "no verifier signal on this episode"
                    : outcome === "pass"
                        ? `rTask >= ${passTh}`
                        : outcome === "fail"
                            ? `rTask <= ${failTh}`
                            : `${failTh} < rTask < ${passTh}`,
            };
            const changed = deps.repos.skillTrials.resolve(trial.id, outcome, evt.result.completedAt, evidence);
            if (!changed)
                continue;
            if (outcome === "pass" || outcome === "fail") {
                applySkillFeedback(trial.skillId, outcome === "pass" ? "trial.pass" : "trial.fail", runDeps);
            }
            log.info("skill.trial.resolved", {
                trialId: trial.id,
                skillId: trial.skillId,
                episodeId: evt.result.episodeId,
                outcome,
                mode: strict ? "strict" : "loose",
                rTask,
            });
        }
    }
    /**
     * Verifier-only verdict for a strict repair trial: scan the episode's
     * feedback for an objective verifier signal and require a full pass. Returns
     * "unknown" when no verifier payload exists — strict trials never pass on a
     * loose reward.
     */
    function computeStrictOutcome(episodeId) {
        const rows = deps.repos.feedback.list({ episodeId });
        for (const fb of rows) {
            const o = objectiveOutcome(fb.raw, null);
            if (o !== "unknown")
                return o;
        }
        return "unknown";
    }
    async function flush() {
        // Loop in case additional events arrive while we're draining.
        while (inflight) {
            await inflight;
        }
    }
    return { dispose, runOnce, applyFeedback, flush };
}
//# sourceMappingURL=subscriber.js.map