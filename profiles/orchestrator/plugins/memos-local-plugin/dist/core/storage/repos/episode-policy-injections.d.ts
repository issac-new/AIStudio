import type { EpisodeId, PolicyId } from "../../types.js";
import type { StorageDb } from "../types.js";
export declare function makeEpisodePolicyInjectionsRepo(db: StorageDb): {
    inject(args: {
        episodeId: EpisodeId;
        policyId: PolicyId;
        source?: string | null;
        now?: number;
    }): void;
    listPolicyIdsForEpisode(episodeId: EpisodeId): PolicyId[];
};
//# sourceMappingURL=episode-policy-injections.d.ts.map