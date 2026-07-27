/**
 * Converts a verified crystallization draft into a `SkillRow` ready for
 * insertion via `repos.skills`.
 *
 * Structured fields live in `procedureJson` so the viewer can render every
 * facet without parsing `invocationGuide`. The invocation guide itself is a
 * deterministic markdown render of the draft — it's what the retrieval
 * injector hands to the agent's prompt.
 *
 * We also compute the skill embedding here (summary + steps + policy
 * `trigger`) so Tier-1 retrieval is vector-ready.
 */
import type { Embedder } from "../embedding/types.js";
import type { Logger } from "../logger/types.js";
import type { EpisodeId, PolicyRow, SkillRow, TraceId, WorldModelId } from "../types.js";
import type { SkillConfig, SkillCrystallizationDraft } from "./types.js";
import type { SkillOutputLanguage } from "./language.js";
export interface PackagerInput {
    draft: SkillCrystallizationDraft;
    policy: PolicyRow;
    evidenceEpisodeIds: EpisodeId[];
    /**
     * V7 §2.1 `evidence_anchors` — the L1 trace ids that justified this
     * skill at crystallisation time. Persisted onto the skill so the
     * viewer can render click-through chips back to MemoriesView and
     * future audits don't have to re-run `gatherEvidence()`.
     *
     * Best-first ordering (matches `gatherEvidence` output). Capped to
     * `EVIDENCE_ANCHORS_CAP` ids in the packager — keeps the column
     * small and the JSON roundtrip cheap.
     */
    evidenceTraceIds?: TraceId[];
    /** User query lines from top evidence traces — boosts embedding recall. */
    evidenceUserTexts?: string[];
    worldModelIds?: WorldModelId[];
    /** When rebuilding, we keep the existing skill id + accumulated trials. */
    existing?: SkillRow | null;
    outputLanguage?: SkillOutputLanguage;
}
export interface PackagerDeps {
    embedder: Embedder | null;
    log: Logger;
    config: SkillConfig;
}
export interface PackagerResult {
    row: SkillRow;
    vecSource: string;
    freshMint: boolean;
}
/**
 * Shape the draft + policy into a `SkillRow`. Does not persist.
 */
export declare function buildSkillRow(input: PackagerInput, deps: PackagerDeps): Promise<PackagerResult>;
//# sourceMappingURL=packager.d.ts.map