/**
 * OpenAI-compatible chat completions.
 *
 * Endpoint: POST <endpoint>/chat/completions  { model, messages, ... }
 * Works with vanilla OpenAI and any drop-in API.
 */
import type { LlmMessage, LlmProvider, LlmProviderCtx, LlmProviderName, LlmStreamChunk, ProviderCallInput, ProviderCompletion } from "../types.js";
export declare class OpenAiLlmProvider implements LlmProvider {
    readonly name: LlmProviderName;
    complete(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): Promise<ProviderCompletion>;
    stream(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): AsyncGenerator<LlmStreamChunk>;
}
//# sourceMappingURL=openai.d.ts.map