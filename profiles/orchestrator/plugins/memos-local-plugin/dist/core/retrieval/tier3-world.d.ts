/**
 * Tier 3 — World-Model retrieval (V7 §2.6 §3.1).
 *
 * Three channels mirror Tier 2:
 *
 *   - vec       — cosine over `world_model.vec`
 *   - fts       — FTS5 trigram MATCH on `world_model_fts(title, body, domain_tags)`
 *   - pattern   — LIKE %term% fallback for short / CJK queries
 *
 * Multi-channel matches get an RRF lift in `ranker.ts`. World models are
 * rare (user-scale), so total cost stays bounded even with three channels.
 */
import type { EmbeddingVector } from "../types.js";
import type { RetrievalConfig, RetrievalEmbedder, RetrievalRepos, WorldModelCandidate } from "./types.js";
export interface Tier3Deps {
    repos: Pick<RetrievalRepos, "worldModel">;
    embedder?: RetrievalEmbedder;
    config: RetrievalConfig;
}
export interface Tier3Input {
    queryVec: EmbeddingVector | null;
    ftsMatch?: string | null;
    patternTerms?: readonly string[];
}
export declare function runTier3(deps: Tier3Deps, input: Tier3Input): Promise<WorldModelCandidate[]>;
//# sourceMappingURL=tier3-world.d.ts.map