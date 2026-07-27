/**
 * `SessionManager` — the only surface adapters and the orchestrator see.
 *
 * Responsibilities:
 *   - Open / close sessions. A session is the long-lived logical
 *     connection between an agent and this plugin.
 *   - Start episodes (classifies intent, writes the row, emits events).
 *   - Add turns to the currently-open episode for a session.
 *   - Finalize / abandon episodes.
 *   - Prune idle sessions / force-close open episodes on shutdown.
 *   - Provide small readers for the viewer (listSessions, listEpisodes).
 *
 * The manager is per-process. There is no distributed coordination —
 * OpenClaw / Hermes run one plugin instance at a time.
 */
import type { AgentKind, EpisodeId, SessionId } from "../../agent-contract/dto.js";
import type { EpochMs } from "../types.js";
import { type EpisodeManager } from "./episode-manager.js";
import type { IntentClassifier } from "./intent-classifier.js";
import type { EpisodesRepo, SessionRepo } from "./persistence.js";
import type { EpisodeFinalizeInput, EpisodeSnapshot, EpisodeTurn, EpisodeTurnInput, SessionEventBus, SessionOpenInput, SessionSnapshot } from "./types.js";
export interface SessionManagerDeps {
    sessionsRepo: SessionRepo;
    episodesRepo: EpisodesRepo;
    intentClassifier: IntentClassifier;
    now?: () => EpochMs;
    /** Idle cutoff in ms. Used by `pruneIdle`. Default 24h. */
    idleCutoffMs?: number;
    /** Injected bus (for tests) or new if absent. */
    bus?: SessionEventBus;
    /** Injected episode manager (for tests). */
    episodeManager?: EpisodeManager;
    /** Lightweight memory mode closes technical episodes without reflect/reward semantics. */
    lightweightMemory?: boolean;
}
export interface StartEpisodeInput {
    sessionId: SessionId;
    /** Pre-minted id. Optional. */
    id?: EpisodeId;
    /** First user message. Required. */
    userMessage: string;
    /** Adapter-provided event time for the first user turn. */
    ts?: EpochMs;
    meta?: Record<string, unknown>;
}
export interface SessionManager {
    readonly bus: SessionEventBus;
    openSession(input: SessionOpenInput): SessionSnapshot;
    closeSession(id: SessionId, reason?: string): void;
    getSession(id: SessionId): SessionSnapshot | null;
    listSessions(limit?: number): SessionSnapshot[];
    pruneIdle(now?: EpochMs): SessionId[];
    startEpisode(input: StartEpisodeInput): Promise<EpisodeSnapshot>;
    addTurn(episodeId: EpisodeId, turn: EpisodeTurnInput): EpisodeTurn;
    finalizeEpisode(episodeId: EpisodeId, input?: EpisodeFinalizeInput): EpisodeSnapshot;
    abandonEpisode(episodeId: EpisodeId, reason: string): EpisodeSnapshot;
    discardEmptyEpisode(episodeId: EpisodeId, reason: string): EpisodeSnapshot | null;
    /** V7 §0.1 "revision" path — reopen a previously-closed episode. */
    reopenEpisode(episodeId: EpisodeId, reason: import("./types.js").TurnRelation): EpisodeSnapshot;
    hydrateEpisode(snapshot: EpisodeSnapshot): EpisodeSnapshot;
    attachTraceIds(episodeId: EpisodeId, traceIds: string[]): void;
    patchEpisodeMeta(episodeId: EpisodeId, metaPatch: Record<string, unknown>): EpisodeSnapshot;
    getEpisode(id: EpisodeId): EpisodeSnapshot | null;
    listEpisodes(sessionId: SessionId): EpisodeSnapshot[];
    listOpenEpisodes(): EpisodeSnapshot[];
    /** Shutdown path. Abandons any open episodes and closes all sessions. */
    shutdown(reason: string): void;
}
export declare function createSessionManager(deps: SessionManagerDeps): SessionManager;
export type { IntentDecision } from "./types.js";
export type { AgentKind };
//# sourceMappingURL=manager.d.ts.map