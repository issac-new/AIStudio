/**
 * Google Gemini embeddings via REST (`batchEmbedContents`).
 *
 * Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/<model>:batchEmbedContents?key=<KEY>`
 * Defaults: `text-embedding-004` (768-dim).
 */
import type { EmbedRole, EmbeddingProvider, EmbeddingProviderName, ProviderCallCtx } from "../types.js";
export declare class GeminiEmbeddingProvider implements EmbeddingProvider {
    readonly name: EmbeddingProviderName;
    embed(texts: string[], role: EmbedRole, ctx: ProviderCallCtx): Promise<number[][]>;
}
//# sourceMappingURL=gemini.d.ts.map