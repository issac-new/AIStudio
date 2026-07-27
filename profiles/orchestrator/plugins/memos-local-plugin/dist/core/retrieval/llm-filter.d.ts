/**
 * LLM-based relevance filter — post-processing step after `rank()`.
 *
 * Motivation (ported from legacy `memos-local-openclaw::unifiedLLMFilter`):
 * mechanical retrieval is greedy — any Python prompt pulls back every
 * Python-tagged trace even when the sub-problem doesn't match. A small
 * LLM call ("given this query, pick the truly relevant candidates")
 * removes most of the noise with a single round-trip.
 *
 * Design constraints:
 *   - One LLM call per turn, bounded output (index list + `sufficient`).
 *   - When the LLM returns an empty selection, we inject nothing — no
 *     mechanical top-1 / safe-cutoff fallback.
 *   - When filter is disabled or no LLM client is configured, a small
 *     mechanical cap still applies so offline installs stay usable.
 *   - Returns both kept and dropped candidates so callers can log
 *     exactly what the LLM pruned (feeds the Logs page).
 */
import type { LlmClient } from "../llm/index.js";
import type { Logger } from "../logger/types.js";
import type { RankedCandidate } from "./ranker.js";
import type { RetrievalConfig } from "./types.js";
export interface FilterInput {
    query: string;
    ranked: readonly RankedCandidate[];
    episodeId?: string;
}
export interface FilterDeps {
    llm: LlmClient | null;
    log: Logger;
    timeoutMs?: number;
    config: Pick<RetrievalConfig, "llmFilterEnabled" | "llmFilterMaxKeep" | "llmFilterFallbackMaxKeep" | "llmFilterMinCandidates" | "llmFilterCandidateBodyChars">;
}
export interface FilterResult {
    kept: RankedCandidate[];
    dropped: RankedCandidate[];
    outcome: "disabled" | "no_llm" | "below_threshold" | "empty_query" | "deferred_to_final" | "llm_kept_all" | "llm_filtered" | "llm_rejected_all" | "llm_filter_error";
    sufficient: boolean | null;
}
export declare function llmFilterCandidates(input: FilterInput, deps: FilterDeps): Promise<FilterResult>;
//# sourceMappingURL=llm-filter.d.ts.map