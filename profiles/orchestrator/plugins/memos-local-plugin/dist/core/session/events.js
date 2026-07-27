/**
 * `SessionEventBus` — a deliberately tiny in-process pub/sub.
 *
 * We don't use Node's built-in `EventEmitter` because:
 *   - we want one subscribe API that returns an unsubscribe function,
 *   - we want a "wildcard" `onAny` channel to make it easy to forward
 *     events to the viewer (via SSE), the Phase 15 pipeline orchestrator,
 *     and future telemetry sinks,
 *   - we want synchronous delivery so the orchestrator can keep ordering.
 *
 * Listener exceptions are caught and routed to `rootLogger.warn` — one bad
 * subscriber must never break another.
 */
import { rootLogger } from "../logger/index.js";
export function createSessionEventBus() {
    const byKind = new Map();
    const anyListeners = new Set();
    const log = rootLogger.child({ channel: "core.session" });
    function add(set, fn) {
        set.add(fn);
        return () => {
            set.delete(fn);
        };
    }
    return {
        on(kind, fn) {
            let set = byKind.get(kind);
            if (!set) {
                set = new Set();
                byKind.set(kind, set);
            }
            return add(set, fn);
        },
        onAny(fn) {
            return add(anyListeners, fn);
        },
        emit(evt) {
            const dispatch = (fn) => {
                try {
                    fn(evt);
                }
                catch (err) {
                    log.warn("event.listener_error", {
                        kind: evt.kind,
                        err: errDetail(err),
                    });
                }
            };
            const targeted = byKind.get(evt.kind);
            if (targeted)
                for (const fn of targeted)
                    dispatch(fn);
            for (const fn of anyListeners)
                dispatch(fn);
        },
        listenerCount(kind) {
            if (!kind) {
                let total = anyListeners.size;
                for (const set of byKind.values())
                    total += set.size;
                return total;
            }
            return (byKind.get(kind)?.size ?? 0) + anyListeners.size;
        },
    };
}
function errDetail(err) {
    if (err instanceof Error)
        return { name: err.name, message: err.message };
    return { value: String(err) };
}
//# sourceMappingURL=events.js.map