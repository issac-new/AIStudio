import type { EpisodeId, FeedbackRow, PolicyId, RuntimeNamespace, TraceId, TraceRow } from "../types.js";
import type { Embedder } from "../embedding/types.js";
import type { LlmClient } from "../llm/index.js";
import type { Logger } from "../logger/types.js";
import type { Repos } from "../storage/repos/index.js";
export interface FeedbackExperienceResult {
    created: boolean;
    policyId?: PolicyId;
    skippedReason?: string;
}
export interface FeedbackExperienceDeps {
    repos: Pick<Repos, "policies" | "embeddingRetryQueue" | "traces">;
    embedder: Embedder | null;
    llm?: LlmClient;
    namespace: RuntimeNamespace;
    now?: () => number;
    log?: Pick<Logger, "info" | "warn">;
}
export interface FeedbackExperienceInput {
    feedback: FeedbackRow;
    episode?: {
        id: EpisodeId;
        traceIds?: readonly TraceId[];
        rTask?: number | null;
    } | null;
    trace?: TraceRow | null;
}
export declare function runFeedbackExperience(input: FeedbackExperienceInput, deps: FeedbackExperienceDeps): Promise<FeedbackExperienceResult>;
export declare function feedbackText(feedback: FeedbackRow): string;
export type ObjectiveOutcome = "pass" | "fail" | "unknown";
/**
 * Authoritative success/failure from the verifier payload, falling back to the
 * episode reward. Strict scenarios (coding/math/verifier) treat ONLY a full pass
 * as positive: a partial pass (passed < total) or reward below full credit is a
 * failure, never a positive exemplar.
 *
 * Pass `rTask = null` for a *verifier-only* verdict: with no reward fallback it
 * returns "unknown" when the payload carries no verifier signal. Used by strict
 * repair-candidate trial resolution, which must never pass on a loose reward.
 */
export declare function objectiveOutcome(raw: unknown, rTask: number | null | undefined): ObjectiveOutcome;
//# sourceMappingURL=feedback-builder.d.ts.map