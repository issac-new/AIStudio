/**
 * Retrieval-scoped event bus.
 *
 * Mirrors `createCaptureEventBus` / `createRewardEventBus`. We keep the
 * three pipelines on their own buses so that public adapters can subscribe
 * to "only retrieval" without type-unioning every kind in `core/`.
 *
 * The Phase 15 orchestrator is responsible for forwarding these to the
 * unified pipeline bus if/when the host wants one firehose.
 */
import { rootLogger } from "../logger/index.js";
const log = rootLogger.child({ channel: "core.retrieval.events" });
export function createRetrievalEventBus() {
    const all = new Set();
    const byKind = new Map();
    return {
        emit(evt) {
            const targets = [];
            for (const l of all)
                targets.push(l);
            const kl = byKind.get(evt.kind);
            if (kl)
                for (const l of kl)
                    targets.push(l);
            for (const l of targets) {
                try {
                    l(evt);
                }
                catch (err) {
                    log.warn("listener_threw", {
                        kind: evt.kind,
                        err: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        },
        on(listener) {
            all.add(listener);
            return () => all.delete(listener);
        },
        onKind(kind, listener) {
            let set = byKind.get(kind);
            if (!set) {
                set = new Set();
                byKind.set(kind, set);
            }
            set.add(listener);
            return () => {
                set.delete(listener);
            };
        },
    };
}
//# sourceMappingURL=events.js.map