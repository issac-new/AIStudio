/**
 * V7 §6.3 — failure signal tracker.
 *
 * Adapters call `recordToolFailure` / `recordToolSuccess` after every tool
 * call. The tracker keeps a short rolling window per `(toolId, context)`
 * and raises a `FailureBurst` when:
 *
 *   - failures within the window ≥ `cfg.failureThreshold`
 *   - and at most one success in the same window (otherwise the tool is
 *     intermittently working and we don't want to trigger repair).
 *
 * The tracker is intentionally in-memory: decision repair is a "what do
 * we inject in the next turn" decision, so we don't need to persist
 * failure counters across restarts. On restart we just start fresh.
 */
import { createHash } from "node:crypto";
import { rootLogger } from "../logger/index.js";
export function createFailureSignals(opts) {
    const log = opts.log ?? rootLogger.child({ channel: "core.feedback.signals" });
    const now = opts.now ?? (() => Date.now());
    const states = new Map();
    const successes = new Map();
    function key(toolId, context) {
        return `${toolId}|${context}`;
    }
    function snapshot(state) {
        return {
            ...state,
            contextHash: contextHashOf(state.toolId, state.context),
            failureCount: state.occurrences.length,
        };
    }
    return {
        recordFailure(rec) {
            const k = key(rec.toolId, rec.context);
            const existing = states.get(k);
            const state = existing ??
                {
                    toolId: rec.toolId,
                    context: rec.context,
                    firstSeen: rec.ts,
                    lastSeen: rec.ts,
                    windowStart: rec.step,
                    occurrences: [],
                };
            // Prune occurrences that fell out of the rolling step-window. This
            // keeps the counter honest when failures are interleaved with far
            // steps that happened to be successes on other tools.
            const minStep = rec.step - opts.config.failureWindow + 1;
            const pruned = state.occurrences.filter((o) => o.step >= minStep);
            pruned.push(rec);
            state.occurrences = pruned;
            state.lastSeen = rec.ts;
            state.windowStart = minStep;
            if (!existing)
                state.firstSeen = rec.ts;
            states.set(k, state);
            const successAt = successes.get(k);
            const successInWindow = successAt !== undefined && successAt >= state.windowStart;
            log.debug("failure.recorded", {
                toolId: rec.toolId,
                context: rec.context,
                count: state.occurrences.length,
                threshold: opts.config.failureThreshold,
                successInWindow,
            });
            if (state.occurrences.length >= opts.config.failureThreshold &&
                !successInWindow) {
                return snapshot(state);
            }
            return null;
        },
        recordSuccess(toolId, context, step) {
            const k = key(toolId, context);
            successes.set(k, step);
            // A success in the same window resets the failure streak — we still
            // keep the occurrences around for diagnostics but they no longer
            // count toward `failureThreshold` until a new failure fires.
            const state = states.get(k);
            if (state) {
                state.occurrences = state.occurrences.filter((o) => o.step >= step);
            }
            log.debug("success.recorded", { toolId, context, step });
        },
        peek(toolId, context) {
            const state = states.get(key(toolId, context));
            return state ? snapshot(state) : null;
        },
        clear(contextHash) {
            if (!contextHash) {
                states.clear();
                successes.clear();
                return;
            }
            for (const [k, v] of states.entries()) {
                if (contextHashOf(v.toolId, v.context) === contextHash) {
                    states.delete(k);
                    successes.delete(k);
                }
            }
        },
        stats() {
            let total = 0;
            for (const s of states.values())
                total += s.occurrences.length;
            return { states: states.size, totalFailures: total };
        },
    };
}
/**
 * Stable short hash used as the canonical identifier for a tool/context
 * pair. Matches the `context_hash` column in `decision_repairs`.
 */
export function contextHashOf(toolId, context) {
    return createHash("sha1")
        .update(`${toolId}\n${context}`, "utf8")
        .digest("hex")
        .slice(0, 16);
}
//# sourceMappingURL=signals.js.map