/**
 * AWS Bedrock — Converse API.
 *
 * Endpoint is expected to be a Converse-style URL base; the actual path is
 * `${endpoint}/model/${model}/converse`.
 *
 * NOTE: Bedrock normally requires SigV4-signed requests. Users here are
 * expected to either run behind a proxy that signs, or provide a pre-signed
 * endpoint. Streaming is intentionally not implemented at this layer; call
 * sites that need tokens-per-second should route via a Converse-Stream proxy
 * with the `openai_compatible` provider pointed at it.
 */
import type { LlmMessage, LlmProvider, LlmProviderCtx, LlmProviderName, ProviderCallInput, ProviderCompletion } from "../types.js";
export declare class BedrockLlmProvider implements LlmProvider {
    readonly name: LlmProviderName;
    complete(messages: LlmMessage[], opts: ProviderCallInput, ctx: LlmProviderCtx): Promise<ProviderCompletion>;
}
//# sourceMappingURL=bedrock.d.ts.map