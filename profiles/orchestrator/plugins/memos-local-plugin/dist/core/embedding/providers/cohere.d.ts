/**
 * Cohere embed v1.
 *
 * Distinguishes document vs query via `input_type: "search_document" | "search_query"`.
 */
import type { EmbedRole, EmbeddingProvider, EmbeddingProviderName, ProviderCallCtx } from "../types.js";
export declare class CohereEmbeddingProvider implements EmbeddingProvider {
    readonly name: EmbeddingProviderName;
    embed(texts: string[], role: EmbedRole, ctx: ProviderCallCtx): Promise<number[][]>;
}
//# sourceMappingURL=cohere.d.ts.map