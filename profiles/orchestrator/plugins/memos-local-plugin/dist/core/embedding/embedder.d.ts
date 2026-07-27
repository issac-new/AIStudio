/**
 * The `Embedder` facade. Only module outside `core/embedding/` should care
 * about providers existing at all.
 *
 * Responsibilities:
 *   - Pick the right provider from config.
 *   - Cache by (provider|model|role|text) sha256 hex.
 *   - Batch by `batchSize`, collapse duplicates, preserve input order.
 *   - L2-normalize + dim-enforce (see `normalize.ts`).
 *   - Track stats usable by `stats()` and by `embedding.cache` logs.
 *
 * We intentionally do NOT auto-fallback to `local` when a cloud provider
 * fails — the caller can implement that higher up if it wants to. Keeping
 * this layer strict makes failure modes easy to reason about in tests.
 */
import type { Embedder, EmbeddingConfig, EmbeddingProvider, EmbeddingProviderName } from "./types.js";
/**
 * Factory. Allows DI of a fake provider for tests — see
 * `createEmbedderWithProvider`.
 */
export declare function createEmbedder(config: EmbeddingConfig): Embedder;
export declare function createEmbedderWithProvider(config: EmbeddingConfig, provider: EmbeddingProvider): Embedder;
export declare function makeProviderFor(name: EmbeddingProviderName): EmbeddingProvider;
//# sourceMappingURL=embedder.d.ts.map