/**
 * Dependency-graph wiring for `core/pipeline`.
 *
 * The pipeline owns the long-lived objects every algorithm subscriber
 * needs (runners, buses, subscribers). Wiring is deterministic and
 * synchronous so adapters can reason about lifecycle without chasing
 * microtasks — with one exception: `init()` is async because it warms
 * the embedder/LLM bridges.
 */
import type { Logger } from "../logger/types.js";
import { createSessionEventBus } from "../session/index.js";
import type { EpisodeManager, IntentClassifier, RelationClassifier, SessionEventBus, SessionManager } from "../session/index.js";
import type { CaptureEventBus, CaptureRunner, CaptureSubscription } from "../capture/index.js";
import type { RewardEventBus, RewardRunner, RewardSubscription } from "../reward/index.js";
import type { L2EventBus, L2SubscriberHandle } from "../memory/l2/index.js";
import type { L3EventBus, L3SubscriberHandle } from "../memory/l3/index.js";
import type { SkillEventBus, SkillSubscriberHandle } from "../skill/index.js";
import type { FeedbackEventBus, FeedbackSubscriberHandle } from "../feedback/index.js";
import { createRetrievalEventBus } from "../retrieval/index.js";
import type { RetrievalDeps, RetrievalEventBus } from "../retrieval/index.js";
import type { PipelineAlgorithmConfig, PipelineBuses, PipelineDeps, PipelineSubscriptions } from "./types.js";
/**
 * Translate the validated `ResolvedConfig.algorithm` block (shaped by
 * the TypeBox schema) into the typed configs consumed by each subscriber.
 *
 * Some fields are shared across subscribers (γ / τ / decay half-life) and
 * live on the reward block in `config.yaml`. We copy them into the
 * downstream slices here so subscribers never peek into other blocks.
 */
export declare function extractAlgorithmConfig(deps: PipelineDeps): PipelineAlgorithmConfig;
export declare function buildPipelineBuses(): PipelineBuses;
export interface PipelineSubscriberSet {
    captureRunner: CaptureRunner;
    rewardRunner: RewardRunner;
    l2: L2SubscriberHandle;
    l3: L3SubscriberHandle;
    skills: SkillSubscriberHandle;
    feedback: FeedbackSubscriberHandle;
    subscriptions: PipelineSubscriptions;
}
export declare function buildPipelineSubscribers(deps: PipelineDeps, buses: PipelineBuses, algorithm: PipelineAlgorithmConfig, session?: PipelineSessionSet): PipelineSubscriberSet;
export interface PipelineSessionSet {
    intent: IntentClassifier;
    relation: RelationClassifier;
    sessionManager: SessionManager;
    episodeManager: EpisodeManager;
}
export declare function buildPipelineSession(deps: PipelineDeps, bus: SessionEventBus): PipelineSessionSet;
export declare function buildRetrievalDeps(deps: PipelineDeps, algorithm: PipelineAlgorithmConfig): RetrievalDeps;
export declare function pipelineLogger(deps: PipelineDeps): Logger;
/** Called by tests that need to assert on the wiring. */
export { createRetrievalEventBus, createSessionEventBus };
export type { CaptureEventBus, CaptureRunner, CaptureSubscription, FeedbackEventBus, FeedbackSubscriberHandle, L2EventBus, L2SubscriberHandle, L3EventBus, L3SubscriberHandle, RetrievalEventBus, RewardEventBus, RewardRunner, RewardSubscription, SessionEventBus, SkillEventBus, SkillSubscriberHandle, };
//# sourceMappingURL=deps.d.ts.map