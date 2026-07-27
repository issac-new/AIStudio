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
import type { Logger } from "../logger/types.js";
import type { EpochMs } from "../types.js";
import type { FailureBurst, FailureRecord, FeedbackConfig } from "./types.js";
export interface SignalsOptions {
    config: FeedbackConfig;
    log?: Logger;
    now?: () => EpochMs;
}
export interface FailureSignalsHandle {
    recordFailure(rec: FailureRecord): FailureBurst | null;
    recordSuccess(toolId: string, context: string, step: number): void;
    peek(toolId: string, context: string): FailureBurst | null;
    clear(contextHash?: string): void;
    stats(): {
        states: number;
        totalFailures: number;
    };
}
export declare function createFailureSignals(opts: SignalsOptions): FailureSignalsHandle;
/**
 * Stable short hash used as the canonical identifier for a tool/context
 * pair. Matches the `context_hash` column in `decision_repairs`.
 */
export declare function contextHashOf(toolId: string, context: string): string;
//# sourceMappingURL=signals.d.ts.map