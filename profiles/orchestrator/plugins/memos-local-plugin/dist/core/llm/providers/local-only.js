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
import { ERROR_CODES, MemosError } from "../../../agent-contract/errors.js";
export class LocalOnlyLlmProvider {
    name = "local_only";
    async complete() {
        throw new MemosError(ERROR_CODES.LLM_UNAVAILABLE, "LLM is disabled (provider=local_only). Set config.llm.provider to enable.", { provider: this.name });
    }
}
//# sourceMappingURL=local-only.js.map