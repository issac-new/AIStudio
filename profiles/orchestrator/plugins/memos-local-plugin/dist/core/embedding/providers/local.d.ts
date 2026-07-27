/**
 * Local MiniLM embeddings via `@huggingface/transformers`.
 *
 * Model: by default `Xenova/all-MiniLM-L6-v2` — 384-dim, ~23 MB on first run,
 * quantized to int8 for CPU friendliness. The model loads lazily on the first
 * call and is shared across all embedders in the process.
 *
 * Output: `pipeline("feature-extraction")` already supports mean-pooling and
 * L2-normalize via `{ pooling: "mean", normalize: true }`. We intentionally
 * don't normalize again on top of that.
 */
import type { EmbedRole, EmbeddingProvider, EmbeddingProviderName, ProviderCallCtx } from "../types.js";
export declare class LocalEmbeddingProvider implements EmbeddingProvider {
    readonly name: EmbeddingProviderName;
    embed(texts: string[], _role: EmbedRole, ctx: ProviderCallCtx): Promise<number[][]>;
    close(): Promise<void>;
}
export declare function __resetLocalExtractorForTests(): void;
//# sourceMappingURL=local.d.ts.map