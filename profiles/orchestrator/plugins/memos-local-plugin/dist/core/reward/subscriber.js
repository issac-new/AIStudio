/**
 * `subscriber` — glue between `core/capture` and `core/reward`.
 *
 * Model:
 *   1. When `capture.done` fires for an episode with traces, register it in
 *      `pending` and schedule one reward run after `feedbackWindowSec` (≥1s).
 *   2. Explicit feedback is persisted via `memory-core.submitFeedback` (DB);
 *      the scheduled run passes `feedback: []` and `reward.run` merges from
 *      `feedbackRepo.getForEpisode`.
 *   3. When the window expires (or `drain()`), run once with
 *      `trigger="implicit_fallback"` (overridden in `reward.run` when DB has
 *      feedback rows).
 *   4. `submitFeedback` on this subscription is a no-op — do not score here.
 *
 * `pendingCount()` = scheduled-but-not-started episodes + in-flight runs.
 */
import { rootLogger } from "../logger/index.js";
function resolveWindowSec(cfg, opts) {
    const raw = opts.feedbackWindowSec ?? cfg.feedbackWindowSec;
    return Math.max(1, raw);
}
export function attachRewardSubscriber(captureBus, runner, cfg, opts = {}) {
    const log = rootLogger.child({ channel: "core.reward" });
    const windowSec = resolveWindowSec(cfg, opts);
    const windowMs = windowSec * 1_000;
    const pending = new Map();
    const inflight = new Set();
    function schedule(episodeId, delayMs) {
        const entry = pending.get(episodeId);
        if (!entry)
            return;
        if (entry.timer)
            clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
            pending.delete(episodeId);
            runInBackground(() => runner.run({
                episodeId,
                feedback: [],
                trigger: "implicit_fallback",
            }));
        }, delayMs);
    }
    function runInBackground(fn) {
        const p = fn()
            .catch((err) => {
            log.error("run.failed", { err: errDetail(err) });
            if (opts.onError)
                opts.onError(err, err.episodeId);
        })
            .finally(() => {
            inflight.delete(p);
        });
        inflight.add(p);
    }
    const unsub = captureBus.on("capture.done", (evt) => {
        if (evt.kind !== "capture.done")
            return;
        const eid = evt.result.episodeId;
        if (evt.result.traceIds.length === 0) {
            log.debug("skip.empty_capture", { episodeId: eid });
            return;
        }
        pending.set(eid, { episodeId: eid, timer: null });
        schedule(eid, windowMs);
    });
    return {
        submitFeedback(feedback) {
            log.debug("submitFeedback.noop", {
                episodeId: feedback.episodeId,
                hint: "persist via memory-core.submitFeedback; score at window end",
            });
        },
        async runManually(episodeId, trigger = "manual") {
            const entry = pending.get(episodeId);
            if (entry?.timer)
                clearTimeout(entry.timer);
            pending.delete(episodeId);
            await runner.run({
                episodeId,
                feedback: [],
                trigger,
            });
        },
        stop() {
            for (const entry of pending.values()) {
                if (entry.timer)
                    clearTimeout(entry.timer);
            }
            pending.clear();
            unsub();
        },
        async drain() {
            const flushed = [];
            for (const entry of pending.values()) {
                if (entry.timer)
                    clearTimeout(entry.timer);
                flushed.push(entry);
            }
            pending.clear();
            for (const entry of flushed) {
                runInBackground(() => runner.run({
                    episodeId: entry.episodeId,
                    feedback: [],
                    trigger: "implicit_fallback",
                }));
            }
            while (inflight.size > 0) {
                await Promise.all(Array.from(inflight));
            }
        },
        pendingCount() {
            return pending.size + inflight.size;
        },
    };
}
function errDetail(err) {
    if (err instanceof Error)
        return { name: err.name, message: err.message };
    return { value: String(err) };
}
//# sourceMappingURL=subscriber.js.map