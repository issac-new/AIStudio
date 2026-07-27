import type { EpisodeId, PolicyId, TraceId } from "../../types.js";
import type { StorageDb } from "../types.js";
export declare function makeTracePolicyLinksRepo(db: StorageDb): {
    link(args: {
        traceId: TraceId;
        policyId: PolicyId;
        episodeId: EpisodeId;
        now?: number;
    }): void;
    getWithTraceIds(policyId: PolicyId): TraceId[];
    getLinkedEpisodeIds(policyId: PolicyId): EpisodeId[];
};
//# sourceMappingURL=trace-policy-links.d.ts.map