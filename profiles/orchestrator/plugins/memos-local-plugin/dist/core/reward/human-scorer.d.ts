/**
 * `human-scorer` — V7 §0.6 / §2.4.2 R_human pipeline.
 *
 * Takes a task summary + user feedback list and produces a signed scalar
 * R_human ∈ [-1, 1] plus per-axis sub-scores.
 *
 * Two scoring modes:
 *
 *   1. LLM mode (default): call `REWARD_R_HUMAN_PROMPT` with the summary
 *      and the user's raw text, parse `{goal_achievement, process_quality,
 *      user_satisfaction, label, reason}`, clamp each axis, and compute
 *      R_human as a weighted mean.
 *
 *   2. Heuristic fallback: map explicit-channel polarity directly to a
 *      fixed sub-score, or derive a very conservative score from implicit
 *      polarity + magnitude. Used when `cfg.llmScoring=false`, no LLM is
 *      wired, or the LLM throws.
 *
 * Weighted mean (V7 §0.6): we default to
 *     R_human = 0.45·goal_achievement
 *             + 0.30·process_quality
 *             + 0.25·user_satisfaction
 *
 * and clamp to [-1, 1]. The weights are documented in the viewer's reward
 * panel; changing them is a backwards-incompatible rubric change, so bump
 * the prompt `version` if you adjust.
 */
import type { LlmClient } from "../llm/index.js";
import type { HumanScore, HumanScoreInput, RewardConfig, UserFeedback } from "./types.js";
export interface ScoreOpts {
    /** If omitted, we force heuristic mode. */
    llm?: LlmClient | null;
    cfg: Pick<RewardConfig, "llmScoring">;
}
export declare function scoreHuman(input: HumanScoreInput, opts: ScoreOpts): Promise<HumanScore>;
export declare function heuristicScore(feedback: readonly UserFeedback[]): HumanScore;
//# sourceMappingURL=human-scorer.d.ts.map