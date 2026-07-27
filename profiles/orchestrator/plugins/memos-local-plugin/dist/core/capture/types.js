/**
 * Internal DTOs for `core/capture`.
 *
 * These are the stage-to-stage contracts between:
 *   step-extractor → normalizer → batch-scorer (windowed binary) →
 *   embedder → traces repo
 *
 * Not exported through the plugin's public surface (adapters don't care).
 * Exposed to Phase 15 via the pipeline event bus as `CaptureResult` so the
 * orchestrator can chain reward / l2.incremental onto it.
 */
// ─── Stage 3: with a scored reflection ──────────────────────────────────────
/**
 * Fixed-enum values written into `traces.reflection` by the windowed binary
 * reflection pipeline. Anything outside this set is legacy natural-language
 * reflection text from before the 2026-05 redesign.
 */
export const REFLECTION_ENUM_LABELS = new Set([
    "RELATED",
    "PIVOTAL",
    "IRRELEVANT",
    "RELATED_DEFAULT",
]);
/**
 * Return the reflection value only when it carries free-form natural-language
 * signal — the three fixed labels are converted to `null` so downstream
 * consumers don't feed `RELATED_DEFAULT` (or similar) into LLM prompts,
 * keyword blobs, or error-signature heuristics.
 */
export function reflectionAsText(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    return REFLECTION_ENUM_LABELS.has(trimmed) ? null : value;
}
//# sourceMappingURL=types.js.map