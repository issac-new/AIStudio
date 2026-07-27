/**
 * Capture-side trace summarizer — produces the short, viewer-friendly
 * summary string that ends up in `traces.summary` and (downstream) in
 * the Memories panel / retrieval snippets.
 *
 * Design mirrors `memos-local-openclaw`'s `Summarizer`:
 *
 *   - Ask the configured LLM for a single-sentence distillation.
 *   - If the LLM is unavailable, times out, or returns malformed JSON,
 *     fall back to a deterministic heuristic so capture never blocks.
 *
 * The summary is what downstream retrieval embeds (see
 * `core/capture/embedder.ts::summaryText`) and what the Memories
 * viewer shows as the primary row text. Keeping it short (≤ 140
 * chars) keeps the viewer skim-able and the prompt-injection block
 * small.
 */
import type { LlmClient } from "../llm/index.js";
import type { Logger } from "../logger/types.js";
import type { NormalizedStep } from "./types.js";
export interface SummarizerOptions {
    llm: LlmClient | null;
    log?: Logger;
    timeoutMs?: number;
}
export interface Summarizer {
    summarize(step: NormalizedStep, context?: SummarizerContext): Promise<string>;
}
export interface SummarizerContext {
    episodeId?: string;
    phase?: string;
}
/**
 * Build a summarizer bound to the provided LLM client. When `llm` is
 * null the returned summarizer uses the heuristic path only — capture
 * still works, just with a more verbose summary.
 */
export declare function createSummarizer(opts: SummarizerOptions): Summarizer;
//# sourceMappingURL=summarizer.d.ts.map