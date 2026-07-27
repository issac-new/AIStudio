/**
 * LLM-assisted feedback classifier.
 *
 * Detects implicit user feedback that rule-based patterns miss:
 *   - "应该用递归实现" (implicit: current approach is wrong)
 *   - "能不能改成异步的" (implicit: sync version is inadequate)
 *   - "这样性能不好" (implicit: needs optimization)
 *
 * Decision flow:
 *   1. Rule-based fast path (strong markers) → immediate feedback
 *   2. LLM deep analysis (when available) → detect implicit feedback
 *   3. Fallback to rule-based classification
 *
 * The LLM call is optional and degrades gracefully when unavailable.
 */
import type { EpisodeId } from "../../agent-contract/dto.js";
import type { LlmClient } from "../llm/index.js";
export interface FeedbackClassification {
    /** Whether this turn contains actionable user feedback. */
    isFeedback: boolean;
    /** Feedback polarity: positive, negative, neutral, or mixed. */
    polarity: "positive" | "negative" | "neutral" | "mixed";
    /** Feedback strength (0-1). */
    magnitude: number;
    /** Confidence in this classification (0-1). */
    confidence: number;
    /** Human-readable rationale extracted from user text. */
    rationale: string;
    /** Classification method: "rule" or "llm". */
    method: "rule" | "llm";
}
export interface FeedbackClassifierOptions {
    llm?: LlmClient;
    timeoutMs?: number;
    disableLlm?: boolean;
}
export interface ClassifyTurnInput {
    userText: string;
    agentText: string;
    episodeId?: EpisodeId;
}
export interface FeedbackClassifier {
    classifyTurn(input: ClassifyTurnInput): Promise<FeedbackClassification>;
}
/**
 * Create a feedback classifier that uses both rules and LLM.
 */
export declare function createFeedbackClassifier(opts?: FeedbackClassifierOptions): FeedbackClassifier;
//# sourceMappingURL=llm-classifier.d.ts.map