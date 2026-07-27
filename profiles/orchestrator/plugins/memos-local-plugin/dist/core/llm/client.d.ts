/**
 * `LlmClient` — the only surface the rest of `core/` sees.
 *
 * Responsibilities:
 *   - Pick a provider from config.
 *   - Normalize `string | LlmMessage[]` inputs.
 *   - Inject JSON-mode system hints when the provider has no native mode.
 *   - Parse JSON output with `parseLlmJson` + optional schema validation,
 *     with a small (default 1) malformed-retry budget.
 *   - Host fallback: when the primary provider throws LLM_UNAVAILABLE /
 *     LLM_RATE_LIMITED / LLM_TIMEOUT and `config.fallbackToHost=true` AND
 *     the adapter has registered a `HostLlmBridge`, retry once via host.
 *   - Structured audit via `log.llm({...})` for every successful call.
 *   - Stream: provider-native when available, otherwise wrap `complete` in a
 *     single-chunk iterable so call sites don't have to branch.
 */
import type { LlmClient, LlmConfig, LlmProvider, LlmProviderName } from "./types.js";
export declare function createLlmClient(config: LlmConfig): LlmClient;
export declare function createLlmClientWithProvider(config: LlmConfig, provider: LlmProvider): LlmClient;
export declare function makeProviderFor(name: LlmProviderName): LlmProvider;
//# sourceMappingURL=client.d.ts.map