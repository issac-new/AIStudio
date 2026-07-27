/**
 * Persistence interfaces for `SessionManager` / `EpisodeManager`.
 *
 * The core-facing shape is intentionally thinner than the raw repositories
 * in `core/storage/repos/` — just the operations the session layer needs,
 * with session-friendly signatures. Tests inject in-memory fakes that
 * implement these interfaces without touching SQLite.
 *
 * The concrete `makeStorageBackedAdapters(...)` wires the real repos.
 */
import type { AgentKind, EpisodeId, SessionId } from "../../agent-contract/dto.js";
import type { makeEpisodesRepo, makeSessionsRepo } from "../storage/repos/index.js";
import type { EpochMs } from "../types.js";
export interface SessionRepo {
    upsertIfMissing(row: {
        id: SessionId;
        agent: AgentKind;
        ownerAgentKind?: AgentKind;
        ownerProfileId?: string;
        ownerWorkspaceId?: string | null;
        startedAt: EpochMs;
        lastSeenAt: EpochMs;
        meta: Record<string, unknown>;
    }): void;
    touchLastSeen(id: SessionId, ts: EpochMs, metaPatch?: Record<string, unknown>): void;
    getById(id: SessionId): {
        id: SessionId;
        agent: AgentKind;
        ownerAgentKind?: AgentKind;
        ownerProfileId?: string;
        ownerWorkspaceId?: string | null;
        startedAt: EpochMs;
        lastSeenAt: EpochMs;
        meta: Record<string, unknown>;
    } | null;
    listRecent(limit?: number): Array<{
        id: SessionId;
        agent: AgentKind;
        ownerAgentKind?: AgentKind;
        ownerProfileId?: string;
        ownerWorkspaceId?: string | null;
        startedAt: EpochMs;
        lastSeenAt: EpochMs;
        meta: Record<string, unknown>;
    }>;
    deleteOlderThan(cutoffMs: EpochMs): number;
}
export interface EpisodesRepo {
    insert(row: {
        id: EpisodeId;
        sessionId: SessionId;
        ownerAgentKind?: AgentKind;
        ownerProfileId?: string;
        ownerWorkspaceId?: string | null;
        startedAt: EpochMs;
        endedAt: EpochMs | null;
        traceIds: string[];
        rTask: number | null;
        status: "open" | "closed";
        meta: Record<string, unknown>;
    }): void;
    updateTraceIds(id: EpisodeId, traceIds: string[]): void;
    updateMeta(id: EpisodeId, metaPatch: Record<string, unknown>): void;
    /** Lower `started_at` to an earlier value (never moves it forward). */
    setStartedAt(id: EpisodeId, ts: EpochMs): void;
    deleteById(id: EpisodeId): void;
    close(id: EpisodeId, endedAt: EpochMs, rTask?: number, meta?: Record<string, unknown>): void;
    /**
     * Flip a closed episode back to `open` — V7 §0.1 "revision" path.
     * Idempotent for already-open episodes.
     */
    reopen(id: EpisodeId, meta?: Record<string, unknown>): void;
    getById(id: EpisodeId): unknown | null;
    getOpenForSession(sessionId: SessionId): unknown | null;
}
type SqliteSessions = ReturnType<typeof makeSessionsRepo>;
type SqliteEpisodes = ReturnType<typeof makeEpisodesRepo>;
export declare function adaptSessionsRepo(sqlite: SqliteSessions): SessionRepo;
export declare function adaptEpisodesRepo(sqlite: SqliteEpisodes): EpisodesRepo;
export {};
//# sourceMappingURL=persistence.d.ts.map