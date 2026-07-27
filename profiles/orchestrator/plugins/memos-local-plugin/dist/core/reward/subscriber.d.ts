/**
 * `subscriber` — glue between `core/capture` and `core/reward`.
 *
 * Model:
 *   1. When `capture.done` fires for an episode with traces, register it in
 *      `pending` and schedule one reward run after `feedbackWindowSec` (≥1s).
 *   2. Explicit feedback is persisted via `memory-core.submitFeedback` (DB);
 *      the scheduled run passes `feedback: []` and `reward.run` merges from
 *      `feedbackRepo.getForEpisode`.
 *   3. When the window expires (or `drain()`), run once with
 *      `trigger="implicit_fallback"` (overridden in `reward.run` when DB has
 *      feedback rows).
 *   4. `submitFeedback` on this subscription is a no-op — do not score here.
 *
 * `pendingCount()` = scheduled-but-not-started episodes + in-flight runs.
 */
import type { CaptureEventBus } from "../capture/index.js";
import type { EpisodeId } from "../types.js";
import type { RewardRunner } from "./reward.js";
import type { RewardConfig, UserFeedback } from "./types.js";
export interface RewardSubscriberOptions {
    feedbackWindowSec?: number;
    /** Called when a background run fails. Receives the original error. */
    onError?: (err: unknown, episodeId: EpisodeId) => void;
}
export interface RewardSubscription {
    /**
     * Legacy hook — no-op. Episode scoring uses DB feedback at window end;
     * use `memory-core.submitFeedback` instead.
     */
    submitFeedback(feedback: UserFeedback): void;
    /** Manual trigger — run NOW, regardless of window. */
    runManually(episodeId: EpisodeId, trigger?: "manual" | "explicit_feedback"): Promise<void>;
    /** Detach from the capture bus. In-flight runs continue. */
    stop(): void;
    /** Flush all pending episodes and wait for in-flight runs. */
    drain(): Promise<void>;
    /** Scheduled episodes (timer not fired) plus in-flight reward runs. */
    pendingCount(): number;
}
export declare function attachRewardSubscriber(captureBus: CaptureEventBus, runner: RewardRunner, cfg: RewardConfig, opts?: RewardSubscriberOptions): RewardSubscription;
//# sourceMappingURL=subscriber.d.ts.map