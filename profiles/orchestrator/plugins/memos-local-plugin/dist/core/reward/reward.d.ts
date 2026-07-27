/**
 * `reward.ts` — pipeline orchestrator for Phase 7.
 *
 * Lifecycle:
 *   1. Caller invokes `runner.run({episodeId, feedback, trigger})`.
 *   2. We load the episode + its traces from storage.
 *   3. Build the task summary (`task-summary.ts`).
 *   4. Score R_human (`human-scorer.ts` — LLM or heuristic).
 *   5. Backprop V_t + priority (`backprop.ts`).
 *   6. Persist: tracesRepo.updateScore(...) and episodesRepo.setRTask(...).
 *   7. Emit `reward.updated` so downstream (L2 incremental induction, skill
 *      crystallizer, viewer) can react.
 *
 * The runner never throws on recoverable failures — LLM errors fall back
 * to heuristic scoring, persist errors are reported in `warnings` but
 * don't crash the agent.  A total DB failure does throw; the caller
 * (subscriber) logs and moves on.
 */
import type { LlmClient } from "../llm/index.js";
import type { EpisodeId } from "../types.js";
import type { makeEpisodesRepo } from "../storage/repos/episodes.js";
import type { makeFeedbackRepo } from "../storage/repos/feedback.js";
import type { makeTracesRepo } from "../storage/repos/traces.js";
import { type OutcomeThresholds } from "../episode/outcome.js";
import type { RewardConfig, RewardEventBus, RewardInput, RewardResult } from "./types.js";
type TracesRepo = ReturnType<typeof makeTracesRepo>;
type EpisodesRepo = ReturnType<typeof makeEpisodesRepo>;
type FeedbackRepo = ReturnType<typeof makeFeedbackRepo>;
export interface RewardDeps {
    tracesRepo: TracesRepo;
    episodesRepo: EpisodesRepo;
    feedbackRepo: FeedbackRepo;
    llm: LlmClient | null;
    bus: RewardEventBus;
    cfg: RewardConfig;
    /** Episode outcome thresholds (from `algorithm.skill`). */
    outcomeThresholds?: OutcomeThresholds;
    evaluator?: {
        reflectionProvider?: string;
        reflectionModel?: string;
        scorerProvider?: string;
        scorerModel?: string;
    };
    now?: () => number;
    /**
     * Optional accessor for the episode snapshot (turns + meta). If omitted,
     * we fall back to the episodes repo's `getById`, which returns a header
     * row without turns — fine for summary building since we also have the
     * trace list. When the orchestrator (Phase 15) has a fresher snapshot in
     * memory, it can inject one here.
     */
    getEpisodeSnapshot?: (id: EpisodeId) => import("../session/types.js").EpisodeSnapshot | null;
}
export interface RewardRunner {
    run(input: RewardInput): Promise<RewardResult>;
}
export declare function createRewardRunner(deps: RewardDeps): RewardRunner;
export {};
//# sourceMappingURL=reward.d.ts.map