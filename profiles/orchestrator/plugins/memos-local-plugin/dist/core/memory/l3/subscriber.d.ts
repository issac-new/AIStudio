/**
 * `attachL3Subscriber` — bridge between the L2 pipeline and the L3
 * orchestrator.
 *
 * L3 abstraction is expensive (a single LLM call per cluster) and
 * strictly cross-task, so we deliberately *do not* run it on every
 * `reward.updated` or `l2.policy.updated`. We only react to:
 *
 *   - **`l2.policy.induced`** — a brand-new L2 policy just landed.
 *     That's the signal that the set of compatible policies changed,
 *     so a new or updated WM might be in order. We debounce by
 *     domain tag via the `algorithm.l3Abstraction.cooldownDays` key
 *     (handled inside `runL3`).
 *
 * Additional entry points:
 *   - **`runOnce({ trigger: 'manual' | 'rebuild' })`** — used by the
 *     viewer ("rebuild world models") and tests.
 *   - **`adjustFeedback({ worldModelId, polarity })`** — bumps a WM's
 *     confidence up or down based on human feedback. Not wired to any
 *     event bus here; callers invoke it directly from the feedback API.
 */
import type { LlmClient } from "../../llm/index.js";
import type { Logger } from "../../logger/types.js";
import type { Repos } from "../../storage/repos/index.js";
import type { WorldModelId } from "../../types.js";
import type { L2EventBus } from "../l2/types.js";
import type { L3Config, L3EventBus, L3ProcessInput, L3ProcessResult } from "./types.js";
export interface L3SubscriberDeps {
    repos: Pick<Repos, "embeddingRetryQueue" | "policies" | "traces" | "worldModel" | "kv">;
    l2Bus: L2EventBus;
    l3Bus: L3EventBus;
    llm: LlmClient | null;
    log: Logger;
    config: L3Config;
}
export interface L3SubscriberHandle {
    detach(): void;
    /** Wait for an in-flight L3 abstraction run to finish. */
    drain(): Promise<void>;
    runOnce(opts?: Partial<Pick<L3ProcessInput, "trigger" | "domainTagsFilter" | "sessionId" | "episodeId">>): Promise<L3ProcessResult>;
    adjustFeedback(worldModelId: WorldModelId, polarity: "positive" | "negative"): Promise<{
        previous: number;
        next: number;
    } | null>;
}
export declare function attachL3Subscriber(deps: L3SubscriberDeps): L3SubscriberHandle;
//# sourceMappingURL=subscriber.d.ts.map