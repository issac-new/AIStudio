/**
 * OpenAI-compatible chat completions.
 *
 * Endpoint: POST <endpoint>/chat/completions  { model, messages, ... }
 * Works with vanilla OpenAI and any drop-in API.
 */
import { ERROR_CODES, MemosError } from "../../../agent-contract/errors.js";
import { decodeSse, httpPostJson, httpPostStream } from "../fetcher.js";
export class OpenAiLlmProvider {
    name = "openai_compatible";
    async complete(messages, opts, ctx) {
        const { config, log, signal } = ctx;
        if (!config.apiKey) {
            throw new MemosError(ERROR_CODES.LLM_UNAVAILABLE, "openai_compatible provider requires config.llm.apiKey", { provider: this.name });
        }
        const url = normalizeEndpoint(config.endpoint && config.endpoint.length > 0
            ? config.endpoint
            : "https://api.openai.com/v1/chat/completions");
        const model = config.model && config.model.length > 0 ? config.model : "gpt-4o-mini";
        const body = {
            model,
            messages,
            temperature: opts.temperature,
            max_tokens: opts.maxTokens,
        };
        if (opts.jsonMode)
            body.response_format = { type: "json_object" };
        if (opts.stop && opts.stop.length > 0)
            body.stop = opts.stop;
        const { json, durationMs } = await httpPostJson({
            url,
            body,
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                ...config.headers,
            },
            timeoutMs: config.timeoutMs,
            maxRetries: config.maxRetries,
            signal,
            provider: this.name,
            log,
        });
        const choice = json.choices?.[0];
        const text = choice?.message?.content ?? "";
        return {
            text,
            finishReason: mapFinish(choice?.finish_reason),
            usage: json.usage
                ? {
                    promptTokens: json.usage.prompt_tokens,
                    completionTokens: json.usage.completion_tokens,
                    totalTokens: json.usage.total_tokens,
                }
                : undefined,
            durationMs,
        };
    }
    async *stream(messages, opts, ctx) {
        const { config, log, signal } = ctx;
        if (!config.apiKey) {
            throw new MemosError(ERROR_CODES.LLM_UNAVAILABLE, "openai_compatible provider requires config.llm.apiKey", { provider: this.name });
        }
        const url = normalizeEndpoint(config.endpoint && config.endpoint.length > 0
            ? config.endpoint
            : "https://api.openai.com/v1/chat/completions");
        const model = config.model && config.model.length > 0 ? config.model : "gpt-4o-mini";
        const body = {
            model,
            messages,
            temperature: opts.temperature,
            max_tokens: opts.maxTokens,
            stream: true,
        };
        if (opts.jsonMode)
            body.response_format = { type: "json_object" };
        if (opts.stop && opts.stop.length > 0)
            body.stop = opts.stop;
        const resp = await httpPostStream({
            url,
            body,
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                ...config.headers,
            },
            timeoutMs: config.timeoutMs,
            signal,
            provider: this.name,
            log,
        });
        let emittedDone = false;
        for await (const payload of decodeSse(resp.body)) {
            if (payload === "[DONE]") {
                if (!emittedDone) {
                    emittedDone = true;
                    yield { delta: "", done: true };
                }
                return;
            }
            let parsed = null;
            try {
                parsed = JSON.parse(payload);
            }
            catch {
                // Provider occasionally sends keepalive lines — ignore.
                continue;
            }
            const choice = parsed.choices?.[0];
            const delta = choice?.delta?.content ?? "";
            const finish = choice?.finish_reason;
            if (delta.length > 0) {
                yield { delta, done: false };
            }
            if (finish) {
                emittedDone = true;
                yield {
                    delta: "",
                    done: true,
                    finishReason: mapFinish(finish),
                    usage: parsed.usage
                        ? {
                            promptTokens: parsed.usage.prompt_tokens,
                            completionTokens: parsed.usage.completion_tokens,
                            totalTokens: parsed.usage.total_tokens,
                        }
                        : undefined,
                };
                return;
            }
        }
        if (!emittedDone)
            yield { delta: "", done: true };
    }
}
function normalizeEndpoint(url) {
    const stripped = url.replace(/\/+$/, "");
    if (stripped.endsWith("/chat/completions"))
        return stripped;
    if (stripped.endsWith("/completions"))
        return stripped;
    return `${stripped}/chat/completions`;
}
function mapFinish(reason) {
    switch (reason) {
        case "stop":
        case "end_turn":
            return "stop";
        case "length":
        case "max_tokens":
            return "length";
        case undefined:
        case null:
            return undefined;
        default:
            return "other";
    }
}
//# sourceMappingURL=openai.js.map