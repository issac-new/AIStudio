/**
 * `subscriber` — wire the capture runner into the Phase 5 session bus.
 *
 * One call wires up `session.episode.finalized` → `runner.run(...)`. The
 * orchestrator (Phase 15) will replace this with a richer subscriber that
 * chains reward / l2.incremental / skill crystallization, but this module
 * is standalone: you can plug it into the `SessionManager` today and it
 * will happily write L1 rows with α scores.
 */
import type { SessionEventBus } from "../session/types.js";
import type { CaptureRunner } from "./capture.js";
export interface CaptureSubscriberOptions {
    /**
     * When true, also run capture on `closedBy: "abandoned"` episodes.
     * Default true — the V7 spec says abandoned episodes should land in the
     * trace log with R_task = −1 so they contribute to anti-patterns.
     */
    captureAbandoned?: boolean;
    /** Callback for unhandled errors from fire-and-forget captures. */
    onError?: (err: unknown) => void;
}
export interface CaptureSubscription {
    /** Unsubscribe from the bus. Outstanding captures continue running. */
    stop(): void;
    /** Wait for every in-flight capture to finish. Test-only; safe to `await`. */
    drain(): Promise<void>;
    /** Count of currently-running captures — useful for assertions. */
    pendingCount(): number;
}
export declare function attachCaptureSubscriber(bus: SessionEventBus, runner: CaptureRunner, opts?: CaptureSubscriberOptions): CaptureSubscription;
//# sourceMappingURL=subscriber.d.ts.map