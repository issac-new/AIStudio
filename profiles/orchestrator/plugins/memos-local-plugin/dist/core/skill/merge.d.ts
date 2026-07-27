/**
 * Field-level merge for rebuild drafts so L0/L1 do not blindly overwrite SOP steps.
 */
import type { SkillCrystallizationDraft, SkillProcedure } from "./types.js";
import type { RebuildLevel } from "./rebuild-level.js";
export type RebuildSection = "retrieval_blurb" | "summary" | "steps" | "parameters" | "preconditions" | "examples" | "decision_guidance" | "tools" | "tags";
export declare function procedureFromSkillRow(procedureJson: unknown): SkillProcedure | null;
export declare function existingSkillSnapshot(proc: SkillProcedure | null, lockName: string): {
    name: string;
    summary: string;
    retrieval_blurb: string;
    step_titles: string[];
    decision_guidance: {
        preference: string[];
        anti_pattern: string[];
    };
} | null;
export declare function mergeRebuildDraft(draft: SkillCrystallizationDraft, existing: SkillProcedure | null, opts: {
    level: RebuildLevel;
    lockName?: string;
    changedSections?: string[];
}): SkillCrystallizationDraft;
//# sourceMappingURL=merge.d.ts.map