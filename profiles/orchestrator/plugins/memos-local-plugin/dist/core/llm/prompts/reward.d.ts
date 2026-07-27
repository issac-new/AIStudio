import type { PromptDef } from "./index.js";
/**
 * V7 §0.6 / §2.4.2 — R_human scorer.
 *
 * Given a task summary and the user's feedback, grade the episode on three
 * axes and combine them into a signed scalar R_human ∈ [-1, 1]. Phase 7's
 * reflection-weighted backprop uses this value as the terminal V_T.
 *
 * Axes come straight from the V7 rubric table in §0.6:
 *   1. goal_achievement — did the agent complete EPISODE_MISSION?
 *   2. process_quality  — was the path reasonable and efficient?
 *   3. user_satisfaction — does the user's own text read as pleased, neutral, or angry?
 *
 * We ask for each axis in [-1, 1], then produce the combined reward at the
 * call site (so we can swap weighting without editing the prompt). Keeping
 * the axes explicit also helps the viewer explain "why R_human is low here."
 */
export declare const REWARD_R_HUMAN_PROMPT: PromptDef;
//# sourceMappingURL=reward.d.ts.map