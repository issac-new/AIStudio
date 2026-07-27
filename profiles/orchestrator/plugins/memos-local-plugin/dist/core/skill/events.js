/**
 * Skill event bus — tiny targeted-vs-wildcard listener dispatcher.
 *
 * Mirrors `core/memory/l2/events.ts` + `core/memory/l3/events.ts` so every
 * business module has the same ergonomics. All errors thrown by listeners
 * are caught and logged on the dedicated channel; no listener can crash
 * the orchestrator.
 */
import { rootLogger } from "../logger/index.js";
export function createSkillEventBus() {
    const byKind = new Map();
    const anyListeners = new Set();
    const log = rootLogger.child({ channel: "core.skill.events" });
    function add(set, fn) {
        set.add(fn);
        return () => {
            set.delete(fn);
        };
    }
    function dispatch(fn, evt) {
        try {
            fn(evt);
        }
        catch (err) {
            log.warn("listener_threw", {
                kind: evt.kind,
                err: err instanceof Error
                    ? { name: err.name, message: err.message }
                    : { value: String(err) },
            });
        }
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
            const targeted = byKind.get(evt.kind);
            if (targeted)
                for (const fn of targeted)
                    dispatch(fn, evt);
            for (const fn of anyListeners)
                dispatch(fn, evt);
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
//# sourceMappingURL=events.js.map