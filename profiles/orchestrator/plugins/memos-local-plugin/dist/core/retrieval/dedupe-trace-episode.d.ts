/**
 * Post-rank dedupe: avoid injecting both trace(s) and an episode rollup for
 * the same `episodeId`.
 *
 * `rollupEpisodes` builds episode summaries from the same trace pool that
 * also enters ranking as individual traces, so MMR can keep both. After
 * LLM filter, choose either the trace side or the episode side for each
 * episode. Multiple trace hits from the same episode are still distinct
 * concrete turns and are preserved unless an episode rollup wins the group.
 */
import type { RankedCandidate } from "./ranker.js";
export interface DedupeTraceEpisodeResult {
    ranked: RankedCandidate[];
    dedupedByEpisodeCount: number;
}
export declare function dedupeTraceEpisodeByEpisodeId(ranked: readonly RankedCandidate[]): DedupeTraceEpisodeResult;
//# sourceMappingURL=dedupe-trace-episode.d.ts.map