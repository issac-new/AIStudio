/**
 * Tier 1 — Skill retrieval (V7 §2.6).
 *
 * Skills are the "crystallised" layer. Three channels run in parallel:
 *
 *   - vec       — cosine over `skills.vec`     (semantic)
 *   - fts       — FTS5 trigram MATCH on `skills_fts(name, invocation_guide)`
 *   - pattern   — LIKE %term% fallback for short / CJK queries
 *
 * Each channel returns a ranked list; we merge by `skillId` and let the
 * `ranker` fuse them via RRF. A candidate that surfaces in multiple
 * channels gets a strong lift and is much harder to be a false positive.
 *
 * Filtering rules (cheap, mechanical — happens *before* ranking):
 *   - Only `active` + `candidate` statuses (V7 §2.6 hides `archived`).
 *   - Skill `η ≥ minSkillEta` (config).
 *   - Vector hits also need `cosine ≥ minTraceSim` (we reuse the trace
 *     floor as a conservative lower bound).
 *
 * The "should this snippet be injected?" decision lives in `ranker.ts`
 * (relative threshold + smart MMR seed) and `llm-filter.ts` (precision
 * pass), so this file stays mechanical.
 */
import type { EmbeddingVector } from "../types.js";
import type { RetrievalConfig, RetrievalEmbedder, RetrievalRepos, SkillCandidate } from "./types.js";
export interface Tier1Deps {
    repos: Pick<RetrievalRepos, "skills">;
    embedder?: RetrievalEmbedder;
    config: RetrievalConfig;
}
export type Tier1Input = {
    kind: "embedded";
    queryVec: EmbeddingVector | null;
    rawText: string;
    ftsMatch?: string | null;
    patternTerms?: readonly string[];
} | {
    kind: "raw";
    text: string;
    ftsMatch?: string | null;
    patternTerms?: readonly string[];
};
export declare function runTier1(deps: Tier1Deps, input: Tier1Input): Promise<SkillCandidate[]>;
//# sourceMappingURL=tier1-skill.d.ts.map