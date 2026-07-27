/**
 * `task-summary` — builds the compact "what the agent tried to do" blurb
 * that the R_human scorer feeds to the LLM.
 *
 * V7 §0.6 scoring anchor: when a single episode spans multiple user
 * turns (the `merge_follow_ups` mode, default), the scorer needs both
 * a stable mission anchor and the chronological turn chain. The mission
 * tells `goal_achievement` what task is being graded; the turn chain
 * tells process/user-satisfaction scoring whether later turns were
 * corrections, verifier output, reflections, or a genuine task reset.
 *
 * So we emit EPISODE_MISSION plus a chronological USER_ASKS /
 * AGENT_REPLIES block covering every user turn paired with the agent's
 * corresponding reply (plus a per-step action summary for tool-call
 * context). See `core/llm/prompts/reward.ts` for the matching rubric.
 *
 * The result is clipped to `cfg.summaryMaxChars` with a head+tail
 * strategy — identical to `capture/normalizer.ts` — so the most recent
 * user↔agent exchange survives truncation (we keep the tail because
 * "did it end well?" matters most).
 */
import type { TraceRow } from "../types.js";
import type { EpisodeSnapshot } from "../session/types.js";
import type { RewardConfig, TaskSummary } from "./types.js";
export interface SummaryInput {
    episode: EpisodeSnapshot;
    traces: readonly TraceRow[];
    cfg: Pick<RewardConfig, "summaryMaxChars">;
    evaluator?: {
        reflectionProvider?: string;
        reflectionModel?: string;
        scorerProvider?: string;
        scorerModel?: string;
    };
}
export declare function buildTaskSummary(input: SummaryInput): TaskSummary;
//# sourceMappingURL=task-summary.d.ts.map