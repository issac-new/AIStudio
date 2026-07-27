import type { Logger } from "../logger/types.js";
import type { LlmClient } from "../llm/index.js";
import type { EpisodeId, FeedbackRow, PolicyId, TraceRow } from "../types.js";
import type { Repos } from "../storage/repos/index.js";
export interface RunL2FailureInput {
    episodeId: EpisodeId;
    sessionId: TraceRow["sessionId"];
    traces: readonly TraceRow[];
    /** When omitted, loaded from `feedback.getForEpisode` in `runL2Failure`. */
    feedbacks?: readonly FeedbackRow[];
}
export interface RunL2FailureDeps {
    repos: Pick<Repos, "policies" | "feedback">;
    llm: LlmClient | null;
    log: Logger;
    now?: () => number;
}
export interface RunL2FailureResult {
    created: boolean;
    policyId?: PolicyId;
    skippedReason?: string;
}
export declare function runL2Failure(input: RunL2FailureInput, deps: RunL2FailureDeps): Promise<RunL2FailureResult>;
//# sourceMappingURL=failure-builder.d.ts.map