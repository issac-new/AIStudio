/**
 * Google Gemini generateContent API.
 *
 * Endpoint: POST <base>/models/<model>:generateContent?key=<KEY>
 *           POST <base>/models/<model>:streamGenerateContent?alt=sse&key=<KEY>
 */
import type { LlmMessage, LlmProvider, LlmProviderCtx, LlmProviderName, LlmStreamChunk, ProviderCallInput, ProviderCompletion } from "../types.js";
export declare class GeminiLlmProvider implements LlmProvider {
    readonly name: LlmProviderName;
    complete(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): Promise<ProviderCompletion>;
    stream(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): AsyncGenerator<LlmStreamChunk>;
}
//# sourceMappingURL=gemini.d.ts.map