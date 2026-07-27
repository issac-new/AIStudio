/**
 * Mistral AI embeddings.
 *
 * Endpoint: https://api.mistral.ai/v1/embeddings
 * Default model: mistral-embed (1024-dim).
 * Shape is OpenAI-compatible: `{ data: [{ embedding }] }`.
 */
import type { EmbedRole, EmbeddingProvider, EmbeddingProviderName, ProviderCallCtx } from "../types.js";
export declare class MistralEmbeddingProvider implements EmbeddingProvider {
    readonly name: EmbeddingProviderName;
    embed(texts: string[], _role: EmbedRole, ctx: ProviderCallCtx): Promise<number[][]>;
}
//# sourceMappingURL=mistral.d.ts.map