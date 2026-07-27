/**
 * `attachL2Subscriber` — bridge between the reward pipeline and the L2
 * orchestrator.
 *
 * On every `reward.updated` event:
 *   1. Reload the episode's traces (reward.updated only tells us the ids;
 *      we need full rows with fresh V values).
 *   2. Call `runL2` with the pre-wired deps.
 *   3. Surface errors as `l2.failed` on the L2 bus; never throw upstream.
 *
 * Keeping this as an explicit subscriber (rather than shoving it inside the
 * reward runner) means L2 failures never roll back reward writes and we can
 * unit-test the whole pipeline by emitting a fake `reward.updated` event.
 */
import type { LlmClient } from "../../llm/index.js";
import type { Logger } from "../../logger/types.js";
import type { EpisodeId } from "../../types.js";
import type { Repos } from "../../storage/repos/index.js";
import type { RewardEventBus } from "../../reward/index.js";
import type { StorageDb } from "../../storage/types.js";
import type { L2Config, L2EventBus } from "./types.js";
export interface L2SubscriberDeps {
    db: StorageDb;
    repos: Pick<Repos, "candidatePool" | "embeddingRetryQueue" | "episodePolicyInjections" | "episodes" | "feedback" | "policies" | "tracePolicyLinks" | "traces">;
    rewardBus: RewardEventBus;
    l2Bus: L2EventBus;
    llm: LlmClient | null;
    log: Logger;
    config: L2Config;
    now?: () => number;
    thresholds: {
        minSupport: number;
        minGain: number;
        archiveGain: number;
    };
}
export interface L2SubscriberHandle {
    detach(): void;
    /** Force-run L2 for a given episode id (used by tests and the viewer). */
    runOnce(episodeId: EpisodeId, opts?: {
        trigger?: "manual" | "rebuild";
    }): Promise<void>;
    /**
     * Wait for every in-flight L2 run to complete. Called from the
     * pipeline's `flush()` so that adapters whose process exits right
     * after `episode.close` (e.g. Hermes' single-shot `chat -q`) don't
     * lose the induction step. Without this, `runL2` (which may take
     * 5–10s for the LLM `l2.induction` call) gets reaped mid-flight,
     * leaving the candidate pool full but no policies ever induced.
     */
    drain(): Promise<void>;
}
export declare function attachL2Subscriber(deps: L2SubscriberDeps): L2SubscriberHandle;
//# sourceMappingURL=subscriber.d.ts.map