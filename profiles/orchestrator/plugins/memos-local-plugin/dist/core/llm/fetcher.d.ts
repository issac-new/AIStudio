/**
 * HTTP helpers for LLM providers.
 *
 * Similar in spirit to `core/embedding/fetcher.ts`, but LLM calls differ:
 *   - Retries on 5xx / 429 / transient network errors with exponential backoff.
 *   - Timeouts are per-call, not per-request, so streaming can take minutes.
 *   - Errors are mapped to `llm_unavailable` / `llm_rate_limited` /
 *     `llm_timeout` — the client cares which one it is.
 *   - A small SSE decoder is provided for providers that return
 *     `text/event-stream` (openai_compatible, anthropic).
 */
import type { LlmProviderLogger, LlmProviderName } from "./types.js";
export interface HttpPostOpts<TBody> {
    url: string;
    body: TBody;
    headers?: Record<string, string>;
    timeoutMs: number;
    maxRetries: number;
    signal?: AbortSignal;
    provider: LlmProviderName;
    log: LlmProviderLogger;
    onRetry?: (attempt: number) => void;
}
/**
 * Single JSON POST with retry + timeout. For streaming, see `httpPostStream`.
 */
export declare function httpPostJson<TResp>(opts: HttpPostOpts<unknown>): Promise<{
    json: TResp;
    status: number;
    durationMs: number;
}>;
/**
 * Open an HTTP POST and return the raw streaming body. The caller is
 * responsible for parsing SSE. No retries here — streaming is "either works
 * or you start over from scratch".
 */
export declare function httpPostStream(opts: {
    url: string;
    body: unknown;
    headers?: Record<string, string>;
    timeoutMs: number;
    signal?: AbortSignal;
    provider: LlmProviderName;
    log: LlmProviderLogger;
}): Promise<Response>;
/**
 * Parse a `text/event-stream` body into its raw `data:` payloads.
 * Yields each `data: …` payload as a string. Handles the "[DONE]" sentinel
 * common to OpenAI-shape providers.
 */
export declare function decodeSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string>;
//# sourceMappingURL=fetcher.d.ts.map