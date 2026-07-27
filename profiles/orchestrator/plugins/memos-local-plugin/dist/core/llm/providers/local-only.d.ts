/**
 * `local_only` provider.
 *
 * This is the "don't actually call an LLM" sentinel. Used when a user wants
 * the algorithm to degrade gracefully (heuristics only, no reflection / no
 * induction) rather than quietly billing for cloud tokens.
 *
 * It always throws `LLM_UNAVAILABLE`. Callers that can handle that fallback
 * (capture's reflection step, e.g.) will skip the LLM-dependent branch.
 */
import type { LlmProvider, LlmProviderName, ProviderCompletion } from "../types.js";
export declare class LocalOnlyLlmProvider implements LlmProvider {
    readonly name: LlmProviderName;
    complete(): Promise<ProviderCompletion>;
}
//# sourceMappingURL=local-only.d.ts.map