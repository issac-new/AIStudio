/**
 * JSON-mode utilities.
 *
 * LLMs routinely answer "sure, here's your JSON:" followed by Markdown-fenced
 * code. We want a single function that takes raw text and hands back a
 * parsed object (or throws a specific `llm_output_malformed` error).
 *
 * Fallback-cascade:
 *   1. Straight `JSON.parse(raw.trim())`.
 *   2. Strip ```json … ``` fences and try again.
 *   3. Extract the first balanced `{ … }` / `[ … ]` block and try.
 *   4. Remove trailing commas before `}`/`]` and try.
 *   5. Give up, throw `LLM_OUTPUT_MALFORMED`.
 *
 * We avoid heroics (no partial repair beyond trailing commas) because
 * silently "fixing" broken JSON makes algorithm bugs invisible.
 */
import type { LlmProviderName } from "./types.js";
export interface ParseOpts {
    provider?: LlmProviderName;
    op?: string;
}
export declare function parseLlmJson<T = unknown>(raw: string, opts?: ParseOpts): T;
/**
 * Build the "you MUST respond with JSON" instruction that goes into the
 * system prompt for providers that don't have native JSON mode.
 */
export declare function buildJsonSystemHint(hint?: string): string;
//# sourceMappingURL=json-mode.d.ts.map