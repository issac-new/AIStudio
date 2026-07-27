import type { EpisodeId, FeedbackId, FeedbackRow, TraceId, TraceRow } from "../types.js";
export type CorrectiveSignalKind = "human_feedback" | "verifier_directives";
export type CorrectiveTiming = "at_turn_end" | "after_turn" | "before_first_turn" | "after_last_turn" | "between_turns" | "unanchored";
export interface EpisodeTurnTimeline {
    turn_index: number;
    turn_id: number;
    trace_ids: TraceId[];
    started_at: number;
    ended_at: number;
    user_preview: string;
}
export interface CorrectiveSignalEntry {
    feedback_id: FeedbackId;
    submitted_at: number;
    channel: FeedbackRow["channel"];
    polarity: FeedbackRow["polarity"];
    kind: CorrectiveSignalKind;
    text: string;
    trace_id: TraceId | null;
    turn_index: number | null;
    timing: CorrectiveTiming;
    /** Human-readable anchor for the LLM (includes turn index and deltas). */
    timing_label: string;
    delta_ms_after_turn_end: number | null;
    delta_ms_after_episode_start: number;
    nearest_trace_id: TraceId | null;
    nearest_trace_ts: number | null;
}
export interface CorrectiveSignalsPayload {
    episode_timeline: {
        episode_id: EpisodeId;
        trace_span: {
            first_ts: number;
            last_ts: number;
        };
        turns: EpisodeTurnTimeline[];
    };
    corrective_signals: CorrectiveSignalEntry[];
}
export declare function buildCorrectiveSignalsForSink(episodeId: EpisodeId, traces: readonly TraceRow[], feedbacks: readonly FeedbackRow[]): CorrectiveSignalsPayload;
export declare function isSubstantiveFeedback(feedback: FeedbackRow): boolean;
//# sourceMappingURL=corrective-signals.d.ts.map