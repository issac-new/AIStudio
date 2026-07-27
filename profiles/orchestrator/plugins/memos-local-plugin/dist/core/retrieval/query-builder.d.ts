/**
 * Convert a `RetrievalCtx` into a single embedding-friendly query string +
 * a set of coarse domain tags to pre-filter Tier-2 with.
 *
 * Keeping this logic in one place means the 5 entry points in `retrieve.ts`
 * don't each reinvent "what do we embed?" — they all call `buildQuery(ctx)`.
 *
 * Not perf-sensitive: inputs are short (≤ a few KB) and we do plain regex
 * scans, no LLM calls.
 */
import type { RetrievalCtx } from "./types.js";
export interface CompiledQuery {
    /** Primary text that will be embedded. */
    text: string;
    /** Extracted coarse tags (lowercase, sorted, deduped). */
    tags: string[];
    /**
     * V7 §2.6 structural fragments — verbatim error snippets to feed the
     * Tier 2 structural-match path. Same shape / normalisation rules as
     * the capture-side extractor (`core/capture/error-signature.ts`) so
     * `instr()` hits align.
     */
    structuralFragments: string[];
    /**
     * FTS5 MATCH expression for the keyword channel (trigram tokenizer).
     * `null` means "no usable token, skip the FTS channel".
     */
    ftsMatch: string | null;
    /**
     * Pattern-channel terms — short ASCII tokens (length 2) and CJK
     * bigrams that fall below the trigram window. Each term feeds a
     * `LIKE %term%` clause in `searchByPattern`. Empty array = skip.
     */
    patternTerms: string[];
    /** Did we truncate the text? Useful for logs. */
    truncated: boolean;
}
export interface RetrievalQueryExtract {
    queryVecText: string;
    keywords: string[];
}
export interface QueryBuildOpts {
    domain?: string;
}
/**
 * Build a `CompiledQuery` from a retrieval context. Behavior varies per
 * reason so that e.g. `decision_repair` biases toward the failing tool name.
 */
export declare function buildQuery(ctx: RetrievalCtx, opts?: QueryBuildOpts): CompiledQuery;
export declare function buildQueryWithExtract(ctx: RetrievalCtx, extract: RetrievalQueryExtract | null | undefined, opts?: QueryBuildOpts): CompiledQuery;
export declare function rawQueryText(ctx: RetrievalCtx, opts?: QueryBuildOpts): string;
/** Extract the coarse domain tags *without* embedding — cheaper for logs. */
export declare function extractTags(text: string): string[];
export declare function fallbackRetrievalExtract(raw: string): RetrievalQueryExtract;
export declare function isSoftwareRepairPrompt(text: string | undefined): boolean;
export declare function extractRepairTaskSection(text: string, heading: string): string;
//# sourceMappingURL=query-builder.d.ts.map