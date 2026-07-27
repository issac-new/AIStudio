import type { EmbeddingVector, EpisodeId, SessionId, ShareScope, TraceId, TraceRow } from "../../types.js";
import type { StorageDb, TraceListFilter } from "../types.js";
import { type VectorHit, type VectorRow } from "../vector.js";
export type TraceSearchMeta = {
    ts: number;
    priority: number;
    value: number;
    episode_id: EpisodeId;
    session_id: SessionId;
    owner_agent_kind?: string;
    owner_profile_id?: string;
    owner_workspace_id?: string | null;
    tags_json?: string;
    error_signatures_json?: string;
};
export declare function makeTracesRepo(db: StorageDb): {
    insert(row: TraceRow): void;
    upsert(row: TraceRow): void;
    updateScore(id: TraceId, scores: {
        value: number;
        alpha: number;
        rHuman?: number | null;
        priority: number;
    }): void;
    getById(id: TraceId): TraceRow | null;
    getManyByIds(ids: readonly TraceId[]): TraceRow[];
    list(filter?: TraceListFilter): TraceRow[];
    /**
     * Total row count matching the same filter (no limit/offset).
     * Used by list endpoints so the viewer can show "Page N of M".
     */
    count(filter?: Omit<TraceListFilter, "limit" | "offset">, visibility?: {
        sql: string;
        params: Record<string, unknown>;
    }): number;
    /**
     * Count distinct (episode_id, turn_id) groups — i.e. "memory turns",
     * where one user query + its tool sub-steps + final reply are
     * counted as 1. Used by the Memories viewer for accurate pagination.
     */
    countTurns(filter?: Omit<TraceListFilter, "limit" | "offset">, visibility?: {
        sql: string;
        params: Record<string, unknown>;
    }): number;
    /**
     * List paginated turn keys (episode_id, turn_id) ordered by the
     * turn's most recent trace timestamp DESC. The viewer uses this to
     * fetch a page of "memories" (1 turn = 1 memory).
     */
    listTurnKeys(filter?: TraceListFilter, visibility?: {
        sql: string;
        params: Record<string, unknown>;
    }): Array<{
        episodeId: string | null;
        turnId: number;
        maxTs: number;
    }>;
    /**
     * Fetch all traces belonging to the given (episodeId, turnId) pairs.
     * Returned rows are ordered by ts ascending so the frontend can
     * render the conversation in chronological order.
     */
    listByTurnKeys(keys: ReadonlyArray<{
        episodeId: string | null;
        turnId: number;
    }>): TraceRow[];
    /**
     * Vector top-K over `vec_summary` (or `vec_action` if `kind='action'`).
     * The caller passes any extra SQL filter (e.g. same-episode only).
     */
    searchByVector(query: EmbeddingVector, k: number, opts?: {
        kind?: "summary" | "action";
        where?: string;
        params?: Record<string, unknown>;
        hardCap?: number;
        /**
         * Tag-based pre-filter. Candidate row survives if ANY of its stored
         * tags appears in this list (`instr(tags_json, '"docker"') > 0`).
         * Pass empty or undefined to disable.
         */
        anyOfTags?: readonly string[];
    }): Array<VectorHit<string, TraceSearchMeta>>;
    /**
     * Convenience: in-memory top-K against pre-fetched rows (used when caller
     * has already filtered candidates by other criteria).
     */
    topKAgainstRows<TMeta>(query: EmbeddingVector, rows: VectorRow<TraceId, TMeta>[], k: number): Array<VectorHit<TraceId, TMeta>>;
    /**
     * Keyword channel — FTS5 trigram MATCH against `traces_fts`.
     *
     * Returns rank-ordered hits with the same `meta` shape as
     * `searchByVector` so the retrieval ranker can fuse channels via
     * RRF. We don't surface the raw FTS rank here — the caller scores
     * by reciprocal rank in `keyword.reciprocalRankScore`.
     */
    searchByText(ftsMatch: string, k: number, opts?: {
        where?: string;
        params?: Record<string, unknown>;
    }): Array<VectorHit<string, TraceSearchMeta>>;
    /**
     * Pattern channel — substring fallback for queries that fall below
     * the trigram tokenizer's window (e.g. 2-char Chinese names).
     *
     * Each term in `terms` is searched as `LIKE %term%` over the same
     * text columns the FTS index covers. Multiple terms are OR-ed.
     */
    searchByPattern(terms: readonly string[], k: number, opts?: {
        where?: string;
        params?: Record<string, unknown>;
    }): Array<VectorHit<string, TraceSearchMeta>>;
    /**
     * V7 §2.6 structural match — exact-substring lookup on stored error
     * signatures. Returns full `TraceRow` objects, newest first, capped
     * at `limit`. Case-sensitive (signatures are normalised verbatim).
     *
     * If the caller provides multiple `anyOfFragments`, rows that match
     * ANY fragment survive. Empty array returns `[]`.
     */
    searchByErrorSignature(anyOfFragments: readonly string[], limit: number, opts?: {
        where?: string;
        params?: Record<string, unknown>;
    }): TraceRow[];
    deleteById(id: TraceId): void;
    /**
     * Full episode-scoped trace fetch with NO pagination cap. The paginated
     * `list({ episodeId })` path silently truncates to 500 rows (default 50),
     * which breaks capture-side dedup when an episode has more than the cap
     * worth of steps — the next runLite/runReflect re-inserts everything past
     * the cap as "novel". Use this for any dedup / reconciliation read.
     */
    listAllForEpisode(episodeId: EpisodeId): TraceRow[];
    /**
     * Partial content patch applied by the viewer's "Edit" modal.
     * Only user-facing text fields are mutable — `ts`, `value`,
     * `alpha`, `priority`, and vectors are owned by the capture /
     * reward pipeline and must NOT be rewritten from the UI.
     */
    updateBody(id: TraceId, patch: {
        summary?: string | null;
        userText?: string;
        agentText?: string;
        tags?: readonly string[];
    }): void;
    updateVector(id: TraceId, field: "vecSummary" | "vecAction", vec: EmbeddingVector): boolean;
    /**
     * Fill in reflection + α for a trace that was previously written
     * in the "lite" capture phase (reflection=null, α=0). Invoked
     * at topic-end by the reflect-phase capture pass, which sees the
     * full causal chain and batch-scores every step of the episode
     * at once. Intentionally narrow: no other columns mutate.
     */
    updateReflection(id: TraceId, patch: {
        reflection: string | null;
        alpha: number;
    }): void;
    /**
     * Apply a share-state transition. `scope = null` un-shares. The
     * viewer calls this after (optionally) pushing the payload to
     * the Hub — so the pipeline only records local state, never
     * performs the network call itself.
     */
    updateShare(id: TraceId, share: {
        scope: ShareScope | null;
        target?: string | null;
        sharedAt?: number | null;
    }): void;
};
//# sourceMappingURL=traces.d.ts.map