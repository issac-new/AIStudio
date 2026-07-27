/**
 * Wires the feedback module to its upstream signals.
 *
 * The feedback subscriber exposes **two** imperative channels that
 * adapters drive directly — there is no background event bus for
 * failure counting because the signals must be live inside the agent
 * step loop:
 *
 *   - `recordToolFailure` / `recordToolSuccess` — forwarded to the
 *     `failureSignals` tracker. When a burst is detected the subscriber
 *     schedules a `runRepair` on a microtask so adapters never block.
 *
 *   - `submitUserFeedback` — fires a repair run with the classified
 *     feedback. Also emits `feedback.classified` for downstream UI.
 *
 * The handle also exposes `runOnce` for manual triggers (viewer button)
 * and `dispose` for cleanup.
 */
import type { Logger } from "../logger/types.js";
import type { EpisodeId, SessionId } from "../types.js";
import { type FailureSignalsHandle } from "./signals.js";
import { type RepairDeps } from "./feedback.js";
import type { RepairInput, RepairResult } from "./types.js";
export interface FeedbackSubscriberDeps extends Omit<RepairDeps, "log"> {
    log?: Logger;
}
export interface RecordToolCallInput {
    toolId: string;
    context: string;
    step: number;
    reason?: string;
    sessionId?: SessionId;
    episodeId?: EpisodeId;
}
export interface SubmitUserFeedbackInput {
    text: string;
    sessionId: SessionId;
    episodeId?: EpisodeId;
    toolId?: string;
    context?: string;
}
export interface FeedbackSubscriberHandle {
    recordToolFailure(input: RecordToolCallInput): void;
    recordToolSuccess(input: Omit<RecordToolCallInput, "reason">): void;
    submitUserFeedback(input: SubmitUserFeedbackInput): Promise<RepairResult>;
    runOnce(input: RepairInput): Promise<RepairResult>;
    signals: FailureSignalsHandle;
    flush(): Promise<void>;
    dispose(): void;
}
export declare function attachFeedbackSubscriber(deps: FeedbackSubscriberDeps): FeedbackSubscriberHandle;
//# sourceMappingURL=subscriber.d.ts.map