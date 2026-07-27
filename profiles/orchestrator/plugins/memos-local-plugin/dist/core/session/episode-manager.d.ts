/**
 * `EpisodeManager` — the write-path to `episodes` + `sessions`, wrapped
 * around per-episode in-memory state.
 *
 * Not visible to adapters directly — `SessionManager` wraps it and owns
 * the lifecycle. Exposed separately so Phase 15 (pipeline orchestrator)
 * can inject a custom one in tests.
 *
 * Persistence strategy:
 *   - `start`     → INSERT episodes row (status='open'), INSERT/UPSERT sessions.
 *   - `addTurn`   → in-memory only (turns persist via `traces` in Phase 6).
 *   - `finalize`  → UPDATE episodes.status='closed', endedAt, rTask.
 *   - `abandon`   → same UPDATE but tagged via meta.closeReason='abandoned'.
 *
 * The in-memory `EpisodeSnapshot` is what subscribers (orchestrator,
 * viewer SSE) receive on every event. We avoid re-reading from SQLite
 * on each turn — hot path stays in memory.
 */
import type { EpisodeId, SessionId } from "../../agent-contract/dto.js";
import type { EpochMs } from "../types.js";
import type { SessionRepo, EpisodesRepo } from "./persistence.js";
import type { EpisodeFinalizeInput, EpisodeSnapshot, EpisodeStartInput, EpisodeTurn, EpisodeTurnInput, IntentDecision, SessionEventBus } from "./types.js";
export interface EpisodeManagerDeps {
    sessionsRepo: SessionRepo;
    episodesRepo: EpisodesRepo;
    now?: () => EpochMs;
    bus: SessionEventBus;
}
export interface EpisodeManager {
    start(input: EpisodeStartInput, intent: IntentDecision): EpisodeSnapshot;
    addTurn(id: EpisodeId, turn: EpisodeTurnInput): EpisodeTurn;
    finalize(id: EpisodeId, input?: EpisodeFinalizeInput): EpisodeSnapshot;
    abandon(id: EpisodeId, reason: string): EpisodeSnapshot;
    discardEmpty(id: EpisodeId, reason: string): EpisodeSnapshot | null;
    attachTraceIds(id: EpisodeId, traceIds: string[]): void;
    hydrate(snapshot: EpisodeSnapshot): EpisodeSnapshot;
    patchMeta(id: EpisodeId, metaPatch: Record<string, unknown>): EpisodeSnapshot;
    /**
     * V7 §0.1 "revision" path: reopen a previously-finalized episode so
     * the new turn appends to the same trace set. The caller is
     * responsible for having classified the turn relation; this method
     * performs no heuristics of its own.
     *
     * Emits `episode.reopened` with the given `reason`. If the episode
     * is already open (rare — race), this is a no-op.
     */
    reopen(id: EpisodeId, reason: import("./types.js").TurnRelation): EpisodeSnapshot;
    get(id: EpisodeId): EpisodeSnapshot | null;
    listOpen(): EpisodeSnapshot[];
    listForSession(sessionId: SessionId): EpisodeSnapshot[];
}
export declare function createEpisodeManager(deps: EpisodeManagerDeps): EpisodeManager;
//# sourceMappingURL=episode-manager.d.ts.map