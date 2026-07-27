/**
 * `capture/embedder` — a thin wrapper that decides what text to embed for
 * each trace and calls the `Embedder` facade in one batch call.
 *
 * Why a wrapper?
 *   - We want TWO vectors per row (vec_summary / vec_action). The embedder
 *     takes a flat list; here we interleave step-pairs in an order the
 *     caller can decode.
 *   - Embedding failure MUST NOT block the capture write — we log and
 *     insert `null` vectors. Vector search will just skip them.
 */
import type { Embedder } from "../embedding/index.js";
import type { EmbeddingVector } from "../types.js";
import type { NormalizedStep } from "./types.js";
export interface VecPair {
    summary: EmbeddingVector | null;
    action: EmbeddingVector | null;
}
export declare function embedSteps(embedder: Embedder, steps: readonly NormalizedStep[], 
/**
 * Optional per-step summaries to embed for `vec_summary`. When
 * omitted we fall back to `summaryText(step)` — the raw user text —
 * which preserves the pre-5.x behaviour. Callers that have already
 * produced an LLM summary (see `core/capture/summarizer.ts`) should
 * pass it here so retrieval matches against the same compact form
 * the viewer displays.
 */
summaryOverrides?: readonly string[], opts?: {
    summaryOnly?: boolean;
}): Promise<VecPair[]>;
//# sourceMappingURL=embedder.d.ts.map