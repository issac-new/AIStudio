/**
 * `subscriber` — wire the capture runner into the Phase 5 session bus.
 *
 * One call wires up `session.episode.finalized` → `runner.run(...)`. The
 * orchestrator (Phase 15) will replace this with a richer subscriber that
 * chains reward / l2.incremental / skill crystallization, but this module
 * is standalone: you can plug it into the `SessionManager` today and it
 * will happily write L1 rows with α scores.
 */
import { rootLogger } from "../logger/index.js";
export function attachCaptureSubscriber(bus, runner, opts = {}) {
    const log = rootLogger.child({ channel: "core.capture" });
    const captureAbandoned = opts.captureAbandoned ?? true;
    const pending = new Set();
    const unsub = bus.on("episode.finalized", (evt) => {
        if (evt.kind !== "episode.finalized")
            return;
        if (evt.closedBy === "abandoned" && !captureAbandoned) {
            log.debug("subscriber.skip_abandoned", { episodeId: evt.episode.id });
            return;
        }
        if (evt.episode.meta?.lightweightMemory === true) {
            log.debug("subscriber.skip_lightweight", { episodeId: evt.episode.id });
            return;
        }
        // Topic ended → batch reflect across every step + emit
        // `capture.done` so the reward subscriber kicks off R_human + V
        // backprop. Per-turn lite captures already wrote the trace rows;
        // this pass just patches reflection + α onto them.
        const p = runner
            .runReflect({ episode: evt.episode, closedBy: evt.closedBy })
            .catch((err) => {
            log.error("subscriber.capture_failed", {
                episodeId: evt.episode.id,
                err: errDetail(err),
            });
            if (opts.onError)
                opts.onError(err);
        })
            .finally(() => {
            pending.delete(p);
        });
        pending.add(p);
    });
    return {
        stop() {
            unsub();
        },
        async drain() {
            while (pending.size > 0) {
                await Promise.all(Array.from(pending));
            }
        },
        pendingCount() {
            return pending.size;
        },
    };
}
function errDetail(err) {
    if (err instanceof Error)
        return { name: err.name, message: err.message };
    return { value: String(err) };
}
//# sourceMappingURL=subscriber.js.map