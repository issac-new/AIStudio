/**
 * Error-signature extractor — V7 §2.6 "structural match" input.
 *
 * Tier 2 retrieval (see `core/retrieval/tier2-trace.ts`) can do three
 * kinds of match against the current step: semantic (embedding cosine),
 * tag pre-filter, and **structural** — exact-substring match of the
 * error token that the agent just saw. V7 uses this for cases like
 * hitting `"pg_config executable not found"` again after a similar
 * failure days ago.
 *
 * This module:
 *   1. Extracts normalised error tokens from `ToolCallDTO` outputs +
 *      error codes + assistant text.
 *   2. Ranks them by specificity (more unusual tokens first).
 *   3. Returns at most `MAX_SIGNATURES` tokens so the hot-path query
 *      stays bounded.
 *
 * We intentionally do NOT use the LLM here — this runs on every trace
 * write and must be cheap + deterministic.
 */
import type { ToolCallDTO } from "../../agent-contract/dto.js";
/** Max signatures we keep per trace. Anything beyond is dropped. */
export declare const MAX_SIGNATURES = 4;
export interface ExtractInput {
    toolCalls: readonly ToolCallDTO[];
    /** Free-form assistant reply for the turn (reflection may live here). */
    agentText?: string;
    /** Reflection text, when the adapter surfaced one. */
    reflection?: string;
}
/**
 * Produce up to {@link MAX_SIGNATURES} normalised error fragments,
 * ordered by specificity (more "unusual" first).
 */
export declare function extractErrorSignatures(input: ExtractInput): string[];
//# sourceMappingURL=error-signature.d.ts.map