/**
 * `capture.ts` — the Phase 6 pipeline entry point.
 *
 * Orchestrates:
 *     extract → normalize → reflect(+synth?) → alpha-score → embed → persist
 *
 * Called by `subscriber.ts` whenever `episode.finalized` fires, or
 * directly by integration tests to run capture synchronously.
 *
 * Return contract: a fully populated `CaptureResult`. Failures inside
 * one stage are captured as `warnings` and we still try to persist the
 * partial rows — V7 treats missing α as α=0, which is already the SQL
 * default, so a non-fatal capture run still yields reward-propagatable
 * traces.
 */
import type { Embedder } from "../embedding/index.js";
import type { LlmClient } from "../llm/index.js";
import type { makeEmbeddingRetryQueueRepo } from "../storage/repos/embedding_retry_queue.js";
import type { makeTracesRepo } from "../storage/repos/traces.js";
import type { EpisodesRepo } from "../session/persistence.js";
import type { CaptureConfig, CaptureEventBus, CaptureInput, CaptureResult } from "./types.js";
type TracesRepo = ReturnType<typeof makeTracesRepo>;
type EmbeddingRetryQueueRepo = ReturnType<typeof makeEmbeddingRetryQueueRepo>;
export interface CaptureDeps {
    tracesRepo: TracesRepo;
    embeddingRetryQueue?: EmbeddingRetryQueueRepo;
    episodesRepo: EpisodesRepo;
    embedder: Embedder | null;
    /** Main LLM — used for per-turn lite capture (summarisation). */
    llm: LlmClient | null;
    /**
     * Dedicated LLM for the topic-end reflection + α scoring pass.
     * When the user configures a stronger model under `skillEvolver.*`,
     * this points to that model; otherwise it falls back to `llm`.
     */
    reflectLlm: LlmClient | null;
    bus: CaptureEventBus;
    cfg: CaptureConfig;
    now?: () => number;
    /**
     * Called after the lite cursor is advanced so the session layer can
     * propagate the new value into its in-memory episode snapshot. Without
     * this hook, getEpisode() returns cursor=0 on every subsequent turn and
     * runLite falls back to full extractSteps instead of the incremental path.
     */
    onLiteCursorAdvanced?: (episodeId: string, turnCount: number) => void;
}
export interface CaptureRunner {
    /**
     * Per-turn "lite" capture. Writes the trace row for any newly added
     * step in the episode with `reflection=null` + `alpha=0`. No LLM
     * reflection / α scoring here — the user can already see the memory
     * in the viewer immediately, but no "反思" pill is shown until the
     * topic-level reflect pass fires.
     *
     * Idempotent: existing traces (matched by `step.ts`) are skipped.
     * Safe to call after every `addTurn` cycle.
     */
    runLite(input: CaptureInput): Promise<CaptureResult>;
    /**
     * Lightweight memory capture. Writes one trace per user/assistant turn
     * instead of per tool/action step, and never emits `capture.done`.
     */
    runLightweight(input: CaptureInput): Promise<CaptureResult>;
    /**
     * Topic-end "reflect" capture. Runs the batch reflection scorer over
     * EVERY step of the (now-finalized) episode in one LLM call so the
     * model sees the full causal chain, then writes
     * `reflection + alpha` back onto each existing trace via
     * `tracesRepo.updateReflection`. Emits `capture.done` so the reward
     * subscriber can run `R_human` + V backprop afterwards.
     *
     * Falls back to per-step scoring when the episode exceeds
     * `cfg.batchThreshold` so the prompt can't overflow the model's
     * context window.
     */
    runReflect(input: CaptureInput): Promise<CaptureResult>;
}
export declare function createCaptureRunner(deps: CaptureDeps): CaptureRunner;
export {};
//# sourceMappingURL=capture.d.ts.map