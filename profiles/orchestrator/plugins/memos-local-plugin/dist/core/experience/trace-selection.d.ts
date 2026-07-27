import type { TraceRow } from "../types.js";
export interface FeedbackTraceSelectionEntry {
    trace: TraceRow;
    idx: number;
    text: string;
    value: number;
}
export interface FeedbackTraceCompression {
    kept: FeedbackTraceSelectionEntry[];
    droppedCount: number;
}
export declare function compressFeedbackEpisodeTraces(traces: readonly TraceRow[], feedbackText: string, maxChars: number): FeedbackTraceCompression;
export declare function selectRepresentativeFeedbackTraces(traces: readonly TraceRow[], feedbackText: string, limit: number): TraceRow[];
export declare function formatFeedbackTraceTurn(turnNumber: number, trace: TraceRow): string;
//# sourceMappingURL=trace-selection.d.ts.map