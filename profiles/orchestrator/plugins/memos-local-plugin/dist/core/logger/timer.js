/**
 * High-resolution operation timer used by `logger.timer(...)`.
 *
 * The returned `PerfSpan`:
 *   - implements `Symbol.dispose` (so `using span = log.timer("op")` works);
 *   - emits a `kind: "perf"` record on close;
 *   - is idempotent — calling `end()` twice or disposing after `end()` is a
 *     no-op.
 */
import { hrNowMs } from "../time.js";
export function createSpan(env) {
    const start = hrNowMs();
    let closed = false;
    const close = (more) => {
        if (closed)
            return;
        closed = true;
        if (env.sampleRate < 1 && Math.random() > env.sampleRate)
            return;
        const ms = hrNowMs() - start;
        env.emit({ ms, channel: env.channel, op: env.op, extra: { ...(env.extra ?? {}), ...(more ?? {}) } });
    };
    return {
        end(extra) { close(extra); },
        [Symbol.dispose]() { close(); },
    };
}
//# sourceMappingURL=timer.js.map