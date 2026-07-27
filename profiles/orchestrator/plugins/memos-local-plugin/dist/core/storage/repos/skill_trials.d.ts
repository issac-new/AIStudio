import type { EpisodeId, SkillTrialRow } from "../../types.js";
import type { StorageDb } from "../types.js";
export declare function makeSkillTrialsRepo(db: StorageDb): {
    createPending(row: SkillTrialRow): SkillTrialRow;
    listPendingForEpisode(episodeId: EpisodeId): SkillTrialRow[];
    resolve(id: string, status: Exclude<SkillTrialRow["status"], "pending">, resolvedAt: number, evidence: Record<string, unknown>): boolean;
};
//# sourceMappingURL=skill_trials.d.ts.map