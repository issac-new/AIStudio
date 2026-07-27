import type { EpisodeId, FeedbackId, FeedbackRow, TraceId } from "../../types.js";
import type { FeedbackListFilter, StorageDb } from "../types.js";
export declare function makeFeedbackRepo(db: StorageDb): {
    insert(row: FeedbackRow): void;
    getById(id: FeedbackId): FeedbackRow | null;
    getForTrace(id: TraceId): FeedbackRow[];
    getForEpisode(id: EpisodeId): FeedbackRow[];
    list(filter?: FeedbackListFilter): FeedbackRow[];
};
//# sourceMappingURL=feedback.d.ts.map