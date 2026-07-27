/**
 * Anthropic Messages API.
 *
 * Endpoint: POST <endpoint>/v1/messages  { model, messages, system?, ... }
 * Streaming: SSE events named `content_block_delta` with `{ delta: { text } }`.
 */
import type { LlmMessage, LlmProvider, LlmProviderCtx, LlmProviderName, LlmStreamChunk, ProviderCallInput, ProviderCompletion } from "../types.js";
export declare class AnthropicLlmProvider implements LlmProvider {
    readonly name: LlmProviderName;
    complete(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): Promise<ProviderCompletion>;
    stream(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): AsyncGenerator<LlmStreamChunk>;
}
//# sourceMappingURL=anthropic.d.ts.map