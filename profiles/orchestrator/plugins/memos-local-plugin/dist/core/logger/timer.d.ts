/**
 * High-resolution operation timer used by `logger.timer(...)`.
 *
 * The returned `PerfSpan`:
 *   - implements `Symbol.dispose` (so `using span = log.timer("op")` works);
 *   - emits a `kind: "perf"` record on close;
 *   - is idempotent — calling `end()` twice or disposing after `end()` is a
 *     no-op.
 */
import type { PerfSpan } from "./types.js";
export interface TimerEnvelope {
    channel: string;
    op: string;
    /** Initial extra context. */
    extra?: Record<string, unknown>;
    /** Sampling rate in [0, 1]; emit is skipped probabilistically when < 1. */
    sampleRate: number;
    /** Called when the span closes (with the constructed perf record fields). */
    emit(payload: {
        ms: number;
        channel: string;
        op: string;
        extra: Record<string, unknown>;
    }): void;
}
export declare function createSpan(env: TimerEnvelope): PerfSpan;
//# sourceMappingURL=timer.d.ts.map