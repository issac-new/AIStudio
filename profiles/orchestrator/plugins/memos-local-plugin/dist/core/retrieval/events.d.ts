/**
 * Retrieval-scoped event bus.
 *
 * Mirrors `createCaptureEventBus` / `createRewardEventBus`. We keep the
 * three pipelines on their own buses so that public adapters can subscribe
 * to "only retrieval" without type-unioning every kind in `core/`.
 *
 * The Phase 15 orchestrator is responsible for forwarding these to the
 * unified pipeline bus if/when the host wants one firehose.
 */
import type { AgentKind, EpochMs, InjectionPacket, RetrievalReason, SessionId, EpisodeId } from "../../agent-contract/dto.js";
import type { RetrievalStats } from "./types.js";
export type RetrievalEvent = {
    kind: "retrieval.started";
    reason: RetrievalReason;
    agent: AgentKind;
    sessionId: SessionId;
    episodeId?: EpisodeId;
    queryTags: string[];
    ts: EpochMs;
} | {
    kind: "retrieval.done";
    reason: RetrievalReason;
    agent: AgentKind;
    sessionId: SessionId;
    episodeId?: EpisodeId;
    packet: InjectionPacket;
    stats: RetrievalStats;
    ts: EpochMs;
} | {
    kind: "retrieval.failed";
    reason: RetrievalReason;
    agent: AgentKind;
    sessionId: SessionId;
    episodeId?: EpisodeId;
    error: {
        code: string;
        message: string;
    };
    ts: EpochMs;
};
export type RetrievalEventKind = RetrievalEvent["kind"];
export type RetrievalEventListener = (evt: RetrievalEvent) => void;
export interface RetrievalEventBus {
    emit(evt: RetrievalEvent): void;
    on(listener: RetrievalEventListener): () => void;
    onKind<K extends RetrievalEventKind>(kind: K, listener: (evt: Extract<RetrievalEvent, {
        kind: K;
    }>) => void): () => void;
}
export declare function createRetrievalEventBus(): RetrievalEventBus;
//# sourceMappingURL=events.d.ts.map