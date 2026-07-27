/**
 * Google Gemini generateContent API.
 *
 * Endpoint: POST <base>/models/<model>:generateContent?key=<KEY>
 *           POST <base>/models/<model>:streamGenerateContent?alt=sse&key=<KEY>
 */
import { ERROR_CODES, MemosError } from "../../../agent-contract/errors.js";
import { decodeSse, httpPostJson, httpPostStream } from "../fetcher.js";
export class GeminiLlmProvider {
    name = "gemini";
    async complete(messages, opts, ctx) {
        const { config, log, signal } = ctx;
        if (!config.apiKey) {
            throw new MemosError(ERROR_CODES.LLM_UNAVAILABLE, "gemini provider requires config.llm.apiKey", { provider: this.name });
        }
        const model = config.model && config.model.length > 0 ? config.model : "gemini-1.5-flash";
        const base = getBase(config.endpoint);
        const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
        const body = buildGeminiBody(messages, opts);
        const { json, durationMs } = await httpPostJson({
            url,
            body,
            headers: { ...config.headers },
            timeoutMs: config.timeoutMs,
            maxRetries: config.maxRetries,
            signal,
            provider: this.name,
            log,
        });
        const cand = json.candidates?.[0];
        const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        return {
            text,
            finishReason: mapFinish(cand?.finishReason),
            usage: json.usageMetadata
                ? {
                    promptTokens: json.usageMetadata.promptTokenCount,
                    completionTokens: json.usageMetadata.candidatesTokenCount,
                    totalTokens: json.usageMetadata.totalTokenCount,
                }
                : undefined,
            durationMs,
        };
    }
    async *stream(messages, opts, ctx) {
        const { config, log, signal } = ctx;
        if (!config.apiKey) {
            throw new MemosError(ERROR_CODES.LLM_UNAVAILABLE, "gemini provider requires config.llm.apiKey", { provider: this.name });
        }
        const model = config.model && config.model.length > 0 ? config.model : "gemini-1.5-flash";
        const base = getBase(config.endpoint);
        const url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
        const body = buildGeminiBody(messages, opts);
        const resp = await httpPostStream({
            url,
            body,
            headers: { ...config.headers },
            timeoutMs: config.timeoutMs,
            signal,
            provider: this.name,
            log,
        });
        let done = false;
        for await (const payload of decodeSse(resp.body)) {
            let evt;
            try {
                evt = JSON.parse(payload);
            }
            catch {
                continue;
            }
            const cand = evt.candidates?.[0];
            const delta = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
            const finish = cand?.finishReason;
            if (delta.length > 0)
                yield { delta, done: false };
            if (finish) {
                done = true;
                yield {
                    delta: "",
                    done: true,
                    finishReason: mapFinish(finish),
                    usage: evt.usageMetadata
                        ? {
                            promptTokens: evt.usageMetadata.promptTokenCount,
                            completionTokens: evt.usageMetadata.candidatesTokenCount,
                            totalTokens: evt.usageMetadata.totalTokenCount,
                        }
                        : undefined,
                };
                return;
            }
        }
        if (!done)
            yield { delta: "", done: true };
    }
}
function getBase(endpoint) {
    if (endpoint && endpoint.length > 0)
        return endpoint.replace(/\/+$/, "");
    return "https://generativelanguage.googleapis.com/v1beta";
}
function buildGeminiBody(messages, opts) {
    const systems = [];
    const contents = [];
    for (const m of messages) {
        if (m.role === "system") {
            systems.push(m.content);
            continue;
        }
        contents.push({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        });
    }
    const generationConfig = {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
    };
    if (opts.jsonMode)
        generationConfig.responseMimeType = "application/json";
    if (opts.stop && opts.stop.length > 0)
        generationConfig.stopSequences = opts.stop;
    const body = {
        contents,
        generationConfig,
    };
    if (systems.length > 0) {
        body.systemInstruction = { parts: [{ text: systems.join("\n\n") }] };
    }
    return body;
}
function mapFinish(reason) {
    switch (reason) {
        case "STOP":
            return "stop";
        case "MAX_TOKENS":
            return "length";
        case undefined:
        case null:
            return undefined;
        default:
            return "other";
    }
}
//# sourceMappingURL=gemini.js.map