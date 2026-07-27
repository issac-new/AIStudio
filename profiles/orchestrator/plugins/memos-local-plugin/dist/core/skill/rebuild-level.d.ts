/**
 * Automatic rebuild intensity (L0 / L1 / L2) from policy drift + incremental evidence.
 */
import type { PolicyRow, SkillRow, TraceRow } from "../types.js";
export type RebuildLevel = "L0" | "L1" | "L2";
export declare function policyContentHash(policy: Pick<PolicyRow, "trigger" | "procedure" | "boundary" | "verification">): string;
export declare function readStoredPolicyContentHash(skill: SkillRow): string | null;
export interface RebuildLevelInput {
    policy: PolicyRow;
    existingSkill: SkillRow;
    /** Signature-deduped traces not in `existingSkill.evidenceAnchors`. */
    incrementalEvidence: TraceRow[];
}
export interface RebuildLevelResult {
    level: RebuildLevel;
    policyHash: string;
    previousPolicyHash: string | null;
    incrementalCount: number;
}
/**
 * L0 — policy body unchanged, no new canonical evidence: refresh retrieval text only.
 * L1 — policy unchanged, some incremental evidence: surgical edits.
 * L2 — policy body changed or ≥2 incremental traces: allow full step rewrite.
 */
export declare function computeRebuildLevel(input: RebuildLevelInput): RebuildLevelResult;
//# sourceMappingURL=rebuild-level.d.ts.map