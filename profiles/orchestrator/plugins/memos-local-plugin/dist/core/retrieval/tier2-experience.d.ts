import type { EmbeddingVector } from "../types.js";
import type { ExperienceCandidate, RetrievalConfig, RetrievalRepos } from "./types.js";
export interface Tier2ExperienceDeps {
    repos: Pick<RetrievalRepos, "policies">;
    config: RetrievalConfig;
}
export interface Tier2ExperienceInput {
    queryVec: EmbeddingVector | null;
    ftsMatch?: string | null;
    patternTerms?: string[];
}
export declare function runTier2Experience(deps: Tier2ExperienceDeps, input: Tier2ExperienceInput): Promise<ExperienceCandidate[]>;
//# sourceMappingURL=tier2-experience.d.ts.map