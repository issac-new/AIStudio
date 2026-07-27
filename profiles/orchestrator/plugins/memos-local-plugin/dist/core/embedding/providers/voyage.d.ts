/**
 * Voyage AI embeddings.
 *
 * Endpoint: https://api.voyageai.com/v1/embeddings
 * Default model: voyage-3 (1024-dim)
 * Query / document toggle via `input_type`.
 */
import type { EmbedRole, EmbeddingProvider, EmbeddingProviderName, ProviderCallCtx } from "../types.js";
export declare class VoyageEmbeddingProvider implements EmbeddingProvider {
    readonly name: EmbeddingProviderName;
    embed(texts: string[], role: EmbedRole, ctx: ProviderCallCtx): Promise<number[][]>;
}
//# sourceMappingURL=voyage.d.ts.map