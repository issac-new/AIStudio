/**
 * Host-delegated LLM provider. Requires an adapter to have called
 * `registerHostLlmBridge(bridge)` before the client makes a call.
 *
 * The host typically exposes one thing: prompt → text. That means:
 *   - No native streaming. We emit the whole text as a single `done: true` chunk.
 *   - No native JSON mode. `json-mode.ts` is responsible for injecting schema hints.
 *   - No stop sequences. Providers are expected to ignore `opts.stop` here.
 */
import type { LlmMessage, LlmProvider, LlmProviderCtx, LlmProviderName, LlmStreamChunk, ProviderCallInput, ProviderCompletion } from "../types.js";
export declare class HostLlmProvider implements LlmProvider {
    readonly name: LlmProviderName;
    complete(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): Promise<ProviderCompletion>;
    stream(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): AsyncGenerator<LlmStreamChunk>;
}
//# sourceMappingURL=host.d.ts.map