/**
 * Tiny wrapper around global `fetch` with:
 *   - per-call timeout (AbortSignal.timeout)
 *   - retry on transient failure (5xx / 429 / network error)
 *   - structured error → MemosError(code=embedding_unavailable)
 *
 * Providers should never call `fetch` directly; go through `httpPostJson`.
 */
import type { EmbeddingProviderName, ProviderLogger } from "./types.js";
export interface HttpPostOpts<TBody> {
    url: string;
    body: TBody;
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxRetries?: number;
    signal?: AbortSignal;
    provider: EmbeddingProviderName;
    log: ProviderLogger;
}
export declare function httpPostJson<TResp>(opts: HttpPostOpts<unknown>): Promise<TResp>;
//# sourceMappingURL=fetcher.d.ts.map