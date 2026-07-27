/**
 * `step-extractor` — the first stage of the capture pipeline.
 *
 * Converts an `EpisodeSnapshot` (from `core/session`) into a list of
 * `StepCandidate`s.
 *
 * V7 §0.1 granularity: one step ≈ one agent decision point:
 *   - A tool call (model thinking → tool input → tool output) is ONE step.
 *   - The final text response to the user is a SEPARATE step.
 *   - A pure assistant reply with no tool calls is ONE step (unchanged).
 *
 * For a turn where the agent called 5 tools then responded, the
 * extractor produces 6 sub-steps (5 tool + 1 response). Each tool
 * sub-step carries:
 *   - `userText`  = the original user message (shared context / state)
 *   - `agentText` = "" (the action is the tool call itself)
 *   - `toolCalls` = [single ToolCallDTO with input + output]
 *   - `agentThinking` = model thinking for the final response, when
 *     the host provides a turn-level reasoning blob. Tool-call reasoning
 *     lives on `toolCalls[].thinkingBefore`.
 *   - `meta.turnId` = the user turn's `ts`. Stable identifier shared
 *     by every sub-step that came from the same user message — the
 *     viewer uses it to collapse the row of sub-steps back into a
 *     single "one round = one memory" card while the algorithm pipe-
 *     line keeps operating on the step-level traces.
 *
 * This matches the algorithm spec `f(1)_{k,t} = (s, a, o, ρ, r)` where
 * each tool invocation is an independent action `a` with its own
 * observation `o`, reflection `ρ`, and value `r`.
 *
 * The extractor is purely in-memory — no DB, no LLM.
 */
import type { EpisodeSnapshot } from "../session/types.js";
import type { EpochMs } from "../types.js";
import type { StepCandidate } from "./types.js";
export interface ExtractStepsOptions {
    /** Episode-level stable turn key; overrides per-segment user-turn ts. */
    anchorTurnId?: EpochMs;
    /**
     * When true, tool sub-steps never carry `userText` (incremental lite
     * capture after the task prompt was already persisted).
     */
    omitSegmentUserText?: boolean;
}
export declare function extractSteps(episode: EpisodeSnapshot, options?: ExtractStepsOptions): StepCandidate[];
/**
 * Lite capture only processes turns added since the previous successful
 * `runLite`. The first pass uses the full episode; later passes extract from
 * new turns only and never re-attach the task prompt to tool rows.
 */
export declare function extractIncrementalSteps(episode: EpisodeSnapshot): StepCandidate[];
//# sourceMappingURL=step-extractor.d.ts.map