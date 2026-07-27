/**
 * OpenAI-compatible embeddings endpoint.
 *
 * Works with vanilla OpenAI and any drop-in API:
 *   - Azure OpenAI (set `endpoint`)
 *   - Zhipu, SiliconFlow, Bailian, Groq, etc.
 *
 * Request shape:  POST <endpoint>  { input: string[], model }
 * Response shape: { data: [{ embedding: number[] }, ...] }
 */
import type { EmbedRole, EmbeddingProvider, EmbeddingProviderName, ProviderCallCtx } from "../types.js";
export declare class OpenAiEmbeddingProvider implements EmbeddingProvider {
    readonly name: EmbeddingProviderName;
    embed(texts: string[], _role: EmbedRole, ctx: ProviderCallCtx): Promise<number[][]>;
}
//# sourceMappingURL=openai.d.ts.map