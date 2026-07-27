/**
 * V7 §2.5.2 — LLM-driven skill crystallization.
 */
import type { LlmClient } from "../llm/types.js";
import type { Logger } from "../logger/types.js";
import type { EpisodeId, PolicyRow, SkillRow } from "../types.js";
import type { AnnotatedTrace } from "./evidence.js";
import type { RebuildLevel } from "./rebuild-level.js";
import type { SkillOutputLanguage } from "./language.js";
import type { SkillModelRefusalDetails, SkillConfig, SkillCrystallizationDraft } from "./types.js";
export interface CrystallizeInput {
    policy: PolicyRow;
    evidence: AnnotatedTrace[];
    counterExamples?: AnnotatedTrace[];
    namingSpace: string[];
    episodeId?: EpisodeId;
    mode?: "crystallize" | "rebuild";
    existingSkill?: SkillRow | null;
    incrementalEvidence?: AnnotatedTrace[];
    rebuildLevel?: RebuildLevel;
    outputLanguage?: SkillOutputLanguage;
    renameAllowed?: boolean;
}
export interface CrystallizeDeps {
    llm: LlmClient | null;
    log: Logger;
    config: SkillConfig;
    validate?: (draft: SkillCrystallizationDraft) => void;
}
export type CrystallizeResult = {
    ok: true;
    draft: SkillCrystallizationDraft;
    changedSections?: string[];
} | {
    ok: false;
    skippedReason: string;
    modelRefusal?: SkillModelRefusalDetails;
};
export declare function crystallizeDraft(input: CrystallizeInput, deps: CrystallizeDeps): Promise<CrystallizeResult>;
export declare function defaultDraftValidator(draft: SkillCrystallizationDraft): void;
//# sourceMappingURL=crystallize.d.ts.map