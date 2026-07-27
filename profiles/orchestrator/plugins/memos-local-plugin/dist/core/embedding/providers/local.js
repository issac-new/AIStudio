/**
 * Local MiniLM embeddings via `@huggingface/transformers`.
 *
 * Model: by default `Xenova/all-MiniLM-L6-v2` — 384-dim, ~23 MB on first run,
 * quantized to int8 for CPU friendliness. The model loads lazily on the first
 * call and is shared across all embedders in the process.
 *
 * Output: `pipeline("feature-extraction")` already supports mean-pooling and
 * L2-normalize via `{ pooling: "mean", normalize: true }`. We intentionally
 * don't normalize again on top of that.
 */
let extractorPromise = null;
let currentModel = null;
async function ensureExtractor(model, log) {
    if (extractorPromise && currentModel === model)
        return extractorPromise;
    if (extractorPromise && currentModel && currentModel !== model) {
        log.warn("model.swap", { from: currentModel, to: model });
        extractorPromise = null;
    }
    log.info("loading", { model });
    const t0 = Date.now();
    extractorPromise = (async () => {
        // Dynamic import keeps the heavy dep out of the hot path for tests that
        // don't need it.
        const mod = await import("@huggingface/transformers");
        const pipeline = mod.pipeline;
        const ext = (await pipeline("feature-extraction", model, {
            dtype: "q8",
            device: "cpu",
        }));
        log.info("ready", { model, durationMs: Date.now() - t0 });
        return ext;
    })().catch((err) => {
        extractorPromise = null;
        log.error("load_failed", {
            model,
            err: { name: err.name, message: err.message },
        });
        throw err;
    });
    currentModel = model;
    return extractorPromise;
}
export class LocalEmbeddingProvider {
    name = "local";
    async embed(texts, _role, ctx) {
        const { config, log } = ctx;
        const ext = await ensureExtractor(config.model, log);
        const out = [];
        for (let i = 0; i < texts.length; i++) {
            if (ctx.signal?.aborted)
                throw new DOMException("Aborted", "AbortError");
            const result = await ext(texts[i], { pooling: "mean", normalize: true });
            const arr = result.data;
            if (!arr) {
                throw new Error("[embedding.local] extractor returned no .data");
            }
            out.push(Array.from(arr));
        }
        return out;
    }
    async close() {
        // The transformers pipeline doesn't expose a .close(); GC handles it.
        extractorPromise = null;
        currentModel = null;
    }
}
// Test hook — tests can reset the cached extractor without touching internals.
export function __resetLocalExtractorForTests() {
    extractorPromise = null;
    currentModel = null;
}
//# sourceMappingURL=local.js.map