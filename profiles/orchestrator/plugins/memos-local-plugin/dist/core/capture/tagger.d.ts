/**
 * Heuristic trace tagger.
 *
 * V7 §2.6 — "每条 trace 带有自动标注的领域标签（如 docker、pip、plugin），
 * 先按标签缩小候选集，再做语义匹配，减少检索开销。"
 *
 * We keep this cheap and deterministic (no LLM here). Tags are lowercased,
 * deduped and capped in length so they can be stored inline in
 * `traces.tags_json` and matched via `instr()`.
 *
 * Sources, in order of confidence:
 *
 *   1. Tool names       — e.g. `docker.run` → `docker`, `pip.install` → `pip`.
 *   2. Tool error codes — e.g. `E_NETWORK` → `network`.
 *   3. Agent text       — keyword dictionary (docker, database, kubernetes…).
 *
 * If more precise tagging is needed later (e.g. LLM-based intent classifier
 * in capture) it can replace this module without touching retrieval.
 */
import type { ScoredStep } from "./types.js";
/**
 * Derive tags for a single scored step. The resulting array is sorted and
 * deduped (lowercase), capped at `MAX_TAGS` entries.
 */
export declare function tagsForStep(step: ScoredStep): string[];
/** Merge tag sets from many steps into a coarse "episode-level" tag set. */
export declare function tagsForEpisode(steps: readonly ScoredStep[]): string[];
//# sourceMappingURL=tagger.d.ts.map