/**
 * `IntentClassifier`.
 *
 * Decision flow:
 *   1. Empty / whitespace-only                → `chitchat` (zero-cost).
 *   2. Heuristic rule fires with conf ≥ 0.85 → use it.
 *   3. Heuristic rule fires with lower conf  → keep as fallback, try LLM.
 *   4. No rule fires                          → try LLM.
 *   5. LLM unavailable / fails                → use heuristic fallback
 *                                              or `unknown` (full retrieval).
 *
 * The classifier is pure-ish: it only depends on an injected LlmClient, so
 * tests can stub it. When `kind=meta`, retrieval is skipped regardless.
 */
import type { EpisodeId } from "../../agent-contract/dto.js";
import type { LlmClient } from "../llm/index.js";
import type { IntentDecision, IntentKind } from "./types.js";
export interface IntentClassifierOptions {
    /** Optional LLM client. When absent, we only use heuristics. */
    llm?: LlmClient;
    /** Budget per classification. Default 6000 ms. */
    timeoutMs?: number;
    /** When true, skip LLM entirely (e.g. provider=local_only). Default derived from llm presence. */
    disableLlm?: boolean;
}
/**
 * Optional context the caller can supply to `classify` so the LLM
 * audit trail (`system_model_status` rows) can be correlated back to
 * a specific episode in the Logs viewer.
 *
 * Callers that have already minted the target episode id (the standard
 * `sessionManager.startEpisode` flow does this — it pre-allocates the
 * id before calling the classifier so the classifier's LLM call carries
 * it) should pass it here. Anything else can omit it, in which case
 * the resulting log row will be a stand-alone entry — same as today.
 */
export interface IntentClassifyOptions {
    /** Episode id this classification is being run for, when known. */
    episodeId?: EpisodeId;
}
export interface IntentClassifier {
    classify(firstUserMessage: string, options?: IntentClassifyOptions): Promise<IntentDecision>;
}
export declare function createIntentClassifier(opts?: IntentClassifierOptions): IntentClassifier;
/** Expose rule metadata for the frontend / audit. */
export declare function listHeuristicRules(): ReadonlyArray<{
    id: string;
    kind: IntentKind;
    label: string;
}>;
//# sourceMappingURL=intent-classifier.d.ts.map