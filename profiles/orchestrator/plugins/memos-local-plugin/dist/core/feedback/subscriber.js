/**
 * Wires the feedback module to its upstream signals.
 *
 * The feedback subscriber exposes **two** imperative channels that
 * adapters drive directly — there is no background event bus for
 * failure counting because the signals must be live inside the agent
 * step loop:
 *
 *   - `recordToolFailure` / `recordToolSuccess` — forwarded to the
 *     `failureSignals` tracker. When a burst is detected the subscriber
 *     schedules a `runRepair` on a microtask so adapters never block.
 *
 *   - `submitUserFeedback` — fires a repair run with the classified
 *     feedback. Also emits `feedback.classified` for downstream UI.
 *
 * The handle also exposes `runOnce` for manual triggers (viewer button)
 * and `dispose` for cleanup.
 */
import { rootLogger } from "../logger/index.js";
import { contextHashOf, createFailureSignals, } from "./signals.js";
import { runRepair } from "./feedback.js";
export function attachFeedbackSubscriber(deps) {
    const log = deps.log ?? rootLogger.child({ channel: "core.feedback.subscriber" });
    const runDeps = { ...deps, log };
    const signals = createFailureSignals({
        config: deps.config,
        log: log.child({ channel: "core.feedback.signals" }),
    });
    let inflight = null;
    const queue = [];
    function enqueue(job) {
        queue.push(job);
        if (inflight)
            return;
        const promise = drain().finally(() => {
            if (inflight === promise)
                inflight = null;
        });
        inflight = promise;
    }
    async function drain() {
        while (queue.length > 0) {
            const job = queue.shift();
            if (!job)
                break;
            try {
                await job();
            }
            catch (err) {
                log.error("repair.job.failed", {
                    err: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }
    function triggerFromBurst(burst) {
        const input = {
            trigger: "failure-burst",
            contextHash: burst.contextHash,
            toolId: burst.toolId,
            failures: burst.occurrences,
            sessionId: burst.occurrences.find((o) => o.sessionId)?.sessionId,
            episodeId: burst.occurrences.find((o) => o.episodeId)?.episodeId,
        };
        enqueue(async () => {
            await runRepair(input, runDeps);
            signals.clear(burst.contextHash);
        });
    }
    return {
        signals,
        recordToolFailure(input) {
            const now = Date.now();
            const record = {
                toolId: input.toolId,
                context: input.context,
                step: input.step,
                reason: input.reason ?? "",
                ts: now,
                sessionId: input.sessionId,
                episodeId: input.episodeId,
            };
            const burst = signals.recordFailure(record);
            if (burst) {
                log.info("failure.burst.detected", {
                    toolId: burst.toolId,
                    context: burst.context,
                    count: burst.failureCount,
                });
                triggerFromBurst(burst);
            }
        },
        recordToolSuccess(input) {
            signals.recordSuccess(input.toolId, input.context, input.step);
        },
        async submitUserFeedback(input) {
            const ctx = input.context ?? input.sessionId ?? "_";
            const tool = input.toolId ?? "_";
            const contextHash = contextHashOf(tool, ctx);
            const repairInput = {
                trigger: "user.negative",
                contextHash,
                toolId: input.toolId,
                userText: input.text,
                sessionId: input.sessionId,
                episodeId: input.episodeId,
            };
            return runRepair(repairInput, runDeps);
        },
        async runOnce(input) {
            return runRepair(input, runDeps);
        },
        async flush() {
            while (inflight) {
                await inflight;
            }
        },
        dispose() {
            signals.clear();
            log.info("feedback.subscriber.disposed");
        },
    };
}
//# sourceMappingURL=subscriber.js.map