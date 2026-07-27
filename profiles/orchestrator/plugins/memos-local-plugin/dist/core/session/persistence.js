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
export function adaptSessionsRepo(sqlite) {
    return {
        upsertIfMissing(row) {
            const existing = sqlite.getById(row.id);
            if (existing)
                return;
            sqlite.upsert({
                id: row.id,
                agent: row.agent,
                ownerAgentKind: row.ownerAgentKind,
                ownerProfileId: row.ownerProfileId,
                ownerWorkspaceId: row.ownerWorkspaceId,
                startedAt: row.startedAt,
                lastSeenAt: row.lastSeenAt,
                meta: row.meta,
            });
        },
        touchLastSeen(id, ts, metaPatch) {
            const existing = sqlite.getById(id);
            const nextMeta = { ...(existing?.meta ?? {}), ...(metaPatch ?? {}) };
            sqlite.touch(id, ts, nextMeta);
        },
        getById(id) {
            const r = sqlite.getById(id);
            if (!r)
                return null;
            return {
                id: r.id,
                agent: r.agent,
                ownerAgentKind: r.ownerAgentKind,
                ownerProfileId: r.ownerProfileId,
                ownerWorkspaceId: r.ownerWorkspaceId,
                startedAt: r.startedAt,
                lastSeenAt: r.lastSeenAt,
                meta: r.meta,
            };
        },
        listRecent(limit = 50) {
            return sqlite.listRecent(limit).map((r) => ({
                id: r.id,
                agent: r.agent,
                ownerAgentKind: r.ownerAgentKind,
                ownerProfileId: r.ownerProfileId,
                ownerWorkspaceId: r.ownerWorkspaceId,
                startedAt: r.startedAt,
                lastSeenAt: r.lastSeenAt,
                meta: r.meta,
            }));
        },
        deleteOlderThan: sqlite.deleteOlderThan,
    };
}
export function adaptEpisodesRepo(sqlite) {
    return {
        insert(row) {
            sqlite.insert({
                id: row.id,
                sessionId: row.sessionId,
                ownerAgentKind: row.ownerAgentKind,
                ownerProfileId: row.ownerProfileId,
                ownerWorkspaceId: row.ownerWorkspaceId,
                startedAt: row.startedAt,
                endedAt: row.endedAt,
                traceIds: row.traceIds,
                rTask: row.rTask,
                status: row.status,
                meta: row.meta,
            });
        },
        updateTraceIds(id, traceIds) {
            sqlite.appendTrace(id, traceIds);
        },
        updateMeta(id, metaPatch) {
            sqlite.updateMeta(id, metaPatch);
        },
        setStartedAt(id, ts) {
            sqlite.setStartedAt(id, ts);
        },
        deleteById(id) {
            sqlite.deleteById(id);
        },
        close(id, endedAt, rTask, meta) {
            // CRITICAL: never use `episodes.upsert` here. The repo's upsert
            // is `INSERT OR REPLACE`, which SQLite executes as DELETE +
            // INSERT — and `traces.session_id REFERENCES sessions ON DELETE
            // CASCADE` (and `episode_id ON DELETE CASCADE`) means every
            // trace for the affected episode would be silently wiped. We
            // hit exactly that bug when topic-end reflection started writing
            // traces *before* close fired.
            //
            // The whole "close" operation needs to be incremental UPDATEs:
            //   - status / ended_at via `sqlite.close`
            //   - meta_json patched via `sqlite.updateMeta` (no replace)
            sqlite.close(id, endedAt, rTask);
            if (meta)
                sqlite.updateMeta(id, meta);
        },
        reopen(id, meta) {
            const cur = sqlite.getById(id);
            if (!cur)
                return;
            // Same hazard as `close` above — flip the status flag with a
            // surgical UPDATE rather than an upsert that would cascade-
            // delete every trace tied to this episode.
            sqlite.reopen(id);
            if (meta)
                sqlite.updateMeta(id, meta);
        },
        getById: sqlite.getById,
        getOpenForSession: sqlite.getOpenForSession,
    };
}
//# sourceMappingURL=persistence.js.map